-- Drive the original game through its worlds and record every boss fight.
--   OUT=boss mame smashtv -autoboot_script tools/mame/bossrun.lua      (writes boss_w<N>.jsonl)
-- Optional: START_WORLD=2 jumps straight into world 2 (patching the room list after
-- start), LAST_WORLD=3 stops after that world, RECORD=<frames> per boss.
--
-- The player is kept alive by pinning the lives counter (RAM 01086360). Navigation uses
-- the world grid decoded from the ROM (see worlds.json): the current cell comes from the
-- camera (RAM 01000240/01000260), and once a room's exits open the bot heads for the door
-- on the shortest corridor route to the boss, falling back to other doors if it stays shut.
local sp = manager.machine.devices[":maincpu"].spaces["program"]
local START = tonumber(os.getenv("START_WORLD") or "1")
local LAST = tonumber(os.getenv("LAST_WORLD") or "3")
local RECORD = tonumber(os.getenv("RECORD") or "9000")
local OUT = os.getenv("OUT") or "boss"

-- corridors (col,row,col,row) and boss cells per world, from public/assets/worlds.json
local WORLD = {
  { goals = { { 4, 1 } }, links = "1,0,2,0;2,0,3,0;-1,1,0,1;0,1,1,1;2,1,3,1;3,1,4,1;1,2,2,2;1,0,1,1;2,0,2,1;3,0,3,1;1,1,1,2;2,1,2,2" },
  { goals = { { 4, 2 } }, links = "2,0,3,0;0,1,1,1;1,1,2,1;2,1,3,1;-1,2,0,2;0,2,1,2;1,2,2,2;3,2,4,2;0,3,1,3;1,3,2,3;2,3,3,3;2,4,3,4;2,0,2,1;3,0,3,1;0,1,0,2;1,1,1,2;2,1,2,2;3,1,3,2;0,2,0,3;1,2,1,3;2,2,2,3;3,2,3,3;2,3,2,4;3,3,3,4" },
  -- world 3: Cobra Death, then on through the gauntlet to the host at (7,2)
  { goals = { { 4, 2 }, { 7, 2 } }, links = "2,0,3,0;0,1,1,1;1,1,2,1;2,1,3,1;-1,2,0,2;0,2,1,2;1,2,2,2;3,2,4,2;4,2,5,2;5,2,6,2;6,2,7,2;0,3,1,3;1,3,2,3;2,3,3,3;2,4,3,4;2,0,2,1;3,0,3,1;0,1,0,2;1,1,1,2;2,1,2,2;3,1,3,2;0,2,0,3;1,2,1,3;2,2,2,3;3,2,3,3;6,2,6,3;2,3,2,4;3,3,3,4" },
}
local LISTS = { 0xffe726b0, 0xffe72d10, 0xffe737f0 }
for _, w in ipairs(WORLD) do
  w.adj = {}
  for a, b, c, d in string.gmatch(w.links, "(-?%d+),(-?%d+),(-?%d+),(-?%d+)") do
    local p, q = a .. "," .. b, c .. "," .. d
    w.adj[p] = w.adj[p] or {}; w.adj[q] = w.adj[q] or {}
    table.insert(w.adj[p], { tonumber(c), tonumber(d) })
    table.insert(w.adj[q], { tonumber(a), tonumber(b) })
  end
end

local function r32(a) return sp:read_u16(a) | (sp:read_u16(a + 16) << 16) end
local function w32(a, v) sp:write_u16(a, v & 0xffff); sp:write_u16(a + 16, (v >> 16) & 0xffff) end
local function setin(name, v)
  for _, port in ipairs({ ":IN0", ":IN1" }) do
    local p = manager.machine.ioport.ports[port]
    if p and p.fields[name] then p.fields[name]:set_value(v) end
  end
end

-- shortest-path first step from cell (c,r) to the boss, as a door letter
local function firstStep(w, c, r, g)
  local goal = g[1] .. "," .. g[2]
  local start = c .. "," .. r
  local prev, queue = { [start] = false }, { { c, r } }
  while #queue > 0 do
    local cur = table.remove(queue, 1)
    local k = cur[1] .. "," .. cur[2]
    if k == goal then
      while prev[k] and prev[k].from ~= start do k = prev[k].from end
      if not prev[k] then return nil end
      local nc, nr = string.match(k, "(-?%d+),(-?%d+)")
      nc, nr = tonumber(nc), tonumber(nr)
      if nc > c then return "R" elseif nc < c then return "L" elseif nr < r then return "U" else return "D" end
    end
    for _, n in ipairs(w.adj[k] or {}) do
      local nk = n[1] .. "," .. n[2]
      if prev[nk] == nil then prev[nk] = { from = k }; table.insert(queue, n) end
    end
  end
end

-- blitter tap: player feet, exit markers, a crude target, and the display list when recording
local regs, frame = {}, 0
for i = 0, 9 do regs[i] = 0 end
local feet, exits, blits = nil, false, {}
local bigX, bigY, bigN = 0, 0, 0
local recording, recStart, out = false, 0, nil
local pal, paldirty = {}, true
for i = 0, 4095 do pal[i] = 0 end
local function ondma(offset, data)
  local r = (offset & 0xff) // 16
  regs[r] = data
  if r ~= 0 or (data & 0x8000) == 0 then return data end
  local off = regs[2] | (regs[3] << 16)
  local x, y = (regs[4] ~ 0x8000) - 0x8000, (regs[5] ~ 0x8000) - 0x8000
  local w, h = regs[6], regs[7]
  if regs[8] == 0 and off >= 0x02102500 and off < 0x02118d20 then feet = { x = x + 4, y = y + 20 } end
  if (off >= 0x0213a200 and off < 0x0213ab00) or (off >= 0x0256a2a0 and off < 0x0256a9a0) then exits = true end
  -- big non-background sprites (bosses): background blocks use palettes 0101/4444
  if w * h >= 600 and regs[8] ~= 0x0101 and regs[8] ~= 0x4444 and regs[8] ~= 0 and y > 20 then
    bigX, bigY, bigN = bigX + x + w / 2, bigY + y + h / 2, bigN + 1
  end
  if recording then
    blits[#blits + 1] = string.format("[%d,%d,%d,%d,%d,%d,%d,%d,%d]", data, off, w, h,
      (regs[1] ~ 0x8000) - 0x8000, x, y, regs[8], regs[9])
  end
  return data
end
t1 = sp:install_write_tap(0x01a00000, 0x01a0009f, "dma", ondma)
t2 = sp:install_write_tap(0x01a80000, 0x01a8009f, "dma2", ondma)
t3 = sp:install_write_tap(0x01800000, 0x0181ffff, "pal", function(offset, data)
  pal[((offset - 0x01800000) // 16) & 4095] = data
  paldirty = true
end)

local FIRE8 = {
  { "P1 Fire Up" }, { "P1 Fire Up", "P1 Fire Right" }, { "P1 Fire Right" }, { "P1 Fire Down", "P1 Fire Right" },
  { "P1 Fire Down" }, { "P1 Fire Down", "P1 Fire Left" }, { "P1 Fire Left" }, { "P1 Fire Up", "P1 Fire Left" },
}
local DOOR = { R = { x = 400, y = 150 }, L = { x = 0, y = 150 }, U = { x = 205, y = 30 }, D = { x = 205, y = 270 } }
local ORDER = { "R", "D", "U", "L" }
local MOVE = { "P1 Move Up", "P1 Move Down", "P1 Move Left", "P1 Move Right" }
local FIRE = { "P1 Fire Up", "P1 Fire Down", "P1 Fire Left", "P1 Fire Right" }
local cellKey, exitFrames, curWorld, goal = "", 0, 0, 1

emu.register_frame_done(function()
  frame = frame + 1
  if frame == 1200 then setin("Coin 1", 1) end
  if frame == 1210 then setin("Coin 1", 0) end
  if frame == 1300 then setin("1 Player Start", 1) end
  if frame == 1310 then setin("1 Player Start", 0) end
  if frame == 1450 and START > 1 then
    sp:write_u16(0x010eb610, START)
    w32(0x010dd4e0, LISTS[START])
  end
  if frame < 1500 then return end
  sp:write_u16(0x01086360, 5)

  -- which world's room list is active (the world number in RAM is not a reliable guide)
  local list, world = r32(0x010dd4e0), 0
  for i, l in ipairs(LISTS) do if l == list then world = i end end
  local W = WORLD[world]
  if world ~= 0 and world ~= curWorld then
    print(string.format("frame %d world %d (ram %d)", frame, world, sp:read_u16(0x010eb610)))
    if recording then out:close(); recording = false end
    curWorld = world
    goal = 1
    if world > LAST then manager.machine:exit() return end
  end
  local camX, camY = r32(0x01000240) >> 16, r32(0x01000260) >> 16
  local col = math.floor((camX - 472) / 472.25 + 0.5)
  local row = math.floor((camY - 5) / 332.4 + 0.5)
  local k = col .. "," .. row
  if k ~= cellKey then
    -- leaving a goal room means that goal is done
    local g = W and W.goals[goal]
    if g and cellKey == g[1] .. "," .. g[2] then goal = goal + 1 end
    cellKey = k
    exitFrames = 0
    print(string.format("frame %d cell %s", frame, k))
    for _, gg in ipairs(W and W.goals or {}) do
      if col == gg[1] and row == gg[2] and not recording then
        if out then out:close() end
        out = io.open(string.format("%s_w%d_%d_%d.jsonl", OUT, world, col, row), "w")
        recording, recStart = true, frame
        print("recording " .. k .. " of world " .. world)
      end
    end
  end

  for _, n in ipairs(MOVE) do setin(n, 0) end
  for _, n in ipairs(FIRE) do setin(n, 0) end
  -- aim at the biggest sprites on screen (the boss) when there are any, else sweep
  local fdir = (frame // 6) % 8 + 1
  if bigN > 0 and feet then
    local ax, ay = bigX / bigN - feet.x, bigY / bigN - (feet.y - 14)
    fdir = math.floor((math.atan(ax, -ay) / (math.pi / 4)) + 0.5) % 8 + 1
  end
  for _, n in ipairs(FIRE8[fdir]) do setin(n, 1) end

  if feet then
    local target
    if exits and W then
      exitFrames = exitFrames + 1
      local choice = W.goals[goal] and firstStep(W, col, row, W.goals[goal]) or "R"
      local tries = exitFrames // 1200
      if tries > 0 then choice = ORDER[(tries - 1) % 4 + 1] end
      local d = DOOR[choice]
      target = { x = d.x, y = d.y }
      if choice == "R" or choice == "L" then
        if math.abs(feet.y - d.y) > 6 then target.x = feet.x end
      elseif math.abs(feet.x - d.x) > 6 then
        target.y = feet.y
      end
    else
      target = { x = 205 + 70 * math.sin(frame / 90), y = 165 + 45 * math.cos(frame / 70) }
    end
    if target.x > feet.x + 3 then setin("P1 Move Right", 1) end
    if target.x < feet.x - 3 then setin("P1 Move Left", 1) end
    if target.y > feet.y + 3 then setin("P1 Move Down", 1) end
    if target.y < feet.y - 3 then setin("P1 Move Up", 1) end
  end
  if frame % 300 == 0 then manager.machine.video:snapshot() end

  if recording then
    local ps = ""
    if paldirty then
      local t = {}
      for i = 0, 4095 do t[#t + 1] = string.format("%04x", pal[i]) end
      ps = string.format(',"pal":"%s"', table.concat(t))
      paldirty = false
    end
    out:write(string.format('{"frame":%d,"blits":[%s]%s}\n', frame, table.concat(blits, ","), ps))
    if frame - recStart > RECORD then out:close(); out = nil; recording = false end
  end
  blits = {}
  feet, exits = nil, false
  bigX, bigY, bigN = 0, 0, 0
  if frame > 700000 then manager.machine:exit() end
end)
