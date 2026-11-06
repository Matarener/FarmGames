-- Персонаж: перемещение по пути, очередь действий, скелетная анимация (перенос src/game/Player.js).
local skeleton = require('farm.skeleton')
local pathfinding = require('farm.pathfinding')
local iso = require('farm.iso')
local util = require('farm.util')

local M = {}
local TOOL_ANIM = {
	chop = { 'swing', 'axe' }, mine = { 'swing', 'pickaxe' }, dig = { 'swing', 'hoe' },
	water = { 'water', 'can' }, fish = { 'fish', 'rod' }, fill = { 'pick', 'can' }, plant = { 'pick', 'seedbag' }, harvest = { 'pick', false },
}
local MAX_QUEUE = 6

function M.action_key(a)
	return a.kind .. ':' .. (a.obj and ('o' .. a.obj.id) or (a.x .. ',' .. a.y))
end
local action_key = M.action_key

local Player = {}
Player.__index = Player

function M.new(world, data, x, y)
	local self = setmetatable({}, Player)
	self.world = world
	self.x, self.y = x + 0.5, y + 0.5
	self.path = {}
	self.queue = {}
	self.current = nil
	self.state = 'idle'
	self.speed = 3.4 -- клеток в секунду
	self.flip, self.back = false, false
	self.sk = skeleton.new_skeleton(data)
	self.anim = skeleton.new_state(self.sk, data.animations)
	self.anim:play('idle')
	self.anim.on_event = function(name) if name == 'hit' and self.current and self.state == 'work' then self:on_hit() end end
	self.anim.on_complete = function(name) if name == 'happy' then self.anim:play('idle') end end
	self.handlers = nil -- { can_start(a), perform(a) → продолжать?, started(a), fail(a, why) }
	self.idle_time = 0
	return self
end

function Player:tx() return math.floor(self.x) end
function Player:ty() return math.floor(self.y) end
function Player:busy() return self.state ~= 'idle' or #self.queue > 0 end

function Player:enqueue(a)
	if #self.queue >= MAX_QUEUE then return false end
	local key = action_key(a)
	if self.current and action_key(self.current) == key then return false end
	for _, q in ipairs(self.queue) do if action_key(q) == key then return false end end
	self.queue[#self.queue + 1] = a
	return true
end

-- Действие, которое нужно выполнить перед текущим (например, набрать воды)
function Player:push_front(a) table.insert(self.queue, 1, a) end

function Player:clear()
	self.queue = {}; self.current = nil; self.path = {}; self.state = 'idle'
	self.sk.override.tool = false
	self.anim:play('idle')
end

function Player:celebrate() if self.state == 'idle' then self.anim:play('happy', { restart = true, loop = false }) end end

-- Цели, где можно встать для действия: соседние клетки объекта/тайла
function Player:goals(a)
	if a.kind == 'walk' then return { { a.x, a.y } } end
	local x0, y0 = a.obj and a.obj.gx or a.x, a.obj and a.obj.gy or a.y
	local w, h = a.obj and a.obj.w or 1, a.obj and a.obj.h or 1
	local out = {}
	for y = y0 - 1, y0 + h do for x = x0 - 1, x0 + w do
		if not (x >= x0 and x < x0 + w and y >= y0 and y < y0 + h) and self.world:walkable(x, y) then out[#out + 1] = { x, y } end
	end end
	return out
end

function Player:start(a)
	self.current = a
	local W = self.world
	local path = pathfinding.find_path(W.N or 50, W.N or 50, function(x, y) return W:walkable(x, y) end, self:tx(), self:ty(), self:goals(a))
	if not path then self.handlers.fail(a, 'path'); self.current = nil; return end
	self.path = path
	if #path > 0 then self.state = 'walk'; self.sk.override.tool = false; self.anim:play('walk')
	else self:arrive() end
end

function Player:arrive()
	local a = self.current
	if a.kind == 'walk' then self.current = nil; self.state = 'idle'; self.anim:play('idle'); return end
	if not self.handlers.can_start(a) then self.current = nil; self.state = 'idle'; self.anim:play('idle'); return end
	-- повернуться к цели
	local cx = a.obj and (a.obj.gx + a.obj.w / 2) or (a.x + 0.5)
	local cy = a.obj and (a.obj.gy + a.obj.h / 2) or (a.y + 0.5)
	self:face(cx - self.x, cy - self.y)
	local ta = TOOL_ANIM[a.kind]
	self.sk.override.tool = ta[2]
	self.state = 'work'
	self.anim:play(ta[1], { restart = true, mix = 0.12 })
	if self.handlers.started then self.handlers.started(a) end
end

function Player:on_hit()
	local go = self.handlers.perform(self.current)
	if not go then
		self.current = nil
		self.state = 'idle'
		self.sk.override.tool = false
		self.anim:play('idle', { mix = 0.2 })
	end
end

-- Направление в координатах сетки → ракурс и отражение на экране
function Player:face(dgx, dgy)
	local sx, sy = dgx - dgy, dgx + dgy
	if math.abs(sx) > 0.01 then self.flip = sx < 0 end
	if math.abs(sy) > 0.01 then self.back = sy < 0 end
	self.sk:set_skin(self.back and 'back' or 'default')
end

function Player:update(dt)
	if self.state == 'idle' and #self.queue > 0 then self:start(table.remove(self.queue, 1)) end
	if self.state == 'walk' then
		local move = self.speed * dt
		while move > 0 and #self.path > 0 do
			local nx, ny = self.path[1][1], self.path[1][2]
			-- клетка могла стать непроходимой — перестроить путь
			if not self.world:walkable(nx, ny) then
				local a = self.current
				self.path = {}; self.state = 'idle'
				self:start(a)
				return
			end
			local tx, ty = nx + 0.5, ny + 0.5
			local dx, dy = tx - self.x, ty - self.y
			local d = util.hypot(dx, dy)
			self:face(dx, dy)
			if d <= move then self.x, self.y = tx, ty; table.remove(self.path, 1); move = move - d
			else self.x = self.x + dx / d * move; self.y = self.y + dy / d * move; move = 0 end
		end
		if #self.path == 0 then self:arrive() end
	end
	if self:busy() or self.anim:name() ~= 'idle' then self.idle_time = 0 else self.idle_time = self.idle_time + dt end
	self.anim:update(dt)
	self.anim:apply()
end

function Player:world_pos() return iso.to_world(self.x, self.y) end

return M
