-- Карта мира из файла map/farm.tilemap, который рисуют в редакторе Defold.
-- В редакторе карта ровная («вид сверху»): клетка слева сверху — верхний угол ромба в игре,
-- вправо идёт ось gx (в игре вправо-вниз), вниз — ось gy (в игре влево-вниз).
-- Слои: ground — земля, objects — объекты (дом и валун 2×2 ставятся в левую верхнюю клетку),
-- zones — участки, открытые с начала. Номера плиток — как в tools/make_map.py.
local M = {}

M.GROUND = { [0] = 'grass', [1] = 'path', [2] = 'water', [3] = 'soil' }
-- номер плитки → { тип объекта, картинка }
M.OBJECTS = {
	[8] = { 'oak', 'tree_oak' }, [9] = { 'oak', 'tree_birch' },
	[10] = { 'oak2', 'tree_sakura' }, [11] = { 'oak2', 'tree_blossom' }, [12] = { 'oak2', 'tree_autumn' },
	[13] = { 'apple', 'tree_apple' }, [14] = { 'pine', 'tree_pine' },
	[15] = { 'bush', 'bush_pink' }, [16] = { 'bush', 'bush_hydra' }, [17] = { 'bush', 'bush_lav' }, [18] = { 'bush', 'bush_rose' },
	[19] = { 'berry', 'bush_blue' }, [20] = { 'berry', 'bush_rasp' },
	[21] = { 'rock', 'rock_mid' }, [22] = { 'rock', 'rock_small' },
	[23] = { 'boulder', 'rock_big' }, [24] = { 'boulder', 'rock_moss' },
	[25] = { 'house' }, [26] = { 'well' }, [27] = { 'player' },
}
M.OPEN = 32

-- Прочитать карту из компонента tilemap. Возвращает
-- { n, ground = {[i] = 'grass'...}, objects = {{type, sprite, gx, gy}...}, player = {x, y}, open = {[i] = true} }
-- или nil, если карты нет. i = gy * n + gx.
function M.read(url, n)
	local ok, bx, by, bw, bh = pcall(tilemap.get_bounds, url)
	if not ok or not bw or bw == 0 then return nil end
	local m = { n = n, ground = {}, objects = {}, open = {} }
	local function each(layer, fn)
		for ty = by, by + bh - 1 do
			local gy = (by + bh - 1) - ty
			for tx = bx, bx + bw - 1 do
				local gx = tx - bx
				if gx < n and gy < n then
					local t = tilemap.get_tile(url, layer, tx, ty)
					if t and t > 0 then fn(gx, gy, t - 1) end
				end
			end
		end
	end
	each(hash('ground'), function(gx, gy, t) m.ground[gy * n + gx] = M.GROUND[t] or 'grass' end)
	each(hash('objects'), function(gx, gy, t)
		local d = M.OBJECTS[t]
		if not d then print('map: unknown object tile ' .. t .. ' at ' .. gx .. ',' .. gy); return end
		if d[1] == 'player' then m.player = { gx, gy }
		else m.objects[#m.objects + 1] = { type = d[1], sprite = d[2], gx = gx, gy = gy } end
	end)
	each(hash('zones'), function(gx, gy, t) if t == M.OPEN then m.open[gy * n + gx] = true end end)
	-- порядок объектов — по клеткам (сверху вниз, слева направо): от него зависят id в сохранении
	table.sort(m.objects, function(a, b) if a.gy ~= b.gy then return a.gy < b.gy end return a.gx < b.gx end)
	-- подпись карты: если её поменяли, старая «разница» объектов в сохранении не подходит
	local h = 5381
	for _, o in ipairs(m.objects) do
		local s = o.type .. (o.sprite or '') .. o.gx .. ',' .. o.gy .. ';'
		for k = 1, #s do h = (h * 33 + s:byte(k)) % 2147483647 end
	end
	m.sig = #m.objects .. ':' .. h
	return m
end

return M
