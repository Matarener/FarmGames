-- Логика фермы (перенос src/game/Farm.js без отрисовки): состояние игрока, взаимодействия,
-- рост растений, действия, эффекты. Рисует farm/view.lua, интерфейс — gui/hud.gui_script.
-- Модуль не зависит от Defold: его можно проверить обычным Lua.
local data = require('farm.data')
local iso = require('farm.iso')
local util = require('farm.util')
local W = require('farm.world')
local P = require('farm.player')
local quests = require('farm.quests')
local ghost_data = require('farm.ghost_data')

local CROPS, GOODS, OBJECTS, ENERGY, HOUSE = data.CROPS, data.GOODS, data.OBJECTS, data.ENERGY, data.HOUSE
local N, CHUNK, CHUNKS, T = W.N, W.CHUNK, W.CHUNKS, W.T
local fmt_time = util.fmt_time

local M = {}
local Farm = {}
Farm.__index = Farm

-- ui — объект с методами интерфейса; пустые заглушки, пока интерфейс не подключён
local NOUI = setmetatable({}, { __index = function() return function() end end })

function M.new(opts)
	local self = setmetatable({}, Farm)
	opts = opts or {}
	self.ui = opts.ui or NOUI
	self.audio = opts.audio
	self.now = opts.now or function() return os.time() * 1000 end -- миллисекунды, как Date.now()
	self.cam = opts.cam
	self.save = opts.save
	self.low = opts.low -- слабое устройство: меньше частиц
	self.map = opts.map -- нарисованная карта (farm/map.lua) или nil — тогда мир генерируется
	self.particles, self.floaters = {}, {}
	self.hover, self.tap_fx = nil, nil
	self.time = 0
	self.quests = quests.new(self)
	self.ground_v = 0 -- растёт, когда меняются клетки земли
	return self
end

-- ---------------- Состояние ----------------

function Farm:init(saved)
	local seed = saved and saved.seed or math.random(0, 2 ^ 31 - 1)
	self.world = W.new(seed, self.map)
	local w = self.world
	self.beds = {}
	self.st = {
		coins = data.START.coins, gems = data.START.gems, xp = 0, level = 1,
		energy = data.START.energy, energyAt = self.now(), can = 0, house = 1, well = 0,
		inv = { wood = 0, stone = 0, ore = 0 }, seeds = { carrot = 4 }, crops = {},
		stats = { cleared = 0, harvested = 0 },
	}
	local px, py = w.player_start[1], w.player_start[2]
	if saved and (saved.v == 1 or saved.v == 2 or saved.v == 3) then
		for k, v in pairs(saved.st or {}) do self.st[k] = v end
		-- «разница» объектов подходит, только если карта та же (при правке карты объекты берутся с неё заново)
		if saved.objects and saved.v ~= 2 and saved.map_sig == w.map_sig then w:import_objects(saved.objects) end
		if saved.chunks then for _, c in ipairs(saved.chunks) do w.unlocked[c] = 1 end end
		if self.st.movedBeds then for _, i in ipairs(w.start_beds) do w.tiles[i] = T.GRASS end end
		if self.st.paths then
			for i = 0, N * N - 1 do if w.tiles[i] == T.PATH then w.tiles[i] = T.GRASS end end
			for _, i in ipairs(self.st.paths) do if w.tiles[i] == T.GRASS and w.occ[i] < 0 then w.tiles[i] = T.PATH end end
		end
		for _, b in ipairs(saved.beds or {}) do
			local i = b[1]
			-- грядка, на месте которой по новой карте стоит объект или вода, пропадает
			if w.occ[i] < 0 and w.tiles[i] ~= T.WATER then
				w.tiles[i] = T.SOIL
				local bed = self:bed_at(i)
				bed.crop = (b[2] ~= '' and b[2]) or nil; bed.p = b[3]; bed.w = b[4]
			end
		end
		if saved.player and w:walkable(saved.player[1], saved.player[2]) then px, py = saved.player[1], saved.player[2] end
		local away = math.max(0, (self.now() - (saved.t or self.now())) / 1000)
		if away > 0 then self:grow(away) end
		self.away_sec = away
	else
		for _, i in ipairs(w.start_beds) do self:bed_at(i) end
		-- одна грядка уже посажена и созрела: первое задание — собрать её
		local b = self:bed_at(w.start_beds[1]); b.crop = 'carrot'; b.p = CROPS.carrot.time; b.w = 2
		self.st.can = 2
	end
	if not self.st.movedBeds then
		for _, i in ipairs(w.start_beds) do if w.tiles[i] ~= T.SOIL then w.tiles[i] = T.SOIL; self:bed_at(i) end end
	end
	-- переставленные постройки
	local pos = self.st.pos or {}
	local house
	for id = 0, w.nobj - 1 do local o = w.objects[id]; if o and o.type == 'house' then house = o; break end end
	local own = {}
	if house then own[#own + 1] = house end
	if w.well then own[#own + 1] = w.well end
	local home = {}
	for k, o in ipairs(own) do home[k] = { o.gx, o.gy } end
	for _, o in ipairs(own) do w:lift(o) end
	for k, o in ipairs(own) do
		local at = pos[o.type]
		if at and w:free_for(o, at[1], at[2]) then w:put(o, at[1], at[2])
		elseif w:free_for(o, home[k][1], home[k][2]) then w:put(o, home[k][1], home[k][2]) end
	end
	w:fix_well()
	-- старые сохранения: первое задание ещё не выполнено — стартовая морковка созревает сразу
	if saved and (self.st.stats.harvested or 0) == 0 and not (self.st.quest and self.st.quest.i > 0) then
		local b = self.beds[w.start_beds[1]]
		if b and b.crop == 'carrot' then b.p = CROPS.carrot.time; b.w = 2 end
	end
	self.house = house
	self.player = P.new(w, ghost_data, px, py)
	self.player.handlers = {
		can_start = function(a) return self:can_start(a) end,
		perform = function(a) return self:perform(a) end,
		started = function(a) if a.kind == 'fish' then self:sfx('cast') end end,
		fail = function(a, why) self:toast(why == 'path' and 'Туда не пройти' or 'Не получается') end,
	}
	self:update_bounds()
	if self.cam then
		local x, y = self.player:world_pos()
		self.cam:center_on(x, y - 20)
	end
	self:tick_energy()
	self.ui:update(self)
end

function Farm:serialize()
	local beds = {}
	for i, b in pairs(self.beds) do
		if self.world.tiles[i] == T.SOIL then beds[#beds + 1] = { i, b.crop or '', util.round(b.p), b.w } end
	end
	table.sort(beds, function(a, b) return a[1] < b[1] end)
	local chunks = {}
	for c = 0, CHUNKS * CHUNKS - 1 do if self.world.unlocked[c] == 1 then chunks[#chunks + 1] = c end end
	return { v = 3, seed = self.world.seed, map_sig = self.world.map_sig, st = self.st, objects = self.world:export_objects(), chunks = chunks, beds = beds,
		player = { self.player:tx(), self.player:ty() }, t = self.now() }
end

function Farm:changed()
	self.quests:check()
	self.ui:update(self)
	if self.save then self.save:schedule(function() return self:serialize() end) end
end

function Farm:bed_at(i)
	local b = self.beds[i]
	if not b then
		local x, y = i % N, math.floor(i / N)
		local wx, wy = iso.to_world(x + 0.5, y + 0.5)
		b = { i = i, x = x, y = y, crop = nil, p = 0, w = 0, wx = wx, wy = wy }
		self.beds[i] = b
	end
	return b
end

function Farm:crop_info(b)
	local c = CROPS[b.crop]
	local total = c.time
	local ready = b.p >= total
	local stage = ready and 3 or math.min(2, math.floor((b.p / total) * 3))
	local needs_water = (not ready) and (b.w == 0 or (b.w == 1 and b.p >= total * 2 / 3))
	return { c = c, total = total, ready = ready, stage = stage, needs_water = needs_water, left = math.max(0, total - b.p) }
end

-- без создания таблицы (для каждого кадра): стадия, готово, нужен полив
function Farm:crop_flags(b)
	local total = CROPS[b.crop].time
	local ready = b.p >= total
	local stage = ready and 3 or math.min(2, math.floor((b.p / total) * 3))
	local needs_water = (not ready) and (b.w == 0 or (b.w == 1 and b.p >= total * 2 / 3))
	return stage, ready, needs_water
end

function Farm:grow(dt)
	for _, b in pairs(self.beds) do
		if b.crop then
			local total = CROPS[b.crop].time
			local limit = b.w >= 2 and total or (b.w >= 1 and total * 2 / 3 or 0)
			if b.p < limit then b.p = math.min(limit, b.p + dt) end
		end
	end
end

function Farm:max_energy() return HOUSE[self.st.house].energy end
function Farm:can_max() return HOUSE[self.st.house].can end

function Farm:tick_energy()
	local st, now, period = self.st, self.now(), data.ENERGY_REGEN_SEC * 1000
	if st.energy >= self:max_energy() then st.energyAt = now; return end
	local gain = math.floor((now - st.energyAt) / period)
	if gain > 0 then
		st.energy = math.min(self:max_energy(), st.energy + gain)
		st.energyAt = st.energyAt + gain * period
		if st.energy >= self:max_energy() then st.energyAt = now end
		self.ui:update(self)
	end
end

function Farm:energy_left_sec() return math.ceil((data.ENERGY_REGEN_SEC * 1000 - (self.now() - self.st.energyAt)) / 1000) end

function Farm:spend(cost)
	if self.st.energy < cost then self:toast('Не хватает энергии. Съешьте что-нибудь из рюкзака или подождите.', 'warn'); return false end
	if self.st.energy >= self:max_energy() then self.st.energyAt = self.now() end
	self.st.energy = self.st.energy - cost
	return true
end

function Farm:add_item(group, key, n)
	local bag = self.st[group]
	local have = bag[key] or 0
	local add = group == 'seeds' and n or math.max(0, math.min(n, data.STORAGE - have))
	bag[key] = have + add
	if add < n then self:toast('Склад полон. Улучшите дом, чтобы хранить больше.', 'warn') end
	return add
end

function Farm:add_xp(n)
	local st = self.st
	st.xp = st.xp + n
	while st.xp >= data.xp_to_next(st.level) do
		st.xp = st.xp - data.xp_to_next(st.level)
		st.level = st.level + 1
		st.gems = st.gems + 1
		st.coins = st.coins + st.level * 10
		local opened = {}
		for _, c in ipairs(data.CROP_LIST) do if c.level == st.level then opened[#opened + 1] = c.name end end
		self.ui:level_up(st.level, opened, st.level * 10)
		self:sfx('level')
		self.player:celebrate()
	end
end

-- ---------------- Ввод ----------------

-- wx, wy — мировые координаты точки нажатия; sx, sy — экранные (для всплывающего меню)
function Farm:on_tap(wx, wy, sx, sy, picked)
	self.ui:close_popup()
	local fx, fy = iso.to_grid(wx, wy)
	local gx, gy = math.floor(fx), math.floor(fy)
	self.tap_fx = { x = gx, y = gy, t = 0.35 }
	local w = self.world
	-- объект в выделенной клетке важнее спрайта, который её перекрывает сверху
	local o = w:object_at(gx, gy)
	if not o then
		o = picked
		if o and w:inside(gx, gy) and w:is_open(gx, gy) and (not w:is_open(o.gx, o.gy) or w:tile(gx, gy) == T.WATER) then o = nil end
	end
	if o then self:tap_object(o, sx, sy) else self:tap_tile(gx, gy, sx, sy) end
end

function Farm:tap_object(o, sx, sy)
	local w = self.world
	if not w:is_open(o.gx, o.gy) then return self:expand_popup(w:chunk_of(o.gx, o.gy), sx, sy) end
	if o.type == 'house' then return self.ui:house_panel() end
	if o.type == 'well' then return self:well_popup(o, sx, sy) end
	local def = OBJECTS[o.type]
	if def and def.action then self:queue({ kind = def.action, obj = o }) end
end

function Farm:tap_tile(x, y, sx, sy)
	local w = self.world
	if not w:inside(x, y) then return end
	if not w:is_open(x, y) then return self:expand_popup(w:chunk_of(x, y), sx, sy) end
	local t = w:tile(x, y)
	if t == T.WATER then
		return self.ui:popup(sx, sy, { items = {
			{ icon = 'water', label = 'Набрать воды', sub = self.st.can .. '/' .. self:can_max(), disabled = self.st.can >= self:can_max(),
				on_click = function() self:queue({ kind = 'fill', x = x, y = y }) end },
			{ icon = 'fish', label = 'Рыбачить', sub = { { icon = 'energy' }, ' ' .. ENERGY.fish }, on_click = function() self:queue({ kind = 'fish', x = x, y = y }) end },
		} })
	end
	if t == T.SOIL then return self:tap_bed(self:bed_at(w:idx(x, y)), sx, sy) end
	if w.occ[w:idx(x, y)] >= 0 then return end
	local items = { { icon = 'walk', label = 'Идти сюда', on_click = function() self:queue({ kind = 'walk', x = x, y = y }) end } }
	if t == T.GRASS then
		items[#items + 1] = { icon = 'dig', label = 'Вскопать грядку', sub = { { icon = 'energy' }, ' ' .. ENERGY.dig }, on_click = function() self:queue({ kind = 'dig', x = x, y = y }) end }
	end
	-- одно действие (например, дорожка: только «идти») — выполняем сразу, без меню
	if #items == 1 then self.ui:close_popup(); return items[1].on_click() end
	self.ui:popup(sx, sy, { items = items })
end

function Farm:well_popup(o, sx, sy)
	if self.st.well > 0 then
		return self.ui:popup(sx, sy, { title = 'Колодец', items = {
			{ icon = 'water', label = 'Набрать воды', sub = self.st.can .. '/' .. self:can_max(), disabled = self.st.can >= self:can_max(),
				on_click = function() self:queue({ kind = 'fill', x = o.gx, y = o.gy }) end },
		} })
	end
	self.ui:popup(sx, sy, {
		title = 'Старый колодец', text = 'Бабушкин колодец развалился. Если починить, воду можно будет набирать прямо у грядок.',
		cost = data.WELL_COST, items = { { icon = 'water', label = 'Починить', disabled = not self:can_pay(data.WELL_COST), on_click = function() self:repair_well() end } },
	})
end

function Farm:repair_well()
	local o = self.world.well
	if not o or self.st.well > 0 or not self:pay(data.WELL_COST) then return false end
	self.st.well = 1
	self:burst(o.wx, o.wy - 20, '#9fd8f5', 20)
	self:float(o.wx, o.wy - 60, 'Колодец починен!', nil)
	self:sfx('unlock')
	self:add_xp(5)
	self.player:celebrate()
	self.world.version = self.world.version + 1
	self:changed()
	return true
end

function Farm:is_well(x, y)
	local o = self.world.well
	return o ~= nil and self.st.well > 0 and o.gx == x and o.gy == y
end

function Farm:tap_bed(b, sx, sy)
	if not b.crop then return self:seed_popup(b, sx, sy) end
	local info = self:crop_info(b)
	if info.ready then return self:queue({ kind = 'harvest', x = b.x, y = b.y }) end
	if info.needs_water then return self:queue({ kind = 'water', x = b.x, y = b.y }) end
	local gems = math.max(1, math.ceil(info.left / data.GEM_SPEEDUP_SEC))
	self.ui:popup(sx, sy, {
		title = info.c.name, text = 'Созреет через ' .. fmt_time(info.left), bed = b,
		items = { { icon = 'gem', label = 'Ускорить', sub = { gems .. ' ', { icon = 'gem' } }, disabled = self.st.gems < gems, on_click = function()
			self.st.gems = self.st.gems - gems; b.p = info.total; b.w = 2
			self:burst(b.wx, b.wy - 8, '#ffe066', 10); self:changed()
		end } },
	})
end

function Farm:seed_popup(b, sx, sy)
	local st = self.st
	local items = {}
	for _, c in ipairs(data.CROP_LIST) do
		if c.level <= st.level + 1 then
			local locked = c.level > st.level
			local have = st.seeds[c.key] or 0
			local sub
			if locked then sub = 'с ' .. c.level .. ' ур.'
			elseif have > 0 then sub = 'семян: ' .. have .. ' · ' .. fmt_time(c.time)
			else sub = { c.seed .. ' ', { icon = 'coin' }, ' · ' .. fmt_time(c.time) } end
			items[#items + 1] = { icon = c.key, label = c.name, sub = sub, disabled = locked or (have == 0 and st.coins < c.seed),
				on_click = function() self:queue({ kind = 'plant', x = b.x, y = b.y, crop = c.key }) end }
		end
	end
	self.ui:popup(sx, sy, { title = 'Что посадить?', items = items, wide = true })
end

function Farm:expand_popup(c, sx, sy)
	local w = self.world
	if not w:can_unlock(c) then return self:toast('Сначала откройте соседний участок') end
	local n = w:unlocked_count()
	local limit = HOUSE[self.st.house].chunks
	if n >= limit then
		local need = 0
		for i = self.st.house + 1, #HOUSE do if HOUSE[i].chunks > n then need = i; break end end
		return self.ui:popup(sx, sy, { title = 'Новый участок', text = 'Улучшите дом до ' .. need .. ' уровня, чтобы расширить ферму.',
			items = { { icon = 'house', label = 'К дому', on_click = function() self.ui:house_panel() end } } })
	end
	local cost = data.expansion_cost(n)
	self.ui:popup(sx, sy, {
		title = 'Новый участок', text = 'Расчистите его, чтобы получить ресурсы и место для грядок.',
		cost = cost, items = { { icon = 'lock', label = 'Открыть участок', disabled = not self:can_pay(cost), on_click = function() self:unlock_chunk(c, cost) end } },
	})
end

function Farm:have(k)
	local st = self.st
	if k == 'coins' then return st.coins elseif k == 'gems' then return st.gems end
	return st.inv[k] or 0
end

function Farm:can_pay(cost)
	for k, v in pairs(cost) do if self:have(k) < v then return false end end
	return true
end

function Farm:pay(cost)
	if not self:can_pay(cost) then return false end
	local st = self.st
	for k, v in pairs(cost) do
		if k == 'coins' then st.coins = st.coins - v elseif k == 'gems' then st.gems = st.gems - v else st.inv[k] = st.inv[k] - v end
	end
	return true
end

function Farm:unlock_chunk(c, cost)
	if not self:pay(cost) then return end
	local w = self.world
	w.unlocked[c] = 1; w.version = w.version + 1
	self.ground_v = self.ground_v + 1
	self:update_bounds()
	local cx, cy = c % CHUNKS, math.floor(c / CHUNKS)
	local x, y = iso.to_world(cx * CHUNK + CHUNK / 2, cy * CHUNK + CHUNK / 2)
	self:burst(x, y - 10, '#ffe066', 24)
	self:float(x, y - 30, 'Новый участок!', nil)
	self.quests:emit('expand')
	self:sfx('unlock')
	self:add_xp(10)
	self:changed()
end

function Farm:upgrade_house()
	local next = HOUSE[self.st.house + 1]
	if not next or self.world:unlocked_count() < data.house_need_chunks(self.st.house) then return false end
	if not self:pay(next.cost) then return false end
	local old = self:max_energy()
	self.st.house = self.st.house + 1
	self.st.energy = self.st.energy + self:max_energy() - old
	local h = self.house
	if h then self:burst(h.wx, h.wy - 40, '#ffe066', 30); self:float(h.wx, h.wy - 110, 'Дом ' .. self.st.house .. ' ур.', nil) end
	self.world.version = self.world.version + 1
	self:add_xp(20)
	self:sfx('unlock')
	self.player:celebrate()
	self:changed()
	return true
end

function Farm:sell(key, n)
	local have = self.st.crops[key] or 0
	n = math.min(n, have)
	if n <= 0 then return end
	self.st.crops[key] = have - n
	self.st.coins = self.st.coins + n * GOODS[key].sell
	self.quests:emit('sell', key, n)
	self:sfx('coin')
	self:changed()
end

function Farm:eat(key)
	local c = GOODS[key]
	if not c.food or c.food <= 0 or not ((self.st.crops[key] or 0) > 0) then return end
	if self.st.energy >= self:max_energy() then return self:toast('Энергия уже полная') end
	self.st.crops[key] = self.st.crops[key] - 1
	self.st.energy = math.min(self:max_energy(), self.st.energy + c.food)
	self:sfx('eat')
	self:changed()
end

function Farm:queue(a)
	if not self.player:enqueue(a) then self:toast('Очередь заполнена'); return end
	self:sfx('tap')
end

function Farm:toast(msg, kind) self.ui:toast(msg, kind); if kind == 'warn' then self:sfx('error') end end
function Farm:sfx(name) if self.audio then self.audio(name) end end

-- ---------------- Выполнение действий ----------------

function Farm:nearest_water()
	local w, p = self.world, self.player
	local best, bd = nil, math.huge
	for y = 0, N - 1 do for x = 0, N - 1 do
		if w.tiles[y * N + x] == T.WATER and w:is_open(x, y) then
			local d = util.hypot(x - p.x, y - p.y)
			if d < bd then bd = d; best = { x = x, y = y } end
		end
	end end
	local o = w.well
	if o and self.st.well > 0 and w:is_open(o.gx, o.gy) and util.hypot(o.gx - p.x, o.gy - p.y) < bd then best = { x = o.gx, y = o.gy } end
	return best
end

function Farm:can_start(a)
	local w, st = self.world, self.st
	if a.obj then
		if w.objects[a.obj.id] ~= a.obj then return false end
		if OBJECTS[a.obj.type].action ~= a.kind then return false end
	end
	local cost = ENERGY[a.kind] or 0
	if cost > 0 and st.energy < cost then self:spend(cost); self.player.queue = {}; return false end
	local t = a.obj and -1 or w:tile(a.x, a.y)
	local k = a.kind
	if k == 'dig' then return t == T.GRASS and w.occ[w:idx(a.x, a.y)] < 0
	elseif k == 'plant' then
		local b = self:bed_at(w:idx(a.x, a.y))
		if t ~= T.SOIL or b.crop then return false end
		if not ((st.seeds[a.crop] or 0) > 0) and st.coins < CROPS[a.crop].seed then self:toast('Не хватает монет на семена', 'warn'); return false end
		return true
	elseif k == 'water' then
		local b = self:bed_at(w:idx(a.x, a.y))
		if not b.crop or not self:crop_info(b).needs_water then return false end
		if st.can <= 0 then
			local wt = self:nearest_water()
			if not wt then self:toast('Рядом нет воды', 'warn'); return false end
			self.player:push_front(a)
			self.player:push_front({ kind = 'fill', x = wt.x, y = wt.y })
			return false
		end
		return true
	elseif k == 'harvest' then
		local b = self:bed_at(w:idx(a.x, a.y))
		return b.crop ~= nil and self:crop_info(b).ready
	elseif k == 'fill' then
		if st.can >= self:can_max() then self:toast('Лейка уже полная'); return false end
		return t == T.WATER or self:is_well(a.x, a.y)
	elseif k == 'fish' then return t == T.WATER end
	return true
end

function Farm:perform(a)
	local w, st = self.world, self.st
	local k = a.kind
	if k == 'chop' or k == 'mine' then
		local o = a.obj
		if w.objects[o.id] ~= o or not self:spend(1) then return false end
		o.hp = o.hp - 1; o.shake = 0.25
		if o.hp > 0 then self:sfx(k == 'chop' and 'chop' or 'mine') end
		local hy = (o.type == 'stump' or o.type == 'rock' or o.type == 'bush' or o.type == 'berry') and 8 or (o.type == 'boulder' and 20 or 26)
		self:burst(o.wx, o.wy - hy, k == 'chop' and '#b07a45' or '#b8bec3', 6)
		if k == 'chop' and o.type ~= 'stump' then self:burst(o.wx, o.wy - 60, '#5aa83a', 4, true) end
		if o.hp <= 0 then self:destroy(o); self:changed(); return false end
		self.ui:update(self)
		return st.energy >= 1
	elseif k == 'dig' then
		local i = w:idx(a.x, a.y)
		if w.tiles[i] ~= T.GRASS or w.occ[i] >= 0 then return false end
		if not self:spend(ENERGY.dig) then return false end
		w.tiles[i] = T.SOIL; self.ground_v = self.ground_v + 1
		local b = self:bed_at(i); b.crop = nil; b.p = 0; b.w = 0
		self:burst(b.wx, b.wy, '#8a5a30', 8)
		self.quests:emit('dig')
		self:sfx('dig')
		self:add_xp(1)
		self:changed()
		return false
	elseif k == 'plant' then
		local i = w:idx(a.x, a.y)
		if w.tiles[i] ~= T.SOIL then return false end
		local b, c = self:bed_at(i), CROPS[a.crop]
		if (st.seeds[a.crop] or 0) > 0 then st.seeds[a.crop] = st.seeds[a.crop] - 1
		elseif st.coins >= c.seed then st.coins = st.coins - c.seed
		else return false end
		b.crop = a.crop; b.p = 0; b.w = 0
		self:burst(b.wx, b.wy, '#7ccf4f', 6)
		self.quests:emit('plant', a.crop)
		self:sfx('plant')
		self:add_xp(1)
		self:changed()
		return false
	elseif k == 'water' then
		local i = w:idx(a.x, a.y)
		if w.tiles[i] ~= T.SOIL then return false end
		local b = self:bed_at(i)
		if st.can <= 0 or not self:spend(ENERGY.water) then return false end
		st.can = st.can - 1; b.w = b.w + 1
		self.quests:emit('water')
		self:sfx('water')
		self:burst(b.wx, b.wy - 6, '#6fc2ff', 10)
		self:changed()
		return false
	elseif k == 'fill' then
		st.can = self:can_max()
		local x, y = iso.to_world(a.x + 0.5, a.y + 0.5)
		self:burst(x, y, '#9fd8f5', 8)
		self:float(x, y - 20, tostring(st.can), 'water')
		self:sfx('fill')
		self:changed()
		return false
	elseif k == 'fish' then
		if not self:spend(ENERGY.fish) then return false end
		local x, y = iso.to_world(a.x + 0.5, a.y + 0.5)
		self:burst(x, y - 2, '#bfe6ff', 10)
		if math.random() > data.FISH_CATCH then self:float(x, y - 20, 'Сорвалась!', nil); self:sfx('splash'); self:changed(); return false end
		local total = 0
		for _, f in ipairs(data.FISH_LIST) do total = total + f.chance end
		local r, fish = math.random() * total, data.FISH_LIST[1]
		for _, f in ipairs(data.FISH_LIST) do r = r - f.chance; if r < 0 then fish = f; break end end
		local got = self:add_item('crops', fish.key, 1)
		if got <= 0 then return false end
		self:float(x, y - 22, '+1 ' .. fish.name, fish.key)
		self.quests:emit('fish', fish.key)
		self:sfx('catch')
		self:add_xp(fish.xp)
		self:changed()
		return false
	elseif k == 'harvest' then
		local i = w:idx(a.x, a.y)
		if w.tiles[i] ~= T.SOIL then return false end
		local b = self:bed_at(i)
		local c = CROPS[b.crop]
		local got = self:add_item('crops', c.key, 1)
		if got <= 0 then return false end
		self:float(b.wx, b.wy - 20, '+1', c.key)
		if math.random() < 0.25 then self:add_item('seeds', c.key, 1); self:float(b.wx + 12, b.wy - 34, '+1', 'seed') end
		self:burst(b.wx, b.wy - 6, '#ffe066', 8)
		b.crop = nil; b.p = 0; b.w = 0
		st.stats.harvested = (st.stats.harvested or 0) + 1
		self.quests:emit('harvest', c.key)
		self:sfx('harvest')
		self:add_xp(c.xp)
		self:changed()
		return false
	end
	return false
end

function Farm:destroy(o)
	local def, st = OBJECTS[o.type], self.st
	local dy = -30
	for _, res in ipairs(data.RES_KEYS) do
		local r = def.drops and def.drops[res]
		if r then
			local n = r[1] + math.floor(math.random() * (r[2] - r[1] + 1))
			local got = self:add_item('inv', res, n)
			if got > 0 then self:float(o.wx, o.wy + dy, '+' .. got, res); dy = dy - 14 end
		end
	end
	if def.oreChance and math.random() < def.oreChance then
		local o0, o1 = (def.ore or { 1, 2 })[1], (def.ore or { 1, 2 })[2]
		local got = self:add_item('inv', 'ore', o0 + math.floor(math.random() * (o1 - o0 + 1)))
		if got > 0 then self:float(o.wx + 14, o.wy + dy, '+' .. got, 'ore'); dy = dy - 14 end
	end
	if def.seedChance and math.random() < def.seedChance then
		local opts = {}
		for _, c in ipairs(data.CROP_LIST) do if c.level <= st.level then opts[#opts + 1] = c end end
		local c = opts[math.floor(math.random() * #opts) + 1]
		self:add_item('seeds', c.key, 1)
		self:float(o.wx - 14, o.wy + dy, '+1', 'seed')
	end
	self:add_xp(def.xp or 1)
	st.stats.cleared = (st.stats.cleared or 0) + 1
	self.quests:emit(def.stump and 'chop' or (o.type == 'stump' and 'stump' or (def.action == 'mine' and 'mine' or 'clear')))
	self:burst(o.wx, o.wy - 10, (o.type == 'rock' or o.type == 'boulder') and '#9aa1a7' or '#7a4b28', 12)
	self:sfx('break')
	if def.stump then o.was = o.type; o.type = 'stump'; o.hp = OBJECTS.stump.hp; self.world.version = self.world.version + 1
	else self.world:remove(o) end
end

-- ---------------- Эффекты ----------------

-- Рыбалка: точки лески и поплавка (nil — не рыбачим)
function Farm:fishing_state()
	local p = self.player
	local an, a = p.anim, p.current
	if p.state ~= 'work' or not a or a.kind ~= 'fish' or an:name() ~= 'fish' or an.time < 0.42 or an.time > 2.3 then return nil end
	local bn = p.sk.bone_map.foreF
	local ly = 3.4 + (ghost_data.rodTip or 26)
	local x, y = bn.c * ly + bn.tx, bn.d * ly + bn.ty
	if p.flip then x = -x end
	local px, py = p:world_pos()
	x = x + px; y = y + py
	local tx, ty = iso.to_world(a.x + 0.5, a.y + 0.5)
	local t = an.time
	local k = math.min(1, (t - 0.42) / 0.22)
	local bite = t > 1.72 and math.min(1, (t - 1.72) / 0.12) or 0
	local yank = t > 2.12 and (t - 2.12) / 0.18 or 0
	local bx = x + (tx - x) * k
	local by = y + (ty - y) * k - math.sin(k * math.pi) * 14 + (k >= 1 and (math.sin(t * 7) * 0.7 + bite * 2.4) or 0)
	if yank > 0 then bx = bx + (x - bx) * yank * 0.6; by = by + (y - 10 - by) * yank * 0.6 end
	return x, y, bx, by, k, bite, yank
end

function Farm:pour_water(dt)
	local p = self.player
	local an = p.anim
	if p.state ~= 'work' or not p.current or p.current.kind ~= 'water' or an:name() ~= 'water' then return end
	if an.time < 0.4 or an.time > 0.84 then return end
	self._pour = (self._pour or 0) + dt
	local Pt, max = self.particles, self.low and 60 or 160
	local bn = p.sk.bone_map.foreF
	local lx, ly = -2.6, 3.6 + 14
	local x, y = bn.a * lx + bn.c * ly + bn.tx, bn.b * lx + bn.d * ly + bn.ty
	if p.flip then x = -x end
	local px, py = p:world_pos()
	x = x + px; y = y + py
	while self._pour > 0.022 and #Pt < max do
		self._pour = self._pour - 0.022
		Pt[#Pt + 1] = { x = x + (math.random() - 0.5) * 2, y = y, vx = (p.flip and -1 or 1) * (8 + math.random() * 10), vy = 10 + math.random() * 15,
			life = 0.3 + math.random() * 0.12, t = 0, c = math.random() < 0.3 and '#d8f0ff' or '#3f9be6', s = 2 + math.random() * 1.2, g = 320 }
	end
end

function Farm:burst(x, y, color, n, leaves)
	local Pt, max = self.particles, self.low and 60 or 160
	for _ = 1, n do
		if #Pt >= max then break end
		local a, sp = math.random() * math.pi * 2, 30 + math.random() * 60
		Pt[#Pt + 1] = { x = x, y = y, vx = math.cos(a) * sp, vy = -40 - math.random() * 60, life = 0.5 + math.random() * 0.4, t = 0, c = color,
			s = leaves and 2.6 or (1.6 + math.random() * 1.4), g = leaves and 60 or 260 }
	end
end

function Farm:float(x, y, text, icon) self.floaters[#self.floaters + 1] = { x = x, y = y, text = text, icon = icon, t = 0 } end

function Farm:update_bounds()
	local w = self.world
	local b = { minX = math.huge, maxX = -math.huge, minY = math.huge, maxY = -math.huge }
	for c = 0, CHUNKS * CHUNKS - 1 do
		if w.unlocked[c] == 1 then
			local cb = w:chunk_bounds(c)
			b.minX = math.min(b.minX, cb.minX); b.maxX = math.max(b.maxX, cb.maxX)
			b.minY = math.min(b.minY, cb.minY); b.maxY = math.max(b.maxY, cb.maxY)
		end
	end
	local m = 120
	if self.cam then
		self.cam.bounds = { minX = b.minX - m, maxX = b.maxX + m, minY = b.minY - m, maxY = b.maxY + m }
		self.cam:clamp()
	end
end

-- ---------------- Обновление ----------------

function Farm:update(dt)
	self.time = self.time + dt
	-- рост — по настоящим часам: в фоне кадры не идут, а грядки растут
	local now = self.now()
	self:grow(self._wall and math.min(math.max(0, (now - self._wall) / 1000), 7 * 86400) or dt)
	self._wall = now
	self._eT = (self._eT or 0) + dt
	if self._eT > 1 then self._eT = 0; self:tick_energy(); self.ui:tick(self) end
	self.player:update(dt)
	self:pour_water(dt)
	local OB = self.world.objects
	for id = 0, self.world.nobj - 1 do
		local o = OB[id]
		if o and o.shake > 0 then o.shake = math.max(0, o.shake - dt) end
	end
	local Pt = self.particles
	for i = #Pt, 1, -1 do
		local p = Pt[i]
		p.t = p.t + dt; p.vy = p.vy + p.g * dt; p.x = p.x + p.vx * dt; p.y = p.y + p.vy * dt
		if p.t >= p.life then Pt[i] = Pt[#Pt]; Pt[#Pt] = nil end
	end
	local F = self.floaters
	for i = #F, 1, -1 do F[i].t = F[i].t + dt; if F[i].t > 1.3 then table.remove(F, i) end end
	if self.tap_fx then self.tap_fx.t = self.tap_fx.t - dt; if self.tap_fx.t <= 0 then self.tap_fx = nil end end
end

function Farm:is_idle()
	return self.player.idle_time > 2 and #self.particles == 0 and #self.floaters == 0 and not self.tap_fx and not (self.cam and self.cam:animating())
end

return M
