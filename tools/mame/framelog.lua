-- per-frame display lists + palette RAM mirror
local OUT = os.getenv("TRACE_OUT")
local FRAMES = tonumber(os.getenv("TRACE_FRAMES") or "6000")
local EVERY = tonumber(os.getenv("TRACE_EVERY") or "10")
local INPUTS = os.getenv("TRACE_INPUTS") -- optional lua file defining inputs(frame, setin)
local sp = manager.machine.devices[":maincpu"].spaces["program"]
local regs = {}
for i=0,9 do regs[i]=0 end
local pal = {}
for i=0,4095 do pal[i]=0 end
local frame = 0
local blits = {}
local f = io.open(OUT, "w")
local function ondma(offset, data, mask)
  local r = ((offset & 0xff) // 16)
  regs[r] = data
  if r == 0 and (data & 0x8000) ~= 0 and (frame % EVERY == 0) then
    blits[#blits+1] = string.format("[%d,%d,%d,%d,%d,%d,%d,%d,%d]", data, regs[2] | (regs[3] << 16), regs[6], regs[7], (regs[1]~0x8000)-0x8000, (regs[4]~0x8000)-0x8000, (regs[5]~0x8000)-0x8000, regs[8], regs[9])
  end
  return data
end
t1 = sp:install_write_tap(0x01a00000, 0x01a0009f, "dma", ondma)
t2 = sp:install_write_tap(0x01a80000, 0x01a8009f, "dma2", ondma)
t3 = sp:install_write_tap(0x01800000, 0x0181ffff, "pal", function(offset, data, mask)
  pal[((offset - 0x01800000) // 16) & 4095] = data
  paldirty = true
end)
paldirty = true
local function setin(port, name, v)
  local p = manager.machine.ioport.ports[port]
  if p and p.fields[name] then p.fields[name]:set_value(v) end
end
local inputs = nil
if INPUTS then inputs = dofile(INPUTS) end
emu.register_frame_done(function()
  if frame % EVERY == 0 then
    local t = {}
    local ps = ""
    if paldirty then
      for i=0,4095 do t[#t+1] = string.format("%04x", pal[i]) end
      ps = string.format(',"pal":"%s"', table.concat(t))
      paldirty = false
    end
    f:write(string.format('{"frame":%d,"blits":[%s]%s}\n', frame, table.concat(blits, ","), ps))
    blits = {}
    if frame % 300 == 0 then manager.machine.video:snapshot() end
  end
  if inputs then inputs(frame, setin) end
  frame = frame + 1
  if frame >= FRAMES then f:close(); manager.machine:exit() end
end)
