-- Сохранение: файл игры Defold (sys.save) с отложенной записью: частые изменения склеиваются в одну.
-- Формат данных как в JS (v = 3), поэтому позже его можно переносить через Telegram CloudStorage.
local M = {}
local S = {}
S.__index = S

local function path() return sys.get_save_file('ghostfarm', 'save_v1') end

function M.new() return setmetatable({ pending = nil, timer = nil }, S) end

function S:load()
	local ok, t = pcall(sys.load, path())
	if ok and t and t.seed then return t end
	return nil
end

function S:schedule(get, delay)
	self.pending = get
	if self.timer then timer.cancel(self.timer) end
	self.timer = timer.delay(delay or 1.5, false, function() self.timer = nil; self:flush() end)
end

function S:flush()
	if self.timer then timer.cancel(self.timer); self.timer = nil end
	if not self.pending or self.disabled then return end
	local data = self.pending()
	self.pending = nil
	local ok, err = pcall(sys.save, path(), data)
	if not ok then print('save failed', err) end
end

function S:reset()
	self.disabled = true
	pcall(sys.save, path(), {})
end

return M
