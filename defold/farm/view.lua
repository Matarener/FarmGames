-- Отрисовка фермы в Defold: каждый спрайт — игровой объект из фабрики (земля — атлас ground,
-- всё остальное — атлас world). Глубина — координата z: дальние ниже, ближние выше.
-- Мир в JS-координатах (y вниз); в Defold y = -wy.
local iso = require('farm.iso')
local W = require('farm.world')
local META = require('farm.art_meta')

local N, CHUNK, CHUNKS, T = W.N, W.CHUNK, W.CHUNKS, W.T
local M = {}
local V = {}
V.__index = V

-- какие картинки у каких объектов (вариант выбирается по id объекта), как в artSprites.js
local OBJ = {
	oak = { 'tree_oak', 'tree_birch' },
	oak2 = { 'tree_sakura', 'tree_blossom', 'tree_autumn' },
	apple = { 'tree_apple' },
	pine = { 'tree_pine' },
	rock = { 'rock_mid', 'rock_small' },
	boulder = { 'rock_big', 'rock_moss' },
	bush = { 'bush_pink', 'bush_hydra', 'bush_lav', 'bush_rose' },
	berry = { 'bush_blue', 'bush_rasp' },
	stump = { 'stump_oak', 'stump_birch', 'stump_pine', 'stump_moss' },
}
local H = {} -- кэш hash(имя)
local function h(name) local v = H[name]; if not v then v = hash(name); H[name] = v end return v end

local Z_GROUND, Z_SHORE, Z_BED, Z_FLAT, Z_OVER = -5, -4.9, -4, -3.5, 3
local function zd(depth, wy) return depth * 0.01 + wy * 1e-7 end -- порядок как в JS: глубина, затем y

local function hex(c)
	local r, g, b = c:match('#(%x%x)(%x%x)(%x%x)')
	return vmath.vector4(tonumber(r, 16) / 255, tonumber(g, 16) / 255, tonumber(b, 16) / 255, 1)
end
local HEX = {}
local function col(c) local v = HEX[c]; if not v then v = hex(c); HEX[c] = v end return v end

function M.new(farm, f_ground, f_world)
	local self = setmetatable({ f = farm, fg = f_ground, fw = f_world }, V)
	self.ground = {}   -- i → { base, over, bed, key... }
	self.objs = {}     -- id → { id, name, tint... }
	self.crops = {}    -- i клетки → { id, name }
	self.bubbles = {}
	self.decor = {}
	self.pool = {}     -- свободные спрайты world-атласа
	self.parts = {}    -- частицы
	self.dashes = {}
	self.lines = {}
	self.ghost = {}
	self.v1 = vmath.vector3()
	self.tint = vmath.vector4(1, 1, 1, 1)
	return self
end

-- ---------- спрайты ----------
function V:spawn(fac, name, x, y, z, sx, sy)
	local m = META[name]
	local s = m and m[1] or 0.5
	local id = factory.create(fac, vmath.vector3(x, -y, z), nil, nil, vmath.vector3(s * (sx or 1), s * (sy or 1), 1))
	local e = { id = id, url = msg.url(nil, id, 'sprite'), name = name, s = s, sx = sx or 1, sy = sy or 1 }
	sprite.play_flipbook(e.url, h(name))
	return e
end

function V:set_anim(e, name, sx)
	sx = sx or 1
	if e.name ~= name or e.sx ~= sx then
		local m = META[name]
		e.s = m and m[1] or 0.5
		if e.name ~= name then sprite.play_flipbook(e.url, h(name)) end
		e.name, e.sx = name, sx
		go.set_scale(vmath.vector3(e.s * sx, e.s * e.sy, 1), e.id)
	end
end

function V:set_tint(e, r, g, b, a)
	if e.tr ~= r or e.tg ~= g or e.tb ~= b or e.ta ~= a then
		e.tr, e.tg, e.tb, e.ta = r, g, b, a
		local t = self.tint
		t.x, t.y, t.z, t.w = r, g, b, a
		go.set(e.url, 'tint', t)
	end
end

function V:set_pos(e, x, y, z)
	if e.x ~= x or e.y ~= y or e.z ~= z then
		e.x, e.y, e.z = x, y, z
		local v = self.v1
		v.x, v.y, v.z = x, -y, z
		go.set_position(v, e.id)
	end
end

-- из пула (частицы, линии, штрихи)
function V:take(name)
	local e = table.remove(self.pool)
	if e then self:set_anim(e, name); msg.post(e.url, 'enable'); return e end
	return self:spawn(self.fw, name, 0, 0, Z_OVER)
end
function V:give(e) msg.post(e.url, 'disable'); e.x = nil; e.ps = nil; self.pool[#self.pool + 1] = e end

function V:delete(e) if e then go.delete(e.id) end end

-- ---------- картинки объектов ----------
function V:obj_sprite(o)
	local f = self.f
	if o.type == 'stump' and o.was and OBJ[o.was] then
		local list = OBJ[o.was]
		local k = list[o.id % #list + 1]:gsub('^tree_', '')
		if k == 'oak' and o.id % 3 == 0 then return 'stump_moss' end
		if META['stump_' .. k] then return 'stump_' .. k end
	end
	local v = OBJ[o.type]
	if v then return v[o.id % #v + 1] end
	if o.type == 'house' then return 'house_' .. f.st.house end
	if o.type == 'well' then return f.st.well > 0 and 'well_fixed' or 'well_broken' end
	return 'rock_mid'
end

-- ---------- земля ----------
local function grass_of(w, i)
	local v = w.variant[i]
	return (v >= 2) and 'tile_flowers' or 'tile_grass', (v == 1 or v == 3) and -1 or 1
end

function V:water_parts(gx, gy)
	local w = self.f.world
	local function land(x, y) return (not w:inside(x, y) or w:tile(x, y) ~= T.WATER) and 1 or 0 end
	local mask = land(gx, gy - 1) + land(gx + 1, gy) * 2 + land(gx, gy + 1) * 4 + land(gx - 1, gy) * 8
	local function has(m, b) return math.floor(m / b) % 2 == 1 end
	local dg = 0
	if land(gx - 1, gy - 1) == 1 and not has(mask, 1) and not has(mask, 8) then dg = dg + 1 end
	if land(gx + 1, gy - 1) == 1 and not has(mask, 1) and not has(mask, 2) then dg = dg + 2 end
	if land(gx + 1, gy + 1) == 1 and not has(mask, 2) and not has(mask, 4) then dg = dg + 4 end
	if land(gx - 1, gy + 1) == 1 and not has(mask, 4) and not has(mask, 8) then dg = dg + 8 end
	local base = 'water_' .. (gx % 6) .. '_' .. (gy % 4)
	return base, (mask > 0 or dg > 0) and ('shore_' .. mask .. '_' .. dg) or nil
end

function V:chunk_shade(c)
	local w = self.f.world
	if w.unlocked[c] == 1 then return 1 end
	return w:can_unlock(c) and 0.66 or 0.5
end

-- одна клетка земли: основа, берег (вода), объёмная грядка (грядка)
function V:sync_tile(gx, gy)
	local f, w = self.f, self.f.world
	local i = gy * N + gx
	local t = w.tiles[i]
	local cx, cy = (gx - gy) * 32, (gx + gy + 1) * 16
	local base, bsx, over, bed = nil, 1, nil, nil
	if t == T.GRASS then base, bsx = grass_of(w, i)
	elseif t == T.PATH then base = 'tile_sand'; bsx = (gx + gy) % 2 == 1 and -1 or 1
	elseif t == T.WATER then base, over = self:water_parts(gx, gy)
	else
		base, bsx = grass_of(w, i)
		local b = f.beds[i]
		local wet = false
		if b and b.crop then local _, ready, needs = f:crop_flags(b); wet = not needs and not ready end
		bed = wet and 'bed_wet' or 'bed_dry'
	end
	local k = self:chunk_shade(w:chunk_of(gx, gy))
	local g = self.ground[i]
	if not g then g = {}; self.ground[i] = g end
	if not g.base then g.base = self:spawn(self.fg, base, cx, cy, Z_GROUND, bsx) else self:set_anim(g.base, base, bsx) end
	self:set_tint(g.base, k, k, k, 1)
	if over then
		if not g.over then g.over = self:spawn(self.fg, over, cx, cy, Z_SHORE) else self:set_anim(g.over, over) end
		self:set_tint(g.over, k, k, k, 1)
	elseif g.over then self:delete(g.over); g.over = nil end
	if bed then
		if not g.bed then g.bed = self:spawn(self.fg, bed, cx, cy, Z_BED + cy * 1e-4) else self:set_anim(g.bed, bed) end
		self:set_tint(g.bed, k, k, k, 1)
	elseif g.bed then self:delete(g.bed); g.bed = nil end
end

function V:sync_ground()
	for gy = 0, N - 1 do for gx = 0, N - 1 do self:sync_tile(gx, gy) end end
end

-- ---------- украшения пруда ----------
function V:sync_decor()
	local w = self.f.world
	for k, d in ipairs(w.decor) do
		local name = 'pond_' .. d.type
		if META[name] then
			local e = self.decor[k]
			local wx, wy = iso.to_world(d.x, d.y)
			if not e then
				local flat = d.type == 'lily' or d.type == 'leaves'
				e = self:spawn(self.fw, name, wx, wy, flat and Z_FLAT or zd(d.x + d.y, wy))
				self.decor[k] = e
			end
			local s = self:chunk_shade(w:chunk_of(d.gx, d.gy))
			self:set_tint(e, s, s, s, 1)
		end
	end
end

-- ---------- объекты ----------
function V:sync_objects()
	local f, w = self.f, self.f.world
	for id, e in pairs(self.objs) do
		if not w.objects[id] then self:delete(e); self.objs[id] = nil end
	end
	for id = 0, w.nobj - 1 do
		local o = w.objects[id]
		if o then
			local name = self:obj_sprite(o)
			local e = self.objs[id]
			if not e then e = self:spawn(self.fw, name, o.wx, o.wy, zd(o.depth, o.wy)); e.o = o; self.objs[id] = e
			else self:set_anim(e, name) end
			e.open = w:is_open(o.gx, o.gy)
			e.shade = e.open and 1 or self:chunk_shade(w:chunk_of(o.gx, o.gy))
			e.fade = e.fade or 0
			self:set_tint(e, e.shade, e.shade, e.shade, 1)
			self:set_pos(e, o.wx, o.wy, zd(o.depth, o.wy))
		end
	end
	self.obj_v = w.version
	self.house_lv = f.st.house
	self.well_st = f.st.well
end

-- рамка спрайта в мире: x0, y0, x1, y1
local function box(name, x, y)
	local m = META[name]
	if not m then return x - 16, y - 16, x + 16, y + 16 end
	return x - m[4], y - m[5], x - m[4] + m[2], y - m[5] + m[3], m
end

-- Объект под пальцем (по картинке): ближний к камере, как Farm.pick в JS
function V:pick(wx, wy)
	local best, bd, bwy = nil, -math.huge, 0
	for id, e in pairs(self.objs) do
		local o = e.o
		local m = META[e.name]
		if m then
			local big = o.type == 'house' or o.type == 'boulder'
			local kx = big and 0.9 or 0.62
			local w, hh, ax, ay = m[2], m[3], m[4], m[5]
			if wx >= o.wx - ax * kx and wx <= o.wx + (w - ax) * kx and wy >= o.wy - ay * 0.92 and wy <= o.wy + (big and (hh - ay) * 0.8 or 6) then
				if o.depth > bd or (o.depth == bd and o.wy > bwy) then best, bd, bwy = o, o.depth, o.wy end
			end
		end
	end
	return best
end

-- ---------- грядки: растения и значки ----------
function V:sync_crops(t)
	local f = self.f
	local bob = math.sin(t * 4) * 1.5
	for i, b in pairs(f.beds) do
		local e = self.crops[i]
		local soil = f.world.tiles[i] == T.SOIL
		if b.crop and soil then
			local stage, ready, needs = f:crop_flags(b)
			local name = 'crop_' .. b.crop .. '_' .. stage
			if not e then e = self:spawn(self.fw, name, b.wx, b.wy, zd(b.x + b.y + 1, b.wy)); self.crops[i] = e
			else self:set_anim(e, name) end
			local bub = ready and 'bubble_ready' or (needs and 'bubble_water' or nil)
			local be = self.bubbles[i]
			if bub then
				if not be then be = self:spawn(self.fw, bub, b.wx, b.wy - 26, Z_OVER); self.bubbles[i] = be end
				self:set_anim(be, bub)
				self:set_pos(be, b.wx, b.wy - 26 + bob, Z_OVER + b.wy * 1e-5)
			elseif be then self:delete(be); self.bubbles[i] = nil end
		else
			if e then self:delete(e); self.crops[i] = nil end
			if self.bubbles[i] then self:delete(self.bubbles[i]); self.bubbles[i] = nil end
		end
		-- политая/сухая грядка
		if soil then
			local g = self.ground[i]
			local wet = false
			if b.crop then local _, ready, needs = f:crop_flags(b); wet = not needs and not ready end
			local want = wet and 'bed_wet' or 'bed_dry'
			if g and g.bed and g.bed.name ~= want then self:set_anim(g.bed, want) end
		end
	end
end

-- ---------- призрак ----------
function V:sync_player()
	local p = self.f.player
	local px, py = p:world_pos()
	local depth = p.x + p.y
	local z0 = zd(depth, py)
	self.pz = z0
	-- тень: сжимается, когда призрак поднимается выше
	local fb = p.sk.bone_map.float
	local lift = fb and math.max(0, -fb.ty) or 0
	local k = math.max(0.55, 1.15 - lift * 0.035)
	local sh = self.ghost.shadow
	if not sh then sh = self:spawn(self.fw, 'circle', px, py, z0 - 1e-6); self.ghost.shadow = sh; sh.sy = 1 end
	self:set_pos(sh, px, py, z0 - 1e-6)
	go.set_scale(vmath.vector3(18 * k / 24, 8 * k / 24, 1), sh.id)
	self:set_tint(sh, 20 / 255, 40 / 255, 10 / 255, 0.24 * k)
	local parts = self.ghost
	local used = p.sk:each_draw(px, py, 1, p.flip, function(n, att, a, b, c, d, e, f)
		local s = parts[n]
		if not s then s = self:spawn(self.fw, att.sprite, e, f, z0); parts[n] = s end
		if s.name ~= att.sprite then s.name = att.sprite; sprite.play_flipbook(s.url, h(att.sprite)); s.s = META[att.sprite][1] end
		if s.hidden then msg.post(s.url, 'enable'); s.hidden = false end
		-- матрица (y вниз) → Defold (y вверх): поворот и масштаб, без сдвига
		local sx = math.sqrt(a * a + b * b)
		local rot = math.atan2(-b, a)
		local sy = (a * d - b * c) / sx
		local v = self.v1
		v.x, v.y, v.z = e, -f, z0 + n * 1e-5
		go.set_position(v, s.id)
		go.set_rotation(vmath.quat_rotation_z(rot), s.id)
		go.set_scale(vmath.vector3(sx * s.s, sy * s.s, 1), s.id)
		self:set_tint(s, 1, 1, 1, self.ghost_alpha or 1)
	end)
	for n = used + 1, #parts do
		local s = parts[n]
		if s and not s.hidden then msg.post(s.url, 'disable'); s.hidden = true end
	end
end

-- ---------- прозрачность того, что закрывает призрака и выбранную клетку ----------
function V:sync_fade()
	local f, w = self.f, self.f.world
	local p = f.player
	local px, py = p:world_pos()
	local F = { { x0 = px - 11, y0 = py - 50, x1 = px + 11, y1 = py, depth = p.x + p.y, gx = -1, gy = -1, tx = p:tx(), ty = p:ty() } }
	for _, t in ipairs({ f.hover, f.tap_fx }) do
		if t and w:inside(t.x, t.y) then
			local x, y = iso.to_world(t.x + 0.5, t.y + 0.5)
			F[#F + 1] = { x0 = x - 32 + 6, y0 = y - 16 + 3, x1 = x + 32 - 6, y1 = y + 16 - 3, depth = t.x + t.y + 1, gx = t.x, gy = t.y, tx = t.x, ty = t.y }
		end
	end
	local hidden = false
	local seen = {}
	for _, fc in ipairs(F) do
		-- высокие объекты стоят не дальше нескольких клеток «перед» точкой
		for gy = fc.ty - 1, fc.ty + 5 do for gx = fc.tx - 1, fc.tx + 5 do
			local o = w:object_at(gx, gy)
			if o and not seen[o.id] then
				seen[o.id] = true
				local e = self.objs[o.id]
				if e then
					local x0, y0, x1, _, m = box(e.name, o.wx, o.wy)
					local fade = 0
					if m and m[3] >= 30 then
						local y1 = o.wy - m[3] * 0.08
						for _, q in ipairs(F) do
							if o.depth > q.depth + 0.05 and not (q.gx >= o.gx and q.gx < o.gx + o.w and q.gy >= o.gy and q.gy < o.gy + o.h)
								and not (x1 < q.x0 or x0 > q.x1 or y1 < q.y0 or y0 > q.y1) then
								fade = 1
								if q == F[1] then hidden = true end
							end
						end
					end
					e.want_fade = fade
				end
			end
		end end
	end
	-- плавно: и к прозрачности, и обратно
	self.fading = self.fading or {}
	for id in pairs(seen) do self.fading[id] = true end
	for id in pairs(self.fading) do
		local e = self.objs[id]
		if not e then self.fading[id] = nil
		else
			local want = seen[id] and (e.want_fade or 0) or 0
			e.fade = (e.fade or 0) + (want - (e.fade or 0)) * 0.3
			if e.fade < 0.02 and want == 0 then e.fade = 0; self.fading[id] = nil end
			local a = 1 - 0.62 * e.fade
			local s = e.shade or 1
			self:set_tint(e, s, s, s, a)
		end
	end
	return hidden
end

-- ---------- частицы, рамки, леска ----------
function V:sync_particles()
	local P = self.f.particles
	local parts = self.parts
	for i = 1, #P do
		local q = P[i]
		local e = parts[i]
		if not e then e = self:take('px'); parts[i] = e end
		local c = col(q.c)
		local a = math.max(0, 1 - q.t / q.life)
		self:set_tint(e, c.x, c.y, c.z, a)
		self:set_pos(e, q.x, q.y, Z_OVER + 0.5)
		if e.ps ~= q.s then e.ps = q.s; go.set_scale(vmath.vector3(q.s / 8, q.s / 8, 1), e.id) end
	end
	for i = #parts, #P + 1, -1 do self:give(parts[i]); parts[i] = nil end
end

function V:outline(key, t, x, y, a, r, g, b)
	local e = self[key]
	if not t then
		if e and not e.hidden then msg.post(e.url, 'disable'); e.hidden = true end
		return
	end
	if not e then e = self:spawn(self.fw, 'outline', 0, 0, Z_OVER - 0.2); self[key] = e end
	if e.hidden then msg.post(e.url, 'enable'); e.hidden = false end
	local wx, wy = iso.to_world(x + 0.5, y + 0.5)
	self:set_pos(e, wx, wy, Z_OVER - 0.2)
	self:set_tint(e, r, g, b, a)
end

-- пунктир по границе открытой земли (пересобирается при открытии участка)
function V:sync_border()
	for _, e in ipairs(self.dashes) do self:give(e) end
	self.dashes = {}
	local w = self.f.world
	local function open(cx, cy) return cx >= 0 and cy >= 0 and cx < CHUNKS and cy < CHUNKS and w.unlocked[cy * CHUNKS + cx] == 1 end
	local function seg(ax, ay, bx, by)
		local x0, y0 = iso.to_world(ax, ay)
		local x1, y1 = iso.to_world(bx, by)
		local dx, dy = x1 - x0, y1 - y0
		local L = math.sqrt(dx * dx + dy * dy)
		local ux, uy = dx / L, dy / L
		local rot = vmath.quat_rotation_z(math.atan2(-dy, dx))
		local d = 0
		while d < L do
			local e2 = math.min(L, d + 6)
			local e = self:take('dash')
			local mx, my = x0 + ux * (d + e2) / 2, y0 + uy * (d + e2) / 2
			self:set_pos(e, mx, my, Z_OVER - 0.3)
			go.set_rotation(rot, e.id)
			go.set_scale(vmath.vector3((e2 - d) / 16, 1.5 / 4, 1), e.id)
			self:set_tint(e, 1, 240 / 255, 190 / 255, 0.55)
			self.dashes[#self.dashes + 1] = e
			d = d + 11
		end
	end
	for c = 0, CHUNKS * CHUNKS - 1 do
		if w.unlocked[c] == 1 then
			local cx, cy = c % CHUNKS, math.floor(c / CHUNKS)
			local x0, y0 = cx * CHUNK, cy * CHUNK
			if not open(cx, cy - 1) then seg(x0, y0, x0 + CHUNK, y0) end
			if not open(cx + 1, cy) then seg(x0 + CHUNK, y0, x0 + CHUNK, y0 + CHUNK) end
			if not open(cx, cy + 1) then seg(x0, y0 + CHUNK, x0 + CHUNK, y0 + CHUNK) end
			if not open(cx - 1, cy) then seg(x0, y0, x0, y0 + CHUNK) end
		end
	end
end

-- леска от кончика удочки к поплавку: ломаная из тонких отрезков + поплавок
function V:sync_fishing()
	local f = self.f
	local x, y, bx, by, k, bite, yank = f:fishing_state()
	local L = self.lines
	local used = 0
	local function line(ax, ay, cx, cy, wdt, r, g, b, a)
		used = used + 1
		local e = L[used]
		if not e then e = self:take('px'); L[used] = e end
		self:set_anim(e, 'px')
		local dx, dy = cx - ax, cy - ay
		local len = math.sqrt(dx * dx + dy * dy)
		self:set_pos(e, (ax + cx) / 2, (ay + cy) / 2, Z_OVER + 0.3)
		go.set_rotation(vmath.quat_rotation_z(math.atan2(-dy, dx)), e.id)
		go.set_scale(vmath.vector3(math.max(0.01, len) / 8, wdt / 8, 1), e.id)
		e.ps = nil
		self:set_tint(e, r, g, b, a)
	end
	local function dot(cx, cy, rad, r, g, b, a)
		used = used + 1
		local e = L[used]
		if not e then e = self:take('px'); L[used] = e end
		self:set_anim(e, 'circle')
		self:set_pos(e, cx, cy, Z_OVER + 0.31 + used * 1e-4)
		go.set_rotation(vmath.quat(), e.id)
		go.set_scale(vmath.vector3(rad * 2 / 24, rad * 2 / 24, 1), e.id)
		e.ps = nil
		self:set_tint(e, r, g, b, a)
	end
	if x then
		-- квадратичная кривая (x,y) → (bx,by) через ((x+bx)/2, max(y,by)+6)
		local qx, qy = (x + bx) / 2, math.max(y, by) + 6
		local px, py = x, y
		for i = 1, 8 do
			local t = i / 8
			local u = 1 - t
			local cx, cy = u * u * x + 2 * u * t * qx + t * t * bx, u * u * y + 2 * u * t * qy + t * t * by
			line(px, py, cx, cy, 0.5, 1, 1, 1, 0.85)
			px, py = cx, cy
		end
		if k >= 1 and yank == 0 then
			line(bx - 4 - bite * 3, by + 1.5, bx + 4 + bite * 3, by + 1.5, 0.6, 1, 1, 1, 0.3)
		end
		dot(bx, by, 2.1, 0x3d / 255, 0x2b / 255, 0x1f / 255, 1)
		dot(bx, by + 0.5, 1.5, 1, 1, 1, 1)
		dot(bx, by - 0.4, 1.3, 0xe2 / 255, 0x39 / 255, 0x2f / 255, 1)
	end
	for i = #L, used + 1, -1 do
		local e = L[i]
		self:set_anim(e, 'px'); go.set_rotation(vmath.quat(), e.id)
		self:give(e); L[i] = nil
	end
end

-- ---------- всё вместе ----------
function V:build()
	self:sync_ground()
	self:sync_decor()
	self:sync_objects()
	self:sync_border()
	self.ground_v = self.f.ground_v
	self.unl = self.f.world:unlocked_count()
end

function V:update(dt)
	local f, w = self.f, self.f.world
	local unl = w:unlocked_count()
	if self.unl ~= unl then
		self.unl = unl
		self:sync_ground(); self:sync_decor(); self:sync_border()
		self.ground_v = f.ground_v
		self.obj_v = nil
	elseif self.ground_v ~= f.ground_v then
		self.ground_v = f.ground_v
		self:sync_ground()
	end
	if self.obj_v ~= w.version or self.house_lv ~= f.st.house or self.well_st ~= f.st.well then self:sync_objects() end
	-- дрожь от удара
	for id, e in pairs(self.objs) do
		local o = e.o
		if o.shake > 0 or e.shaking then
			local sh = o.shake > 0 and math.sin(f.time * 70) * 2.2 * (o.shake / 0.25) or 0
			e.shaking = o.shake > 0
			self:set_pos(e, o.wx + sh, o.wy, zd(o.depth, o.wy))
		end
	end
	self:sync_crops(f.time)
	local hidden = self:sync_fade()
	self.ghost_alpha = 1
	self:sync_player()
	-- призрак за объектом: в JS поверх рисуется полупрозрачная копия; здесь объект и так прозрачный
	self:sync_particles()
	local tf = f.tap_fx
	self:outline('o_tap', tf and w:inside(tf.x, tf.y), tf and tf.x, tf and tf.y, tf and math.min(1, tf.t * 2.4) or 0, 1, 250 / 255, 200 / 255)
	local hv = f.hover
	self:outline('o_hover', hv and w:inside(hv.x, hv.y), hv and hv.x, hv and hv.y, 0.75, 1, 1, 1)
	self:sync_fishing()
	return hidden
end

return M
