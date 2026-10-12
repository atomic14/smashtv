-- One-off (load via waverun's PROBE=): print the room number (RAM 10EB630) and world
-- (10EB610) with the camera cell whenever either changes.
local sp = manager.machine.devices[":maincpu"].spaces["program"]
local function r32(a) return sp:read_u16(a) | (sp:read_u16(a + 16) << 16) end
local last, n = "", 0
emu.register_frame_done(function()
  n = n + 1
  local camX, camY = r32(0x01000240) >> 16, r32(0x01000260) >> 16
  local col = math.floor((camX - 472) / 472.25 + 0.5)
  local row = math.floor((camY - 5) / 332.4 + 0.5)
  local k = string.format("world %d room %d cell %d,%d", sp:read_u16(0x010eb610), sp:read_u16(0x010eb630), col, row)
  if k ~= last then print("probe " .. n .. " " .. k); last = k end
  if n > tonumber(os.getenv("UNTIL") or "200000") then manager.machine:exit() end
end)
