-- Свой движок скелетной анимации (перенос src/skeleton/Skeleton.js и Animation.js).
-- Кости — иерархия аффинных матриц, слоты — что и в каком порядке рисуется, скины — наборы картинок.
-- Анимации: ключевые кадры rotate/translate/scale со смещением от позы покоя, смена вложений слотов,
-- события и плавный переход между анимациями. Рисует не сам: each_draw отдаёт матрицы вложений.
local M = {}
local DEG = math.pi / 180

-- ---------- Кости и скелет ----------
local Skeleton = {}
Skeleton.__index = Skeleton

function M.new_skeleton(data)
	local self = setmetatable({ data = data, bones = {}, bone_map = {}, slots = {}, slot_map = {} }, Skeleton)
	for _, bd in ipairs(data.bones) do
		local b = { data = bd, parent = bd.parent and self.bone_map[bd.parent] or nil, a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0 }
		self.bones[#self.bones + 1] = b
		self.bone_map[bd.name] = b
	end
	for _, s in ipairs(data.slots) do
		local att = s.attachment or nil
		local slot = { name = s.name, bone = self.bone_map[s.bone], attachment = att, setup = att }
		self.slots[#self.slots + 1] = slot
		self.slot_map[s.name] = slot
	end
	self.skin = 'default'
	self.draw_order = self.slots
	self.override = {} -- имя слота → имя вложения (false — пусто), задаётся кодом (инструмент)
	self:set_to_setup_pose()
	return self
end

function Skeleton:set_skin(name)
	if self.skin == name then return end
	self.skin = name
	local order = self.data.drawOrders and self.data.drawOrders[name]
	if order then
		self.draw_order = {}
		for i, n in ipairs(order) do self.draw_order[i] = self.slot_map[n] end
	else
		self.draw_order = self.slots
	end
end

function Skeleton:set_to_setup_pose()
	for _, b in ipairs(self.bones) do
		local d = b.data
		b.x, b.y, b.rotation = d.x or 0, d.y or 0, d.rotation or 0
		b.scaleX, b.scaleY = d.scaleX or 1, d.scaleY or 1
	end
	for _, s in ipairs(self.slots) do s.attachment = s.setup end
end

function Skeleton:update_world()
	for _, bn in ipairs(self.bones) do
		local r = bn.rotation * DEG
		local cos, sin = math.cos(r), math.sin(r)
		local la, lb = cos * bn.scaleX, sin * bn.scaleX
		local lc, ld = -sin * bn.scaleY, cos * bn.scaleY
		local p = bn.parent
		if p then
			bn.a = p.a * la + p.c * lb; bn.b = p.b * la + p.d * lb
			bn.c = p.a * lc + p.c * ld; bn.d = p.b * lc + p.d * ld
			bn.tx = p.a * bn.x + p.c * bn.y + p.tx
			bn.ty = p.b * bn.x + p.d * bn.y + p.ty
		else
			bn.a, bn.b, bn.c, bn.d, bn.tx, bn.ty = la, lb, lc, ld, bn.x, bn.y
		end
	end
end

function Skeleton:get_attachment(slot, name)
	local skins = self.data.skins
	local sk = skins[self.skin] and skins[self.skin][slot.name]
	return (sk and sk[name]) or (skins.default[slot.name] and skins.default[slot.name][name]) or nil
end

local function prep(att)
	if att._m then return att end
	local r = (att.rotation or 0) * DEG
	att._m = { math.cos(r), math.sin(r), -math.sin(r), math.cos(r), att.x or 0, att.y or 0 }
	return att
end

-- cb(i, att, a, b, c, d, e, f): i — номер по порядку отрисовки, матрица «вложение → мир» (y вниз)
function Skeleton:each_draw(x, y, scale, flip, cb)
	local ba, bd = flip and -scale or scale, scale
	local n = 0
	for _, slot in ipairs(self.draw_order) do
		local name = self.override[slot.name]
		if name == nil then name = slot.attachment end
		if name then
			local att = self:get_attachment(slot, name)
			if att then
				prep(att)
				local m, bn = att._m, slot.bone
				local wa, wb = bn.a * m[1] + bn.c * m[2], bn.b * m[1] + bn.d * m[2]
				local wc, wd = bn.a * m[3] + bn.c * m[4], bn.b * m[3] + bn.d * m[4]
				local we, wf = bn.a * m[5] + bn.c * m[6] + bn.tx, bn.b * m[5] + bn.d * m[6] + bn.ty
				n = n + 1
				cb(n, att, ba * wa, bd * wb, ba * wc, bd * wd, ba * we + x, bd * wf + y)
			end
		end
	end
	return n
end

-- ---------- Анимации ----------
local function ease(c, t)
	if c == 1 then return 0 elseif c == 2 then return t * t * (3 - 2 * t)
	elseif c == 3 then return t * t elseif c == 4 then return 1 - (1 - t) * (1 - t) end
	return t
end

-- ключи: {t, v, curve} (rotate) или {t, x, y, curve} (translate/scale); ci — где лежит кривая
local function seek(keys, time, ci)
	local n = #keys
	if time <= keys[1][1] then return 1, 0 end
	if time >= keys[n][1] then return n, 0 end
	local i = 1
	while i < n and keys[i + 1][1] <= time do i = i + 1 end
	local k0, k1 = keys[i], keys[i + 1]
	local t = (time - k0[1]) / (k1[1] - k0[1])
	return i, ease(k0[ci] or 0, t)
end

local Animation = {}
Animation.__index = Animation

local function new_animation(name, d)
	local self = setmetatable({ name = name, duration = d.duration, loop = d.loop ~= false,
		bones = d.bones or {}, slots = d.slots or {}, events = d.events or {} }, Animation)
	return self
end

function Animation:apply(sk, time, alpha)
	for name, tl in pairs(self.bones) do
		local bone = sk.bone_map[name]
		if bone then
			local sd = bone.data
			if tl.rotate then
				local k = tl.rotate
				local i, t = seek(k, time, 3)
				local v = k[i][2]
				if i < #k then v = v + (k[i + 1][2] - v) * t end
				v = (sd.rotation or 0) + v
				bone.rotation = bone.rotation + (v - bone.rotation) * alpha
			end
			if tl.translate then
				local k = tl.translate
				local i, t = seek(k, time, 4)
				local x, y = k[i][2], k[i][3]
				if i < #k then x = x + (k[i + 1][2] - x) * t; y = y + (k[i + 1][3] - y) * t end
				bone.x = bone.x + ((sd.x or 0) + x - bone.x) * alpha
				bone.y = bone.y + ((sd.y or 0) + y - bone.y) * alpha
			end
			if tl.scale then
				local k = tl.scale
				local i, t = seek(k, time, 4)
				local x, y = k[i][2], k[i][3]
				if i < #k then x = x + (k[i + 1][2] - x) * t; y = y + (k[i + 1][3] - y) * t end
				bone.scaleX = bone.scaleX + ((sd.scaleX or 1) * x - bone.scaleX) * alpha
				bone.scaleY = bone.scaleY + ((sd.scaleY or 1) * y - bone.scaleY) * alpha
			end
		end
	end
	if alpha >= 0.5 then
		for name, keys in pairs(self.slots) do
			local slot = sk.slot_map[name]
			if slot then
				local v = keys[1][2]
				for _, k in ipairs(keys) do if k[1] <= time then v = k[2] end end
				slot.attachment = v or nil
			end
		end
	end
end

-- ---------- Проигрыватель: одна дорожка + плавный переход ----------
local State = {}
State.__index = State

function M.new_state(sk, animations)
	local self = setmetatable({ sk = sk, anims = {}, cur = nil, time = 0, speed = 1, loop = true,
		prev = nil, prev_time = 0, mix = 0, mix_dur = 0 }, State)
	for n, d in pairs(animations) do self.anims[n] = new_animation(n, d) end
	return self
end

function State:name() return self.cur and self.cur.name or nil end

function State:play(name, opts)
	opts = opts or {}
	local a = self.anims[name]
	if not a then return end
	if self.cur == a and not opts.restart then
		if opts.speed then self.speed = opts.speed end
		return
	end
	if self.cur then self.prev = self.cur; self.prev_time = self.time; self.mix = 0; self.mix_dur = opts.mix or 0.15 end
	self.cur = a; self.time = 0
	self.speed = opts.speed or 1
	if opts.loop ~= nil then self.loop = opts.loop else self.loop = a.loop end
end

function State:update(dt)
	local a = self.cur
	if not a then return end
	local t0 = self.time
	local t1 = t0 + dt * self.speed
	local function fire(from, to)
		for _, ev in ipairs(a.events) do
			if ev[1] > from and ev[1] <= to and self.on_event then self.on_event(ev[2], a.name) end
		end
	end
	if t1 >= a.duration then
		fire(t0, a.duration)
		if self.loop then
			t1 = t1 % a.duration
			fire(-1, t1)
			if self.on_complete then self.on_complete(a.name, true) end
		else
			t1 = a.duration
			if t0 < a.duration and self.on_complete then self.on_complete(a.name, false) end
		end
	else
		fire(t0, t1)
	end
	-- play() внутри обратного вызова могла сменить анимацию
	if self.cur == a then self.time = t1 end
	if self.prev then
		self.prev_time = math.min(self.prev.duration, self.prev_time + dt)
		if self.prev.loop then self.prev_time = self.prev_time % self.prev.duration end
		self.mix = self.mix + dt
		if self.mix >= self.mix_dur then self.prev = nil end
	end
end

function State:apply()
	local sk = self.sk
	sk:set_to_setup_pose()
	if self.prev then
		self.prev:apply(sk, self.prev_time, 1)
		self.cur:apply(sk, self.time, math.min(1, self.mix / self.mix_dur))
	elseif self.cur then
		self.cur:apply(sk, self.time, 1)
	end
	sk:update_world()
end

return M
