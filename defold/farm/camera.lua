-- Камера: центр в мировых координатах (y вниз), зум, инерция, границы (перенос src/engine/Camera.js).
-- Экранные координаты — «точки» интерфейса (px / dpi), начало сверху слева, как в JS.
local M = {}
local C = {}
C.__index = C

function M.new()
	return setmetatable({ x = 0, y = 0, zoom = 1, min_zoom = 0.5, max_zoom = 2.6, view_w = 1, view_h = 1,
		bounds = nil, vx = 0, vy = 0, dragging = false }, C)
end

function C:set_viewport(w, h) self.view_w, self.view_h = w, h; self:clamp() end

function C:screen_to_world(sx, sy)
	return (sx - self.view_w / 2) / self.zoom + self.x, (sy - self.view_h / 2) / self.zoom + self.y
end

function C:world_to_screen(wx, wy)
	return (wx - self.x) * self.zoom + self.view_w / 2, (wy - self.y) * self.zoom + self.view_h / 2
end

function C:pan_by(dx, dy)
	self.x = self.x - dx / self.zoom
	self.y = self.y - dy / self.zoom
	self:clamp()
end

function C:zoom_at(factor, sx, sy)
	local z = math.min(self.max_zoom, math.max(self.min_zoom, self.zoom * factor))
	if z == self.zoom then return end
	local bx = (sx - self.view_w / 2) / self.zoom + self.x
	local by = (sy - self.view_h / 2) / self.zoom + self.y
	self.zoom = z
	self.x = bx - (sx - self.view_w / 2) / z
	self.y = by - (sy - self.view_h / 2) / z
	self:clamp()
end

function C:fling(vx, vy) self.vx, self.vy = vx, vy end
function C:center_on(wx, wy) self.x, self.y = wx, wy; self:clamp() end

function C:clamp()
	local b = self.bounds
	if not b then return end
	self.x = math.min(b.maxX, math.max(b.minX, self.x))
	self.y = math.min(b.maxY, math.max(b.minY, self.y))
end

function C:update(dt)
	if self.dragging then return end
	if math.abs(self.vx) + math.abs(self.vy) < 5 then self.vx, self.vy = 0, 0; return end
	self:pan_by(self.vx * dt, self.vy * dt)
	local k = math.exp(-5 * dt)
	self.vx = self.vx * k; self.vy = self.vy * k
end

function C:animating() return self.vx ~= 0 or self.vy ~= 0 end

return M
