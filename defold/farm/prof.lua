-- Профайлер: время Lua по частям кадра, частота кадров, фризы (долгие кадры) с причиной.
-- Включается в Настройки → Графика → «Счётчик кадров». Текст для экрана — M.text.
local M = { on = false, text = '', freezes = {} }
local clock = socket.gettime
local cur = { logic = 0, view = 0, hud = 0 }
local sum = { logic = 0, view = 0, hud = 0 }
local NAMES = { logic = 'логика', view = 'мир', hud = 'интерфейс' }
local n, tsum, tmax, acc = 0, 0, 0, 0

function M.now() return clock() end
function M.add(k, t0) if M.on then cur[k] = cur[k] + (clock() - t0) * 1000 end end

local function f1(v) return string.format('%.1f', v) end

-- в начале кадра (main.script): dt — длина прошлого кадра, cur — его работа
function M.frame(dt, view)
	if not M.on then return end
	local ms = dt * 1000
	local lua = cur.logic + cur.view + cur.hud
	if ms > 50 and n > 0 then
		local tag, big = nil, 0
		for k, v in pairs(cur) do if v > big then big, tag = v, k end end
		local why = (big > ms * 0.4) and NAMES[tag] or 'движок'
		table.insert(M.freezes, 1, math.floor(ms + 0.5) .. ' мс (' .. why .. ')')
		while #M.freezes > 4 do table.remove(M.freezes) end
	end
	n = n + 1; tsum = tsum + ms; tmax = math.max(tmax, ms); acc = acc + dt
	for k, v in pairs(cur) do sum[k] = sum[k] + v; cur[k] = 0 end
	if acc >= 0.5 then
		local fps = n / acc
		local lines = {
			'FPS ' .. math.floor(fps + 0.5) .. '   кадр ' .. f1(tsum / n) .. ' мс, макс ' .. math.floor(tmax + 0.5),
			'Lua: логика ' .. f1(sum.logic / n) .. ', мир ' .. f1(sum.view / n) .. ', интерфейс ' .. f1(sum.hud / n) .. ' мс',
			'Спрайтов на экране: ' .. (view and view.n_on or 0) .. ' из ' .. (view and view.n_all or 0),
			'Память Lua: ' .. f1(collectgarbage('count') / 1024) .. ' МБ',
			'Фризы: ' .. (#M.freezes > 0 and table.concat(M.freezes, ', ') or 'нет'),
		}
		M.extra_line = M.extra_line or ''
		if M.extra_line ~= '' then lines[#lines + 1] = M.extra_line end
		M.text = table.concat(lines, '\n')
		n, tsum, tmax, acc = 0, 0, 0, 0
		for k in pairs(sum) do sum[k] = 0 end
	end
end

function M.set(on)
	M.on = on
	if not on then M.text = ''; M.freezes = {} end
	n, tsum, tmax, acc = 0, 0, 0, 0
	for k in pairs(cur) do cur[k] = 0; sum[k] = 0 end
end

return M
