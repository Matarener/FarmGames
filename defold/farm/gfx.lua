-- Настройки графики (отдельный файл, не сбрасываются «Новой игрой»):
-- quality — предел плотности пикселей холста в браузере (меньше пикселей — быстрее отрисовка),
-- fps — 60 или 30 кадров, stats — счётчик кадров и профайлер на экране.
local M = { quality = 'high', fps = 60, stats = false }
local PR = { high = 2, mid = 1.5, low = 1, min = 0.75 }
M.LEVELS = { { 'high', 'Высокая' }, { 'mid', 'Средняя' }, { 'low', 'Низкая' }, { 'min', 'Миним.' } }

local function path() return sys.get_save_file('ghostfarm', 'settings') end

function M.load()
	local ok, t = pcall(sys.load, path())
	if ok and type(t) == 'table' then
		if PR[t.quality] then M.quality = t.quality end
		if t.fps == 30 or t.fps == 60 then M.fps = t.fps end
		M.stats = t.stats == true
		return
	end
	-- первый запуск: на телефонах сразу «Средняя» (слабые видеокарты не тянут полную плотность пикселей)
	if html5 then
		local ok2, ua = pcall(html5.run, 'navigator.userAgent')
		if ok2 and ua and (ua:find('Android') or ua:find('iPhone') or ua:find('iPad') or ua:find('Mobile')) then M.quality = 'mid' end
	end
end

function M.save() pcall(sys.save, path(), { quality = M.quality, fps = M.fps, stats = M.stats }) end

function M.ratio() return PR[M.quality] or 2 end

-- Холст в браузере: шаблон Defold ставит ширину = CSS-размер × devicePixelRatio; мы после него
-- ограничиваем множитель. Движок сам замечает новый размер холста (событие resize окна).
local JS = [[(function(K){try{var c=document.getElementById('canvas');if(!c)return;window.__farmPR=K;
function fit(){var r=Math.min(window.devicePixelRatio||1,window.__farmPR),w=c.clientWidth,h=c.clientHeight;if(!w||!h)return;
var W=Math.max(1,Math.round(w*r)),H=Math.max(1,Math.round(h*r));if(c.width!==W||c.height!==H){c.width=W;c.height=H;}}
if(!window.__farmFit){window.__farmFit=fit;var g=function(){setTimeout(fit,0);setTimeout(fit,150);};
window.addEventListener('resize',g);window.addEventListener('orientationchange',g);}
fit();setTimeout(fit,150);}catch(e){}})(%s)]]

function M.apply()
	if html5 then pcall(html5.run, JS:format(M.ratio())) end
	pcall(sys.set_update_frequency, M.fps == 30 and 30 or 0)
end

function M.set(k, v)
	M[k] = v
	M.save()
	M.apply()
end

return M
