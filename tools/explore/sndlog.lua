-- One-off (via waverun's PROBE=): print every sound command the main CPU sends
-- (0xFF00|cmd writes to 0x01E00000) with the frame number and lives changes; SNAPS=f1,f2
-- takes snapshots at those frames.
local sp = manager.machine.devices[":maincpu"].spaces["program"]
local n = 0
local tap = sp:install_write_tap(0x01e00000, 0x01e0000f, "snd", function(offset, data)
  if (data & 0xff00) == 0xff00 then print(string.format("snd frame %d cmd %02x", n, data & 0xff)) end
  return data
end)
local lastLives = -1
emu.register_frame_done(function()
  n = n + 1
  local l = sp:read_u16(0x01086360)
  if l ~= lastLives then print(string.format("snd frame %d lives %d", n, l)); lastLives = l end
  for f in (os.getenv("SNAPS") or ""):gmatch("%d+") do
    if n == tonumber(f) then manager.machine.video:snapshot() end
  end
  if n > tonumber(os.getenv("UNTIL") or "40000") then manager.machine:exit() end
end)
_G.sndtap = tap
