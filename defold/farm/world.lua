-- Мир фермы: сетка тайлов, объекты, участки (чанки) территории.
-- Мир генерируется детерминированно из seed (тот же, что в JS), в сохранение пишется только разница.
-- Координаты клеток с 0, индекс клетки i = y * N + x; id объектов тоже с 0, как в JS.
local util = require('farm.util')
local data = require('farm.data')
local iso = require('farm.iso')
local b64 = require('farm.base64')

local M = {}
local CHUNK, CHUNKS = 10, 5
local N = CHUNK * CHUNKS
M.CHUNK, M.CHUNKS, M.N = CHUNK, CHUNKS, N
M.START_CHUNK = 2 * CHUNKS + 2 -- центральный участок
local T = { GRASS = 0, SOIL = 1, WATER = 2, PATH = 3 }
M.T = T

local World = {}
World.__index = World

function M.new(seed)
	local self = setmetatable({}, World)
	self.seed = seed % 4294967296
	self.N = N
	self.tiles, self.variant, self.occ = {}, {}, {}
	for i = 0, N * N - 1 do self.tiles[i] = T.GRASS; self.variant[i] = 0; self.occ[i] = -1 end
	self.objects = {}  -- [id] = объект, удалённые → nil
	self.nobj = 0
	self.unlocked = {}
	for c = 0, CHUNKS * CHUNKS - 1 do self.unlocked[c] = 0 end
	self.unlocked[M.START_CHUNK] = 1
	self.version = 0   -- растёт при изменении объектов
	self:generate()
	return self
end

function World:idx(x, y) return y * N + x end
function World:inside(x, y) return x >= 0 and y >= 0 and x < N and y < N end
function World:chunk_of(x, y) return math.floor(y / CHUNK) * CHUNKS + math.floor(x / CHUNK) end
function World:is_open(x, y) return self:inside(x, y) and self.unlocked[self:chunk_of(x, y)] == 1 end
function World:tile(x, y) return self.tiles[y * N + x] end
function World:object_at(x, y)
	if not self:inside(x, y) then return nil end
	local i = self.occ[y * N + x]
	return i >= 0 and self.objects[i] or nil
end

function World:walkable(x, y)
	if not self:is_open(x, y) then return false end
	local i = y * N + x
	return (self.tiles[i] ~= T.WATER or (self.pier and self.pier[i])) and self.occ[i] < 0
end

local function place(o)
	local wx, wy = iso.to_world(o.gx + o.w / 2, o.gy + o.h / 2)
	o.wx, o.wy = wx, wy
	o.depth = o.gx + o.w / 2 + o.gy + o.h / 2
end

function World:add(type, gx, gy)
	local def = data.OBJECTS[type]
	local w, h = def.w or 1, def.h or 1
	for y = gy, gy + h - 1 do for x = gx, gx + w - 1 do
		if not self:inside(x, y) or self.occ[y * N + x] >= 0 or self.tiles[y * N + x] ~= T.GRASS then return nil end
	end end
	local o = { id = self.nobj, type = type, gx = gx, gy = gy, w = w, h = h, hp = def.hp or 0, state = 0, shake = 0 }
	place(o)
	self.objects[o.id] = o
	self.nobj = self.nobj + 1
	for y = gy, gy + h - 1 do for x = gx, gx + w - 1 do self.occ[y * N + x] = o.id end end
	return o
end

function World:lift(o)
	for y = o.gy, o.gy + o.h - 1 do for x = o.gx, o.gx + o.w - 1 do
		if self.occ[y * N + x] == o.id then self.occ[y * N + x] = -1 end
	end end
end

function World:remove(o)
	self:lift(o)
	self.objects[o.id] = nil
	o.state = 2
	self.version = self.version + 1
end

function World:generate()
	local rnd = util.mulberry32(self.seed)
	local seed = self.seed
	for y = 0, N - 1 do for x = 0, N - 1 do
		local h = util.hash2(x + seed % 1000, y)
		self.variant[y * N + x] = h < 0.55 and 0 or h < 0.8 and 1 or h < 0.9 and 3 or 2
	end end
	local ox, oy = 2 * CHUNK, 2 * CHUNK
	local function L(lx, ly) return ox + lx, oy + ly end
	local tiles = self.tiles
	local function setT(x, y, t) tiles[y * N + x] = t end

	-- --- Стартовый участок (дизайн вручную) ---
	local reserved = {}
	local function res(x, y) reserved[y * N + x] = true end
	local hx, hy = L(2, 2) -- дом 2×2
	for _, p in ipairs({ { 3, 4 }, { 3, 5 }, { 4, 5 }, { 5, 5 }, { 5, 6 } }) do local x, y = L(p[1], p[2]); setT(x, y, T.PATH); res(x, y) end
	for _, p in ipairs({ { 6, 6 }, { 7, 6 }, { 6, 7 }, { 7, 7 }, { 8, 7 }, { 7, 8 }, { 6, 8 } }) do local x, y = L(p[1], p[2]); setT(x, y, T.WATER); res(x, y) end
	self.start_beds = {}
	for _, p in ipairs({ { 2, 6 }, { 3, 6 } }) do local x, y = L(p[1], p[2]); setT(x, y, T.SOIL); res(x, y); table.insert(self.start_beds, y * N + x) end
	self:add('house', hx, hy)
	for y = hy - 1, hy + 2 do for x = hx - 1, hx + 2 do res(x, y) end end
	local px, py = L(4, 6)
	self.player_start = { px, py }
	for dy = -1, 1 do for dx = -1, 1 do res(px + dx, py + dy) end end
	for _, p in ipairs({ { 1, 6 }, { 4, 6 }, { 2, 7 }, { 3, 7 }, { 1, 7 }, { 5, 7 }, { 5, 8 }, { 8, 6 }, { 6, 9 }, { 8, 8 } }) do local x, y = L(p[1], p[2]); res(x, y) end

	-- гарантированные ресурсы внутри стартового участка
	local fixed = { { 'oak', 6, 2 }, { 'oak2', 7, 3 }, { 'pine', 8, 1 }, { 'apple', 5, 1 }, { 'rock', 6, 4 }, { 'rock', 1, 4 }, { 'bush', 4, 8 }, { 'berry', 1, 8 }, { 'oak', 2, 8 }, { 'rock', 8, 4 } }
	for _, f in ipairs(fixed) do
		local x, y = L(f[2], f[3])
		if not reserved[y * N + x] then self:add(f[1], x, y); res(x, y) end
	end

	-- лес и камни по краю стартового участка
	for ly = 0, CHUNK - 1 do for lx = 0, CHUNK - 1 do
		local x, y = L(lx, ly)
		if not reserved[y * N + x] then
			local edge = lx == 0 or ly == 0 or lx == CHUNK - 1 or ly == CHUNK - 1
			local r = rnd()
			local front = lx == CHUNK - 1 or ly == CHUNK - 1 -- передние края: деревья закрывали бы ферму
			if edge and front then
				if r < 0.14 then self:add('pine', x, y)
				elseif r < 0.4 then self:add('rock', x, y)
				elseif r < 0.6 then self:add(r < 0.5 and 'bush' or 'berry', x, y) end
			elseif edge then
				if r < 0.5 then
					local t
					if rnd() < 0.7 then t = rnd() < 0.5 and 'oak' or 'oak2' else t = 'pine' end
					self:add(t, x, y)
				elseif r < 0.68 then self:add('rock', x, y)
				elseif r < 0.76 then self:add('bush', x, y) end
			elseif r < 0.06 then self:add('bush', x, y) end
		end
	end end

	-- --- Остальные участки ---
	local pond_chunks, npond = {}, 0
	while npond < 3 do
		local c = math.floor(rnd() * CHUNKS * CHUNKS)
		if c ~= M.START_CHUNK and not pond_chunks[c] then pond_chunks[c] = true; npond = npond + 1 end
	end
	for cy = 0, CHUNKS - 1 do for cx = 0, CHUNKS - 1 do
		local c = cy * CHUNKS + cx
		if c ~= M.START_CHUNK then
			local x0, y0 = cx * CHUNK, cy * CHUNK
			if pond_chunks[c] then
				local ppx = x0 + 2 + math.floor(rnd() * 4)
				local ppy = y0 + 2 + math.floor(rnd() * 4)
				for dy = -1, 2 do for dx = -1, 2 do
					if math.abs(dx - 0.5) + math.abs(dy - 0.5) < 2.6 and rnd() < 0.9 then setT(ppx + dx, ppy + dy, T.WATER) end
				end end
			end
			-- валуны 2×2
			local nb = 1 + math.floor(rnd() * 2)
			for _ = 1, nb do
				local bx = x0 + 1 + math.floor(rnd() * (CHUNK - 3))
				local by = y0 + 1 + math.floor(rnd() * (CHUNK - 3))
				self:add('boulder', bx, by)
			end
			local forest = 0.14 + rnd() * 0.18 -- у каждого участка своя густота
			for y = y0, y0 + CHUNK - 1 do for x = x0, x0 + CHUNK - 1 do
				local r, k = rnd(), rnd()
				if r < forest then self:add(k < 0.4 and 'oak' or k < 0.7 and 'oak2' or k < 0.92 and 'pine' or 'apple', x, y)
				elseif r < forest + 0.08 then self:add('rock', x, y)
				elseif r < forest + 0.13 then self:add(k < 0.7 and 'bush' or 'berry', x, y) end
			end end
		end
	end end
	-- Добавочные камни (отдельный поток случайных чисел, в конце списка — номера старых объектов не сдвигаются)
	local rnd2 = util.mulberry32(bit.bxor(seed, 0x5bd1e995))
	for y = 0, N - 1 do for x = 0, N - 1 do
		local r = rnd2()
		if self:chunk_of(x, y) ~= M.START_CHUNK and r < 0.055 then self:add('rock', x, y) end
	end end
	self.gen_count = self.nobj
	-- Колодец бабушки — после счётчика: он не сохраняется в разнице и всегда на месте
	self.well_pos = { L(5, 4) }
	self.well = self:add('well', self.well_pos[1], self.well_pos[2])
	self:gen_decor()
end

-- Украшения пруда: не объекты, всегда одинаковые для мира.
function World:gen_decor()
	local rnd = util.mulberry32(bit.bxor(self.seed, 0x7f4a7c15))
	local W = T.WATER
	self.decor = {}
	self.pier = {}
	local function water(x, y) return self:inside(x, y) and self.tiles[y * N + x] == W end
	local seen = {}
	local D4 = { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }
	for i = 0, N * N - 1 do
		if self.tiles[i] == W and not seen[i] then
			local pond, st = {}, { i }
			seen[i] = true
			while #st > 0 do
				local j = table.remove(st)
				pond[#pond + 1] = j
				local x, y = j % N, math.floor(j / N)
				for _, d in ipairs(D4) do
					local k = (y + d[2]) * N + x + d[1]
					if water(x + d[1], y + d[2]) and not seen[k] then seen[k] = true; st[#st + 1] = k end
				end
			end
			local function land(j)
				local x, y = j % N, math.floor(j / N)
				local r = {}
				for _, d in ipairs(D4) do if self:inside(x + d[1], y + d[2]) and not water(x + d[1], y + d[2]) then r[#r + 1] = d end end
				return r
			end
			local shore = {}
			for _, j in ipairs(pond) do if #land(j) > 0 then shore[#shore + 1] = j end end
			local used = {}
			local function take(list)
				local free = {}
				for _, j in ipairs(list) do if not used[j] then free[#free + 1] = j end end
				if #free == 0 then return -1 end
				local j = free[math.floor(rnd() * #free) + 1]
				used[j] = true
				return j
			end
			local function put(type, j, to_land)
				if j < 0 then return end
				local x, y = j % N, math.floor(j / N)
				local ox, oy = (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.2
				if to_land then
					local Ld = land(j)
					if #Ld > 0 then local d = Ld[math.floor(rnd() * #Ld) + 1]; ox = ox + d[1] * 0.28; oy = oy + d[2] * 0.28 end
				end
				self.decor[#self.decor + 1] = { type = type, gx = x, gy = y, x = x + 0.5 + ox, y = y + 0.5 + oy }
			end
			put('cattail', take(shore), true)
			if #pond > 8 then put('cattail', take(shore), true) end
			put('reeds', take(shore), true)
			if rnd() < 0.7 then put('rocks', take(shore), true) end
			put('lily', take(pond), false)
			if #pond > 8 then put('lily', take(pond), false) end
			if rnd() < 0.6 then put('leaves', take(pond), false) end
		end
	end
end

function World:move_object(o, gx, gy)
	self:lift(o)
	o.gx, o.gy = gx, gy
	place(o)
	for y = gy, gy + o.h - 1 do for x = gx, gx + o.w - 1 do self.occ[y * N + x] = o.id end end
	self.version = self.version + 1
end
World.put = World.move_object

-- Можно ли поставить объект сюда (вся площадь — свободная трава открытой земли)
function World:free_for(o, gx, gy)
	for y = gy, gy + o.h - 1 do for x = gx, gx + o.w - 1 do
		if not self:is_open(x, y) or self.tiles[y * N + x] ~= T.GRASS then return false end
		local i = self.occ[y * N + x]
		if i >= 0 and i ~= o.id then return false end
	end end
	return true
end

-- Колодец должен стоять на траве; иначе ставим его на свободную траву рядом с домом
function World:fix_well()
	local o = self.well
	if o and self.tiles[o.gy * N + o.gx] == T.GRASS and self.occ[o.gy * N + o.gx] == o.id then return end
	if o then self:remove(o) end
	local hx, hy = self.well_pos[1], self.well_pos[2]
	local best, bd = nil, math.huge
	for y = 0, N - 1 do for x = 0, N - 1 do
		if self:chunk_of(x, y) == M.START_CHUNK and self.tiles[y * N + x] == T.GRASS and self.occ[y * N + x] < 0 then
			local d = util.hypot(x - hx, y - hy)
			if d < bd then bd = d; best = { x, y } end
		end
	end end
	self.well = best and self:add('well', best[1], best[2]) or nil
end

-- --- Сохранение разницы с генерацией (формат как в JS: 2 бита на объект, base64) ---
function World:export_objects()
	local n = self.gen_count
	local bytes = {}
	for i = 0, math.ceil(n / 4) - 1 do bytes[i] = 0 end
	for i = 0, n - 1 do
		local o = self.objects[i]
		local s = (not o) and 2 or (o.type == 'stump' and 1 or 0)
		local bi = math.floor(i / 4)
		bytes[bi] = bytes[bi] + s * 4 ^ (i % 4)
	end
	local chars = {}
	for i = 0, math.ceil(n / 4) - 1 do chars[#chars + 1] = string.char(bytes[i]) end
	return b64.encode(table.concat(chars))
end

function World:import_objects(s)
	local str = b64.decode(s)
	for i = 0, self.gen_count - 1 do
		local byte = str:byte(math.floor(i / 4) + 1) or 0
		local st = math.floor(byte / 4 ^ (i % 4)) % 4
		local o = self.objects[i]
		if o then
			if st == 2 then self:remove(o)
			elseif st == 1 then o.was = o.type; o.type = 'stump'; o.hp = data.OBJECTS.stump.hp end
		end
	end
	self.version = self.version + 1
end

-- Границы участка в мировых координатах
function World:chunk_bounds(c)
	local cx, cy = c % CHUNKS, math.floor(c / CHUNKS)
	local x0, y0 = cx * CHUNK, cy * CHUNK
	local x1, y1 = x0 + CHUNK, y0 + CHUNK
	return { minX = (x0 - y1) * 32, maxX = (x1 - y0) * 32, minY = (x0 + y0) * 16, maxY = (x1 + y1) * 16 }
end

function World:unlocked_count()
	local n = 0
	for c = 0, CHUNKS * CHUNKS - 1 do n = n + self.unlocked[c] end
	return n
end

function World:can_unlock(c)
	if self.unlocked[c] == 1 then return false end
	local cx, cy = c % CHUNKS, math.floor(c / CHUNKS)
	for _, d in ipairs({ { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 } }) do
		local x, y = cx + d[1], cy + d[2]
		if x >= 0 and y >= 0 and x < CHUNKS and y < CHUNKS and self.unlocked[y * CHUNKS + x] == 1 then return true end
	end
	return false
end

return M
