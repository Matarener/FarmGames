-- Общие мелочи: детерминированный ГПСЧ (как в JS — тот же мир из того же seed), хэш, таблицы.
local M = {}
local band, bor, bxor, rshift, lshift, tobit = bit.band, bit.bor, bit.bxor, bit.rshift, bit.lshift, bit.tobit

-- Math.imul: 32-битное умножение без потери точности в double
local function imul(a, b)
	local ah, al = band(rshift(a, 16), 0xffff), band(a, 0xffff)
	local bh, bl = band(rshift(b, 16), 0xffff), band(b, 0xffff)
	return tobit(al * bl + lshift(tobit(ah * bl + al * bh), 16))
end
M.imul = imul

local function u32(x) if x < 0 then x = x + 4294967296 end return x end

function M.mulberry32(a)
	a = tobit(a)
	return function()
		a = tobit(a + 0x6D2B79F5)
		local t = imul(bxor(a, rshift(a, 15)), bor(1, a))
		t = bxor(tobit(t + imul(bxor(t, rshift(t, 7)), bor(61, t))), t)
		return u32(bxor(t, rshift(t, 14))) / 4294967296
	end
end

function M.hash2(x, y)
	local h = tobit(x * 374761393 + y * 668265263)
	h = imul(bxor(h, rshift(h, 13)), 1274126177)
	return u32(bxor(h, rshift(h, 16))) / 4294967296
end

function M.floor(x) return math.floor(x) end
function M.clamp(v, a, b) if v < a then return a elseif v > b then return b end return v end
function M.hypot(x, y) return math.sqrt(x * x + y * y) end
function M.round(x) return math.floor(x + 0.5) end

function M.copy(t)
	if type(t) ~= 'table' then return t end
	local r = {}
	for k, v in pairs(t) do r[k] = M.copy(v) end
	return r
end

-- Время в «4 мин 10 с» (как fmtTime в JS)
function M.fmt_time(sec)
	sec = math.ceil(sec)
	if sec < 60 then return sec .. ' с' end
	if sec < 3600 then
		local m, s = math.floor(sec / 60), sec % 60
		return s > 0 and (m .. ' мин ' .. s .. ' с') or (m .. ' мин')
	end
	local h, m = math.floor(sec / 3600), math.floor((sec % 3600) / 60)
	return m > 0 and (h .. ' ч ' .. m .. ' мин') or (h .. ' ч')
end

function M.fmt_clock(sec)
	sec = math.max(0, math.ceil(sec))
	return string.format('%d:%02d', math.floor(sec / 60), sec % 60)
end

function M.fmt_num(n)
	if n >= 10000 then return string.format(n >= 100000 and '%.0fk' or '%.1fk', n / 1000) end
	return tostring(n)
end

return M
