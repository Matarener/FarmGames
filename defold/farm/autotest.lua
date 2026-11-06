-- Автотест без мыши: запускается, если движок стартовал с --config=farm.autotest=1.
-- Шлёт в игру настоящие события ввода (сначала интерфейсу, потом карте — как движок),
-- проходит панели, кнопки, тапы по миру, камеру и случайные нажатия, а всё печатает в лог:
--   AUTOTEST step ...   — что сейчас делается
--   AUTOTEST ERROR ...  — ошибка с трассировкой (тест идёт дальше)
--   AUTOTEST DONE ...   — итог, после чего игра закрывается.
-- Сохранение в этом режиме отдельное (save_test) и не трогает обычную игру.
local app = require('farm.app')
local M = {}
local T = {}
T.__index = T

local H_TOUCH, H_MULTI = hash('touch'), hash('multitouch')
local H_WUP, H_WDOWN, H_BACK = hash('wheel_up'), hash('wheel_down'), hash('back')

function M.enabled() return sys.get_config_int('farm.autotest', 0) == 1 end

function M.new(main_self, main_input)
	app.test_gui_q, app.test_map_q, app.test_errors = {}, {}, 0
	local t = setmetatable({ ms = main_self, main_input = main_input, errors = 0, steps = 0, taps = 0, wait_t = 0 }, T)
	t.co = coroutine.create(function() t:run() end)
	return t
end

local function log(...) print('AUTOTEST', ...) end

-- выполнить с перехватом ошибки (зовут и main.script, и интерфейс)
function M.guard(what, fn, ...)
	local ok, err = xpcall(fn, debug.traceback, ...)
	if not ok then
		app.test_errors = (app.test_errors or 0) + 1
		log('ERROR', what, err)
	end
	return ok
end

function T:guard(what, fn, ...)
	local ok, err = xpcall(fn, debug.traceback, ...)
	if not ok then
		self.errors = self.errors + 1
		log('ERROR', what, err)
	end
	return ok
end

-- одно событие ввода: экранные точки (сверху слева) → пиксели окна, как у движка
function T:send(id, sx, sy, pressed, released, extra)
	local a = extra or {}
	if sx then
		a.screen_x, a.screen_y = sx * app.dpi, app.H - sy * app.dpi
		a.x, a.y = a.screen_x, a.screen_y
	end
	a.pressed, a.released = pressed or false, released or false
	a.value = (pressed or not released) and 1 or 0
	-- интерфейс разбирает очередь в своём update (gui.* можно звать только оттуда),
	-- а необработанное передаёт карте через app.test_map_q
	app.test_gui_q[#app.test_gui_q + 1] = { id, a }
end

function T:wait(sec)
	local t = 0
	while t < sec do t = t + coroutine.yield() end
end

function T:tap(sx, sy, what)
	self.taps = self.taps + 1
	self:send(H_TOUCH, sx, sy, true, false)
	self:wait(0.05)
	self:send(H_TOUCH, sx, sy, false, true)
	self:wait(0.25)
end

function T:back() self:send(H_BACK, nil, nil, true, false); self:wait(0.1); self:send(H_BACK, nil, nil, false, true); self:wait(0.2) end

function T:drag(x0, y0, x1, y1, n)
	n = n or 12
	self:send(H_TOUCH, x0, y0, true, false)
	for i = 1, n do
		self:wait(0.016)
		self:send(H_TOUCH, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)
	end
	self:send(H_TOUCH, x1, y1, false, true)
	self:wait(0.4)
end

function T:wheel(up, sx, sy, n)
	for _ = 1, n or 3 do
		self:send(up and H_WUP or H_WDOWN, sx, sy, true, false)
		self:wait(0.05)
	end
	self:wait(0.2)
end

function T:pinch(cx, cy, d0, d1)
	local function at(d)
		return { touch = {
			{ id = 0, screen_x = (cx - d / 2) * app.dpi, screen_y = app.H - cy * app.dpi, x = (cx - d / 2) * app.dpi, y = app.H - cy * app.dpi },
			{ id = 1, screen_x = (cx + d / 2) * app.dpi, screen_y = app.H - cy * app.dpi, x = (cx + d / 2) * app.dpi, y = app.H - cy * app.dpi },
		} }
	end
	for i = 0, 10 do
		self:send(H_MULTI, nil, nil, i == 0, false, at(d0 + (d1 - d0) * i / 10))
		self:wait(0.016)
	end
	self:send(H_MULTI, nil, nil, false, true, { touch = {} })
	self:wait(0.3)
end

-- кнопки интерфейса: копия списка нажатий (центр в экранных точках)
function T:hits(pred)
	local out = {}
	local g = app.gui_state and app.gui_state()
	if not g then return out end
	for i, h in ipairs(g.hits) do
		local x, y = (h[1] + h[3]) / 2, (h[2] + h[4]) / 2
		if h[7] then y = y - (g.scroll or 0) end
		local w, hh = h[3] - h[1], h[4] - h[2]
		local full = w >= (app.cam.view_w - 2) and hh >= (app.cam.view_h - 2)
		if not full and (not pred or pred(h, i)) then out[#out + 1] = { x = x, y = y, layer = h[6], tag = h[8], i = i } end
	end
	return out
end

function T:panel_open() local g = app.gui_state and app.gui_state(); return g and (g.panel ~= nil) end
function T:popup_open() local g = app.gui_state and app.gui_state(); return g and (g.popup ~= nil) end

-- нажать каждую кнопку слоя по очереди; reopen() заново открывает окно, если кнопка его закрыла
function T:press_all(layer, reopen, name)
	local list = self:hits(function(h) return h[6] == layer end)
	log('step', name, layer .. ' buttons:', #list)
	for k = 1, #list do
		local cur = self:hits(function(h) return h[6] == layer end)
		local b = cur[k]
		if not b then break end
		self.steps = self.steps + 1
		log('step', name, 'button', k, 'at', math.floor(b.x), math.floor(b.y))
		self:tap(b.x, b.y)
		self:wait(0.3)
		if reopen and not self:panel_open() and not (app.gui_state().more) then reopen(); self:wait(0.3) end
	end
end

function T:nav(tag)
	local b = self:hits(function(h) return h[8] == tag end)[1]
	if not b then log('ERROR', 'no hud button', tag); self.errors = self.errors + 1; return false end
	log('step', 'nav', tag)
	self:tap(b.x, b.y)
	self:wait(0.4)
	return true
end

function T:wait_player(max)
	local t = 0
	local p = app.farm.player
	while p:busy() and t < (max or 8) do t = t + coroutine.yield() end
	self:wait(0.2)
end

-- тапнуть точку мира, а если открылось меню — пройти все его пункты
function T:tap_world(wx, wy, what)
	local sx, sy = app.cam:world_to_screen(wx, wy)
	if sx < 4 or sy < 90 or sx > app.cam.view_w - 4 or sy > app.cam.view_h - 80 then
		app.cam:center_on(wx, wy); self:wait(0.1)
		sx, sy = app.cam:world_to_screen(wx, wy)
	end
	self.steps = self.steps + 1
	log('step', 'world', what, math.floor(sx), math.floor(sy))
	self:tap(sx, sy)
	self:wait(0.3)
	if self:panel_open() then
		self:press_all('pbody', nil, what .. ' panel')
		if self:panel_open() then self:back() end
	elseif self:popup_open() then
		local items = self:hits(function(h) return h[6] == 'popup' end)
		-- первый — подложка меню, остальное пункты; берём по одному, открывая меню заново
		for k = 2, #items do
			if not self:popup_open() then self:tap(sx, sy); self:wait(0.3) end
			local cur = self:hits(function(h) return h[6] == 'popup' end)
			if cur[k] then log('step', what, 'popup item', k - 1); self:tap(cur[k].x, cur[k].y); self:wait_player(6) end
		end
		if self:popup_open() then self:back() end
	end
	self:wait_player(8)
end

function T:run()
	local f = app.farm
	self:wait(1.5)
	log('start', 'window', app.W, app.H, 'dpi', app.dpi, 'view', app.cam.view_w, app.cam.view_h)
	-- запас ресурсов, чтобы проверить покупки и действия
	f.st.coins, f.st.gems, f.st.energy = 5000, 200, 999

	-- 1. стартовое окно задания
	if self:panel_open() then self:press_all('pbody', nil, 'intro quest') end
	if self:panel_open() then self:back() end

	-- 2. панели снизу и сверху
	local function reopen(tag) return function() self:nav(tag) end end
	for _, tag in ipairs({ 'bag', 'market', 'house' }) do
		if self:nav(tag) then
			self:press_all('pbody', reopen(tag), tag)
			if self:panel_open() then self:back() end
		end
	end
	if self:nav('more') then
		local n = #self:hits(function(h) return h[6] == 'more' end)
		for k = 2, n do
			local g = app.gui_state()
			if not g.more then self:nav('more') end
			local cur = self:hits(function(h) return h[6] == 'more' end)
			if cur[k] then log('step', 'more item', k - 1); self:tap(cur[k].x, cur[k].y); self:wait(0.4) end
			if self:panel_open() then self:press_all('pbody', nil, 'more ' .. (k - 1)); if self:panel_open() then self:back() end end
		end
		if app.gui_state().more then self:back(); self:tap(app.cam.view_w / 2, app.cam.view_h / 2) end
	end
	-- шестерёнка настроек, карточка задания, кнопка «к призраку»
	for _, h in ipairs(self:hits(function(h) return h[6] == 'hud' and not h[8] end)) do
		log('step', 'hud button at', math.floor(h.x), math.floor(h.y))
		self:tap(h.x, h.y); self:wait(0.4)
		if self:panel_open() then self:press_all('pbody', nil, 'hud panel'); if self:panel_open() then self:back() end end
	end
	for _, h in ipairs(self:hits(function(h) return h[6] == 'quest' end)) do
		log('step', 'quest card'); self:tap(h.x, h.y); self:wait(0.4)
		if self:panel_open() then self:press_all('pbody', nil, 'quest'); if self:panel_open() then self:back() end end
	end

	-- 3. мир: призрак, грядки, объекты рядом, плитки вокруг
	local w = f.world
	local px, py = f.player:world_pos()
	self:tap_world(px, py, 'ghost')
	for i, b in pairs(f.beds) do self:tap_world(b.wx, b.wy, 'bed ' .. i) end
	local near = {}
	local gx, gy = f.player:tx(), f.player:ty()
	for _, o in pairs(w.objects) do
		local d = math.abs(o.gx - gx) + math.abs(o.gy - gy)
		if d < 14 then near[#near + 1] = { o = o, d = d } end
	end
	table.sort(near, function(a, b) return a.d < b.d end)
	local seen = {}
	for _, e in ipairs(near) do
		local ty = e.o.type
		seen[ty] = (seen[ty] or 0) + 1
		if seen[ty] <= 2 then self:tap_world(e.o.wx, e.o.wy, 'obj ' .. ty) end
	end
	-- клетки вокруг: трава, вода, закрытый участок
	for dy = -6, 6, 3 do
		for dx = -6, 6, 3 do
			local wx, wy = require('farm.iso').to_world(gx + dx + 0.5, gy + dy + 0.5)
			self:tap_world(wx, wy, 'tile ' .. (gx + dx) .. ',' .. (gy + dy))
		end
	end
	-- урожай: даём время вырасти
	log('step', 'grow wait')
	self:wait(5)
	for i, b in pairs(f.beds) do self:tap_world(b.wx, b.wy, 'bed again ' .. i) end

	-- 4. камера
	local cx, cy = app.cam.view_w / 2, app.cam.view_h / 2
	log('step', 'pan'); self:drag(cx, cy, cx - 150, cy - 100); self:drag(cx, cy, cx + 250, cy + 200, 6)
	log('step', 'wheel'); self:wheel(true, cx, cy, 8); self:wheel(false, cx, cy, 14); self:wheel(true, cx, cy, 6)
	log('step', 'pinch'); self:pinch(cx, cy, 80, 260); self:pinch(cx, cy, 260, 60)

	-- 5. случайные нажатия по всему экрану
	math.randomseed(7)
	log('step', 'monkey')
	for k = 1, 250 do
		local r = math.random()
		local x, y = math.random() * app.cam.view_w, math.random() * app.cam.view_h
		if r < 0.75 then self:tap(x, y)
		elseif r < 0.85 then self:drag(x, y, x + (math.random() - 0.5) * 200, y + (math.random() - 0.5) * 200, 5)
		elseif r < 0.92 then self:wheel(math.random() < 0.5, x, y, 2)
		else self:back() end
		if k % 50 == 0 then log('step', 'monkey', k, 'energy', f.st.energy, 'coins', f.st.coins) end
	end
	self:wait(1)
	log('DONE', 'errors', self.errors + app.test_errors, 'taps', self.taps, 'steps', self.steps)
	self.done = true
end

function T:update(dt)
	if self.done then
		self.exit_t = (self.exit_t or 0) + dt
		if self.exit_t > 0.5 and not self.exited then self.exited = true; sys.exit((self.errors + app.test_errors) > 0 and 1 or 0) end
		return
	end
	local ok, err = coroutine.resume(self.co, dt)
	if not ok then
		self.errors = self.errors + 1
		log('ERROR', 'autotest crashed', err, debug.traceback(self.co))
		log('DONE', 'errors', self.errors + app.test_errors, 'taps', self.taps, 'steps', self.steps)
		self.done = true
	elseif coroutine.status(self.co) == 'dead' then self.done = true end
end

return M
