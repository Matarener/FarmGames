-- Изометрия 2:1. Мировые единицы: тайл 64×32, y вниз (как в JS); в Defold y = -wy.
local M = { TILE_W = 64, TILE_H = 32, HW = 32, HH = 16 }

function M.to_world(gx, gy) return (gx - gy) * 32, (gx + gy) * 16 end
function M.to_grid(wx, wy) return (wx / 32 + wy / 16) / 2, (wy / 16 - wx / 32) / 2 end

return M
