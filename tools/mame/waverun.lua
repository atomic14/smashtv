-- Drive the original game through every room it can reach and record each one: per frame,
-- the live processes and the gameplay objects, the player's position and whether the exits
-- are open. Used to recover enemy mixes, spawn timing and speeds for the regular rooms.
--
-- RAM layout (bit addresses):
--   01000000  active process list. Process: +0 link, +20 id (16), +C0 object (A8)
--   01000040, 01000060  the two gameplay object lists. Object: +0 link, +20/+40 x/y
--             velocity (16.16), +60/+80 x/y position (16.16, world), +A0 z, +B0 flags,
--             +130 image header
--   010EB610 world, 010EB630 room number, 010DE5D8 live grunts, 010DE560 grunt cap,
--   010DDEF0  the room's 8 wave slots of 6 words [type, count, p1, interval, p2, timer]
--   01000240/01000260  camera x/y (16.16)
--   OUT=dir/room PREF=RDUL mame smashtv -autoboot_script tools/mame/waverun.lua
-- Writes <OUT>_w<world>_<col>_<row>.jsonl per room. PREF orders the doors the bot prefers,
-- so runs with different preferences cover different routes. Boss rooms are fought but
-- not recorded (bossrun.lua does that).
local sp = manager.machine.devices[":maincpu"].spaces["program"]
local START = tonumber(os.getenv("START_WORLD") or "1")
local LAST = tonumber(os.getenv("LAST_WORLD") or "3")
local OUT = os.getenv("OUT") or "room"
local PREF = os.getenv("PREF") or "RDUL"

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
local function s32(a) local v = r32(a) if v >= 0x80000000 then v = v - 0x100000000 end return v end
local function w32(a, v) sp:write_u16(a, v & 0xffff); sp:write_u16(a + 16, (v >> 16) & 0xffff) end
local function setin(name, v)
  for _, port in ipairs({ ":IN0", ":IN1" }) do
    local p = manager.machine.ioport.ports[port]
    if p and p.fields[name] then p.fields[name]:set_value(v) end
  end
end

local visited = {}
local function isGoal(w, k)
  for _, g in ipairs(w.goals) do if g[1] .. "," .. g[2] == k then return true end end
  return false
end
-- shortest-path first step from cell (c,r) to the nearest unvisited non-boss cell, else to
-- the boss g, as a door letter
local function firstStep(w, c, r, g)
  local start = c .. "," .. r
  local goal = g[1] .. "," .. g[2]
  do
    local seen, queue = { [start] = true }, { { c, r } }
    while #queue > 0 do
      local cur = table.remove(queue, 1)
      local k = cur[1] .. "," .. cur[2]
      if k ~= start and not visited[k] and not isGoal(w, k) and cur[1] >= 0 then goal = k break end
      local ns = {}
      for _, n in ipairs(w.adj[k] or {}) do ns[#ns + 1] = n end
      table.sort(ns, function(a, b)
        local da = a[1] > cur[1] and "R" or a[1] < cur[1] and "L" or a[2] < cur[2] and "U" or "D"
        local db = b[1] > cur[1] and "R" or b[1] < cur[1] and "L" or b[2] < cur[2] and "U" or "D"
        return PREF:find(da) < PREF:find(db)
      end)
      for _, n in ipairs(ns) do
        local nk = n[1] .. "," .. n[2]
        if not seen[nk] and not (isGoal(w, nk) and nk ~= goal) then seen[nk] = true; table.insert(queue, n) end
      end
    end
  end
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
  return data
end
t1 = sp:install_write_tap(0x01a00000, 0x01a0009f, "dma", ondma)
t2 = sp:install_write_tap(0x01a80000, 0x01a8009f, "dma2", ondma)

local FIRE8 = {
  { "P1 Fire Up" }, { "P1 Fire Up", "P1 Fire Right" }, { "P1 Fire Right" }, { "P1 Fire Down", "P1 Fire Right" },
  { "P1 Fire Down" }, { "P1 Fire Down", "P1 Fire Left" }, { "P1 Fire Left" }, { "P1 Fire Up", "P1 Fire Left" },
}
local DOOR = { R = { x = 400, y = 150 }, L = { x = 0, y = 150 }, U = { x = 205, y = 30 }, D = { x = 205, y = 270 } }
local ORDER = {}
for ch in PREF:gmatch(".") do ORDER[#ORDER + 1] = ch end
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
    if recording then out:close(); out = nil; recording = false end
    visited = {}
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
    if out then out:close(); out = nil end
    recording = false
    if W and not isGoal(W, k) and not visited[k] then
      out = io.open(string.format("%s_w%d_%d_%d.jsonl", OUT, world, col, row), "w")
      recording, recStart = true, frame
    end
    visited[k] = true
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

  if recording then
    local procs, objs = {}, {}
    local p, k = r32(0x01000000), 0
    while p ~= 0 and k < 400 do
      k = k + 1
      procs[#procs + 1] = string.format("[%d,%d,%d]", sp:read_u16(p + 0x20), p & 0xffffff, r32(p + 0xc0) & 0xffffff)
      p = r32(p)
    end
    local cx, cy = r32(0x01000240) / 65536, r32(0x01000260) / 65536
    local extra = ""
    if frame % 4 == 0 then
      for _, head in ipairs({ 0x01000040, 0x01000060 }) do
        local o = r32(head)
        k = 0
        while o ~= 0 and k < 400 do
          k = k + 1
          local img = r32(o + 0x130)
          if img ~= 0 and sp:read_u16(o + 0xa0) < 0x7f00 then
            objs[#objs + 1] = string.format("[%d,%d,%.1f,%.1f,%.3f,%.3f]", o & 0xffffff, img & 0xffffff,
              s32(o + 0x60) / 65536 - cx, s32(o + 0x80) / 65536 - cy, s32(o + 0x20) / 65536, s32(o + 0x40) / 65536)
          end
          o = r32(o)
        end
      end
      local slots = {}
      for i = 0, 47 do slots[#slots + 1] = sp:read_u16(0x010ddef0 + i * 16) end
      extra = string.format(',"room":%d,"alive":%d,"cap":%d,"slots":[%s],"ob":[%s]', sp:read_u16(0x010eb630),
        sp:read_u16(0x010de5d8), sp:read_u16(0x010de560) & 0xff, table.concat(slots, ","), table.concat(objs, ","))
    end
    out:write(string.format('{"f":%d,"t":%d,"p":[%d,%d],"x":%d,"pr":[%s]%s}\n', frame, frame - recStart,
      feet and feet.x or -1, feet and feet.y or -1, exits and 1 or 0, table.concat(procs, ","), extra))
  end
  blits = {}
  feet, exits = nil, false
  bigX, bigY, bigN = 0, 0, 0
  if frame > 700000 then manager.machine:exit() end
end)

-- PROBE=<file.lua> runs an extra script alongside (e.g. a RAM dump at a given frame)
if os.getenv("PROBE") then dofile(os.getenv("PROBE")) end
