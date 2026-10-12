-- Record sound-board commands. Writes are queued one per frame so that each
-- latch change reaches the sound CPU (MAME's latch uses a single sync timer).
local sp = manager.machine.devices[":maincpu"].spaces["program"]
local LEN = tonumber(os.getenv("LEN") or "4")
local CMDS = {}
for c in string.gmatch(os.getenv("CMDS") or "", "%x+") do CMDS[#CMDS+1] = tonumber(c, 16) end
if #CMDS == 0 then for c=1,255 do CMDS[#CMDS+1]=c end end
local STOP = tonumber(os.getenv("STOP") or "0", 16)
local f = io.open(os.getenv("OUT"), "w")
local q = {}
local function cmd(c, mark) q[#q+1] = {0xfd00 | c}; q[#q+1] = {0xff00 | c, mark} end
local frame, idx, nextt = 0, 0, nil
local mine, last = false, 0xff00
-- swallow the game's own sound writes once we take over
tap = sp:install_write_tap(0x01e00000, 0x01e0001f, "snd", function(offset, data, mask)
  if mine or frame < 1200 then last = data; return data end
  return last
end)
emu.register_frame_done(function()
  frame = frame + 1
  local t = manager.machine.time:as_double()
  if #q > 0 then
    local e = table.remove(q, 1)
    mine = true; sp:write_u16(0x01e00000, e[1]); mine = false
    if e[2] then f:write(string.format("%d %.6f\n", e[2], t)); f:flush() end
    return
  end
  if frame < 1200 then return end
  if not nextt then
    cmd(0x20); cmd(0x60); nextt = t + 0.5; return
  end
  if t >= nextt then
    idx = idx + 1
    if idx > #CMDS then f:close(); manager.machine:exit(); return end
    cmd(STOP); cmd(CMDS[idx], CMDS[idx])
    nextt = t + LEN
  end
end)
