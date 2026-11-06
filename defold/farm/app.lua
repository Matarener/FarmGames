-- Общее состояние между main.script (мир) и gui/hud.gui_script (интерфейс): в проекте
-- shared_state = 1, поэтому модуль один на оба скрипта.
-- Функции gui.* можно звать только из скрипта интерфейса, поэтому логика фермы шлёт
-- интерфейсу команды через очередь (ui-прокси), а интерфейс разбирает её в своём update.
local M = { farm = nil, cam = nil, view = nil, dpi = 1, W = 1, H = 1, queue = {}, ui_busy = false }

M.ui = setmetatable({}, { __index = function(_, name)
	return function(_, ...)
		M.queue[#M.queue + 1] = { name, { ... }, n = select('#', ...) }
	end
end })

-- экранные точки интерфейса (сверху слева) → мировые координаты
function M.screen_to_world(sx, sy) return M.cam:screen_to_world(sx, sy) end
function M.world_to_screen(wx, wy) return M.cam:world_to_screen(wx, wy) end

return M
