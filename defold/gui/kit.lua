-- Мелкие помощники интерфейса поверх Defold GUI. Координаты — «точки» (≈ CSS-пиксели телефона)
-- от левого верхнего угла родителя; всё переводится в пиксели окна через app.dpi.
-- Вызывать только из gui-скрипта.
local app = require('farm.app')
local M = {}

local FONT_PX = 40 -- размер шрифта ui.font
M.FONT_PX = FONT_PX

function M.c(hex, a)
	local r, g, b = hex:match('#?(%x%x)(%x%x)(%x%x)')
	return vmath.vector4(tonumber(r, 16) / 255, tonumber(g, 16) / 255, tonumber(b, 16) / 255, a or 1)
end
local c = M.c
M.INK, M.PAPER, M.PAPER2, M.WOOD, M.GOLD, M.GREEN = c('#3d2b1f'), c('#fff6e3'), c('#f6e6c4'), c('#b5773f'), c('#f2b51d'), c('#5fb03a')
M.WHITE = vmath.vector4(1, 1, 1, 1)

function M.px(v) return v * app.dpi end

local function pos(parent, x, y)
	local d = app.dpi
	if parent then return vmath.vector3(x * d, -y * d, 0) end
	return vmath.vector3(x * d, app.H - y * d, 0)
end
M.pos = pos

-- пустой узел-контейнер (для слоёв и групп)
function M.group(parent, x, y)
	local n = gui.new_box_node(pos(parent, x or 0, y or 0), vmath.vector3(0, 0, 0))
	gui.set_pivot(n, gui.PIVOT_NW)
	gui.set_color(n, vmath.vector4(1, 1, 1, 1)) -- размер 0: сам не виден, прозрачность передаёт детям
	if parent then gui.set_parent(n, parent) end
	return n
end

-- прямоугольник; style: 'round' (скругление), 'pill' (капсула), nil (прямой)
function M.box(parent, x, y, w, h, color, style)
	local d = app.dpi
	local n = gui.new_box_node(pos(parent, x, y), vmath.vector3(w * d, h * d, 0))
	gui.set_pivot(n, gui.PIVOT_NW)
	gui.set_size_mode(n, gui.SIZE_MODE_MANUAL)
	gui.set_texture(n, 'gui')
	if style == 'pill' then
		gui.play_flipbook(n, 'ui_pill')
		-- полные углы текстуры (радиус 32); при низком узле Defold сжимает их сам
		gui.set_slice9(n, vmath.vector4(32, 32, 32, 32))
	elseif style == 'round' then
		gui.play_flipbook(n, 'ui_round')
		gui.set_slice9(n, vmath.vector4(16, 16, 16, 16))
	else
		gui.play_flipbook(n, 'ui_px')
	end
	gui.set_size(n, vmath.vector3(w * d, h * d, 0))
	gui.set_color(n, color or M.WHITE)
	if parent then gui.set_parent(n, parent) end
	return n
end

-- рамка: внешний прямоугольник цвета обводки и внутренний поверх
function M.frame(parent, x, y, w, h, fill, line, lw, style)
	lw = lw or 2
	local o = M.box(parent, x, y, w, h, line or M.INK, style)
	local i = M.box(o, lw, lw, w - lw * 2, h - lw * 2, fill, style)
	return o, i
end

function M.icon(parent, name, x, y, size, tex)
	local d = app.dpi
	local n = gui.new_box_node(pos(parent, x, y), vmath.vector3(size * d, size * d, 0))
	gui.set_pivot(n, gui.PIVOT_NW)
	gui.set_size_mode(n, gui.SIZE_MODE_MANUAL)
	gui.set_texture(n, tex or 'gui')
	gui.play_flipbook(n, name)
	gui.set_size(n, vmath.vector3(size * d, size * d, 0))
	if parent then gui.set_parent(n, parent) end
	return n
end

-- текст: size — кегль в точках; opts: { color, outline, wrap (ширина в точках), pivot, bold }
function M.text(parent, str, x, y, size, opts)
	opts = opts or {}
	local d = app.dpi
	local n = gui.new_text_node(pos(parent, x, y), str)
	gui.set_font(n, 'ui')
	gui.set_pivot(n, opts.pivot or gui.PIVOT_NW)
	local k = size * d / FONT_PX
	gui.set_scale(n, vmath.vector3(k, k, 1))
	gui.set_color(n, opts.color or M.INK)
	gui.set_outline(n, opts.outline or vmath.vector4(0, 0, 0, 0))
	gui.set_shadow(n, vmath.vector4(0, 0, 0, 0))
	if opts.wrap then
		gui.set_line_break(n, true)
		gui.set_size(n, vmath.vector3(opts.wrap * d / k, 0, 0))
	end
	if parent then gui.set_parent(n, parent) end
	return n
end

-- прозрачность узла (дети наследуют)
function M.alpha(n, a)
	local col = gui.get_color(n)
	col.w = a
	gui.set_color(n, col)
end

-- размер текста в точках
function M.measure(n)
	local m
	if gui.get_text_metrics_from_node then
		m = gui.get_text_metrics_from_node(n)
	else
		-- Defold 1.10+: метрики через ресурс шрифта
		local font = gui.get_font_resource(gui.get_font(n))
		local opts = {}
		if gui.get_line_break(n) then
			opts = { width = gui.get_size(n).x, line_break = true,
				leading = gui.get_leading(n), tracking = gui.get_tracking(n) }
		end
		m = resource.get_text_metrics(font, gui.get_text(n), opts)
	end
	local s = gui.get_scale(n)
	return m.width * s.x / app.dpi, m.height * s.y / app.dpi
end

-- строка из кусков: строки и { icon = 'coin' }; возвращает ширину в точках
function M.rich(parent, parts, x, y, size, opts)
	if type(parts) == 'string' then parts = { parts } end
	local cx = x
	for _, p in ipairs(parts) do
		if type(p) == 'table' and p.icon then
			M.icon(parent, 'ic_' .. p.icon, cx, y + size * 0.05, size * 1.15)
			cx = cx + size * 1.2
		elseif p ~= '' then
			local t = M.text(parent, tostring(p), cx, y, size, opts)
			cx = cx + (M.measure(t))
		end
	end
	return cx - x
end

-- ширина строки из кусков без отрисовки (приблизительно для иконок)
function M.rich_width(parts, size)
	if type(parts) == 'string' then parts = { parts } end
	local w = 0
	local tmp = gui.new_text_node(vmath.vector3(-9999, -9999, 0), '')
	gui.set_font(tmp, 'ui')
	local k = size * app.dpi / FONT_PX
	gui.set_scale(tmp, vmath.vector3(k, k, 1))
	for _, p in ipairs(parts) do
		if type(p) == 'table' and p.icon then w = w + size * 1.2
		elseif p ~= '' then gui.set_text(tmp, tostring(p)); w = w + (M.measure(tmp)) end
	end
	gui.delete_node(tmp)
	return w
end

return M
