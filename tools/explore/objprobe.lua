-- One-off: at frame AT, for each grunt process (id EC) report which object list holds its
-- object (+C0) and that object's z and image.
local sp = manager.machine.devices[":maincpu"].spaces["program"]
local AT = tonumber(os.getenv("AT") or "3758")
local function r32(a) return sp:read_u16(a) | (sp:read_u16(a + 16) << 16) end
local n = 0
emu.register_frame_done(function()
  n = n + 1
  if n ~= AT then return end
  local where = {}
  for _, head in ipairs({ 0x01000040, 0x01000060, 0x010000a0 }) do
    local o, k = r32(head), 0
    while o ~= 0 and k < 1000 do k = k + 1; where[o] = head; o = r32(o) end
    print(string.format("list %08x: %d", head, k))
  end
  local p = r32(0x01000000)
  while p ~= 0 do
    if sp:read_u16(p + 0x20) == 0xec then
      local o = r32(p + 0xc0)
      print(string.format("proc %08x obj %08x in %s z %04x img %08x", p, o, where[o] and string.format("%08x", where[o]) or "none",
        sp:read_u16(o + 0xa0), r32(o + 0x130)))
    end
    p = r32(p)
  end
  manager.machine:exit()
end)
