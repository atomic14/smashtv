-- One-off: start a two-player game and, at frame AT, log one frame of blits (with the
-- blitter palette register) and the palette RAM, in bossrun.lua's line format, to find
-- the palette player 2 is drawn with. OUT=file.jsonl
local sp = manager.machine.devices[":maincpu"].spaces["program"]
local AT = tonumber(os.getenv("AT") or "2400")
local regs, frame, blits, pal = {}, 0, {}, {}
for i = 0, 9 do regs[i] = 0 end
for i = 0, 4095 do pal[i] = 0 end
local function ondma(offset, data)
  local r = (offset & 0xff) // 16
  regs[r] = data
  if r == 0 and (data & 0x8000) ~= 0 and frame == AT then
    blits[#blits + 1] = string.format("[%d,%d,%d,%d,%d,%d,%d,%d,%d]", data, regs[2] | (regs[3] << 16), regs[6], regs[7],
      0, (regs[4] ~ 0x8000) - 0x8000, (regs[5] ~ 0x8000) - 0x8000, regs[8], regs[9])
  end
  return data
end
t1 = sp:install_write_tap(0x01a00000, 0x01a0009f, "dma", ondma)
t2 = sp:install_write_tap(0x01a80000, 0x01a8009f, "dma2", ondma)
t3 = sp:install_write_tap(0x01800000, 0x0181ffff, "pal", function(offset, data)
  pal[((offset - 0x01800000) // 16) & 4095] = data
end)
local function setin(name, v)
  local p = manager.machine.ioport.ports[":IN1"]
  if p.fields[name] then p.fields[name]:set_value(v) end
end
emu.register_frame_done(function()
  frame = frame + 1
  for _, e in ipairs({ { 1200, "Coin 1", 1 }, { 1210, "Coin 1", 0 }, { 1230, "Coin 1", 1 }, { 1240, "Coin 1", 0 },
    { 1300, "1 Player Start", 1 }, { 1310, "1 Player Start", 0 }, { 1330, "2 Players Start", 1 }, { 1340, "2 Players Start", 0 } }) do
    if frame == e[1] then setin(e[2], e[3]) end
  end
  if frame == AT + 1 then
    local t = {}
    for i = 0, 4095 do t[#t + 1] = string.format("%04x", pal[i]) end
    local f = io.open(os.getenv("OUT") or "p2.jsonl", "w")
    f:write(string.format('{"frame":%d,"blits":[%s],"pal":"%s"}\n', frame, table.concat(blits, ","), table.concat(t)))
    f:close()
    manager.machine.video:snapshot()
    manager.machine:exit()
  end
end)
