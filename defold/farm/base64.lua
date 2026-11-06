-- base64 (как btoa/atob для строки байтов)
local M = {}
local A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local D = {}
for i = 1, 64 do D[A:byte(i)] = i - 1 end

function M.encode(s)
	local out = {}
	for i = 1, #s, 3 do
		local a, b, c = s:byte(i, i + 2)
		local n = a * 65536 + (b or 0) * 256 + (c or 0)
		local c1, c2, c3, c4 = math.floor(n / 262144) % 64, math.floor(n / 4096) % 64, math.floor(n / 64) % 64, n % 64
		out[#out + 1] = A:sub(c1 + 1, c1 + 1) .. A:sub(c2 + 1, c2 + 1) .. (b and A:sub(c3 + 1, c3 + 1) or '=') .. (c and A:sub(c4 + 1, c4 + 1) or '=')
	end
	return table.concat(out)
end

function M.decode(s)
	s = s:gsub('[^%w%+/]', '')
	local out = {}
	for i = 1, #s, 4 do
		local a, b, c, d = D[s:byte(i)], D[s:byte(i + 1) or 61], D[s:byte(i + 2) or 61], D[s:byte(i + 3) or 61]
		local n = (a or 0) * 262144 + (b or 0) * 4096 + (c or 0) * 64 + (d or 0)
		out[#out + 1] = string.char(math.floor(n / 65536) % 256)
		if c then out[#out + 1] = string.char(math.floor(n / 256) % 256) end
		if d then out[#out + 1] = string.char(n % 256) end
	end
	return table.concat(out)
end

return M
