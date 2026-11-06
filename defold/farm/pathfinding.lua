-- A* по сетке, 8 направлений без срезания углов, несколько целей сразу.
-- Путь — список клеток {x, y} без стартовой.
local M = {}
local SQ2 = math.sqrt(2)
local DIRS = { { 1, 0, 1 }, { -1, 0, 1 }, { 0, 1, 1 }, { 0, -1, 1 }, { 1, 1, SQ2 }, { 1, -1, SQ2 }, { -1, 1, SQ2 }, { -1, -1, SQ2 } }

local g, came, state = {}, {}, {}
local heap, heapF = {}, {}

function M.find_path(w, h, walkable, sx, sy, goals, max_nodes)
	max_nodes = max_nodes or 6000
	if #goals == 0 then return nil end
	for i = 0, w * h - 1 do state[i] = 0 end
	local goal_set = {}
	for _, p in ipairs(goals) do goal_set[p[2] * w + p[1]] = true end
	local start = sy * w + sx
	if goal_set[start] then return {} end

	local function hfn(x, y)
		local best = math.huge
		for i = 1, #goals do
			local dx, dy = math.abs(goals[i][1] - x), math.abs(goals[i][2] - y)
			local v = dx + dy + (SQ2 - 2) * math.min(dx, dy)
			if v < best then best = v end
		end
		return best
	end

	local size = 0
	local function push(i, f)
		local k = size
		size = size + 1
		while k > 0 do
			local p = math.floor((k - 1) / 2)
			if heapF[p] <= f then break end
			heap[k] = heap[p]; heapF[k] = heapF[p]; k = p
		end
		heap[k] = i; heapF[k] = f
	end
	local function pop()
		local top = heap[0]
		size = size - 1
		local li, lf = heap[size], heapF[size]
		local k = 0
		while true do
			local c = 2 * k + 1
			if c >= size then break end
			if c + 1 < size and heapF[c + 1] < heapF[c] then c = c + 1 end
			if heapF[c] >= lf then break end
			heap[k] = heap[c]; heapF[k] = heapF[c]; k = c
		end
		heap[k] = li; heapF[k] = lf
		return top
	end

	g[start] = 0; came[start] = -1; state[start] = 1
	push(start, hfn(sx, sy))
	local visited = 0
	while size > 0 do
		local cur = pop()
		if state[cur] ~= 2 then
			state[cur] = 2
			if goal_set[cur] then
				local path = {}
				local c = cur
				while c ~= start do table.insert(path, 1, { c % w, math.floor(c / w) }); c = came[c] end
				return path
			end
			visited = visited + 1
			if visited > max_nodes then return nil end
			local cx, cy = cur % w, math.floor(cur / w)
			for d = 1, 8 do
				local D = DIRS[d]
				local nx, ny = cx + D[1], cy + D[2]
				if nx >= 0 and ny >= 0 and nx < w and ny < h then
					local ni = ny * w + nx
					if state[ni] ~= 2 and walkable(nx, ny)
						and (d <= 4 or (walkable(cx + D[1], cy) and walkable(cx, cy + D[2]))) then
						local ng = g[cur] + D[3]
						if not (state[ni] == 1 and ng >= g[ni]) then
							g[ni] = ng; came[ni] = cur; state[ni] = 1
							push(ni, ng + hfn(nx, ny))
						end
					end
				end
			end
		end
	end
	return nil
end

return M
