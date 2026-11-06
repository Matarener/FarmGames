-- Сюжет и цепочка заданий (перенос src/game/quests.js). Задания идут по одному, по порядку.
-- who: 'ghost' — говорит призрак, 'note' — записка бабушки Марфы.
local M = {}

M.QUESTS = {
	{ title = 'Пробуждение', who = 'ghost',
		text = 'Ой… Где это я? Старый домик, заросший сад… Кажется, я здесь уже бывал! А на грядке выросла морковка. Надо её собрать!',
		task = 'Собери урожай с грядки', goal = { ev = 'harvest', n = 1 }, reward = { coins = 10 } },
	{ title = 'Записка у порога', who = 'note',
		text = '«Мой милый призрачок! Раз ты читаешь это, значит, проснулся. Без меня ферма совсем заросла. Посади семена: земля помнит заботу. Твоя бабушка Марфа»',
		task = 'Посади 2 морковки', goal = { ev = 'plant', key = 'carrot', n = 2 }, reward = { coins = 10 } },
	{ title = 'Водичка', who = 'ghost',
		text = 'Без воды ничего не вырастет. Наберу лейку в пруду и полью грядки!',
		task = 'Полей грядки 2 раза', goal = { ev = 'water', n = 2 }, reward = { coins = 10 } },
	{ title = 'Рыбалка', who = 'note',
		text = '«В пруду водятся караси и окуни. Удочка стоит за дверью — вечером на зорьке клюёт лучше всего! Бабушка Марфа»',
		task = 'Поймай 2 рыбы', goal = { ev = 'fish', n = 2 }, reward = { coins = 10 } },
	{ title = 'Дровишки', who = 'ghost',
		text = 'Деревья подступили к самому дому. Бабушка всегда говорила: «Дрова зимой — лучшие друзья». Срублю одно.',
		task = 'Сруби дерево', goal = { ev = 'chop', n = 1 }, reward = { coins = 15 } },
	{ title = 'Корчуем пни', who = 'ghost',
		text = 'От дерева остался пень. Выкорчую его, чтобы освободить место.',
		task = 'Выкорчуй пень', goal = { ev = 'stump', n = 1 }, reward = { coins = 10 } },
	{ title = 'Крепкий фундамент', who = 'note',
		text = '«Камни с поля не выбрасывай: из них выйдет крепкий фундамент для дома. Бабушка Марфа»',
		task = 'Разбей 3 камня', goal = { ev = 'mine', n = 3 }, reward = { coins = 15 } },
	{ title = 'Бабушкин колодец', who = 'note',
		text = '«У грядок стоит мой старый колодец. Почини его, и не придётся бегать с лейкой к пруду. Бабушка Марфа»',
		task = 'Почини колодец', goal = { state = 'well', n = 1 }, reward = { coins = 15 } },
	{ title = 'Новые грядки', who = 'ghost',
		text = 'Двух грядок маловато. Вскопаю ещё, пусть ферма будет большой!',
		task = 'Вскопай 2 грядки', goal = { ev = 'dig', n = 2 }, reward = { coins = 15 } },
	{ title = 'Первый урожай', who = 'ghost',
		text = 'Грядки зазеленели! Если поливать их вовремя, урожай будет быстрее.',
		task = 'Собери 5 урожаев', goal = { ev = 'harvest', n = 5 }, reward = { gems = 1, coins = 10 } },
	{ title = 'На рынок!', who = 'note',
		text = '«На рынке всегда рады свежим овощам. А на вырученные монетки можно подлатать дом. Бабушка Марфа»',
		task = 'Продай 5 урожаев на рынке', goal = { ev = 'sell', n = 5 }, reward = { coins = 20 } },
	{ title = 'За забором', who = 'note',
		text = '«За забором — тоже наша земля. Когда-то там цвели целые поля… А дом подлатаешь, когда ферма подрастёт. Бабушка Марфа»',
		task = 'Открой новый участок', goal = { ev = 'expand', n = 1 }, reward = { coins = 40 } },
	{ title = 'Уютный дом', who = 'ghost',
		text = 'Домик совсем старенький: крыша скрипит, окна дрожат. Пора его подлатать! Нужны дерево, камень и монетки.',
		task = 'Улучши дом до 2 уровня', goal = { state = 'house', n = 2 }, reward = { gems = 2, coins = 30 } },
	{ title = 'Бабушкин хлеб', who = 'ghost',
		text = 'Бабушка пекла самый вкусный хлеб из своей пшеницы. Выращу пшеницу и я!',
		task = 'Собери 5 пшеницы', goal = { ev = 'harvest', key = 'wheat', n = 5 }, reward = { coins = 40, gems = 1 } },
	{ title = 'Золотая рыбка', who = 'note',
		text = '«Говорят, в нашем пруду живёт золотая рыбка. Мне она так и не попалась… Может, повезёт тебе? Бабушка Марфа»',
		task = 'Поймай золотую рыбку', goal = { ev = 'fish', key = 'fish_gold', n = 1 }, reward = { gems = 2 } },
	{ title = 'Ферма оживает', who = 'ghost',
		text = 'Птицы вернулись, в саду пахнет яблоками! Интересно, что ещё бабушка спрятала на ферме?',
		task = 'Достигни 5 уровня', goal = { state = 'level', n = 5 }, reward = { gems = 3 } },
}

M.QUEST_END = { title = 'Продолжение следует', who = 'ghost',
	text = 'Ферма снова живая, и это только начало! Скоро бабушка оставит новые записки.' }

local Q = {}
Q.__index = Q

function M.new(farm) return setmetatable({ farm = farm }, Q) end

-- st.quest: i — номер задания с 0 (как в JS-сохранении), n — счётчик, seen, told, t — название
function Q:st()
	local s = self.farm.st
	if not s.quest then s.quest = { i = 0, n = 0, seen = false } end
	return s.quest
end

-- счётчики за всю игру
function Q:life()
	local s = self.farm.st.stats
	if not s.ev then s.ev = { harvest = s.harvested or 0 } end
	return s.ev
end

function Q:current()
	local st = self:st()
	-- порядок заданий мог поменяться в обновлении: находим своё по названию
	if st.t and (not M.QUESTS[st.i + 1] or M.QUESTS[st.i + 1].title ~= st.t) then
		for j, q in ipairs(M.QUESTS) do if q.title == st.t then st.i = j - 1; break end end
	end
	local q = M.QUESTS[st.i + 1]
	if q then st.t = q.title end
	return q
end

function Q:progress()
	local q = self:current()
	if not q then return 0 end
	if q.goal.state then return math.min(q.goal.n, self.farm.st[q.goal.state] or 0) end
	local key = q.goal.key and (q.goal.ev .. ':' .. q.goal.key) or q.goal.ev
	local life = self:life()[key] or 0
	return math.min(q.goal.n, math.max(self:st().n, life))
end

function Q:done()
	local q = self:current()
	return q ~= nil and self:progress() >= q.goal.n
end

function Q:emit(ev, key, n)
	n = n or 1
	local L = self:life()
	L[ev] = (L[ev] or 0) + n
	if key then L[ev .. ':' .. key] = (L[ev .. ':' .. key] or 0) + n end
	local q = self:current()
	if not q or q.goal.state or q.goal.ev ~= ev or (q.goal.key and q.goal.key ~= key) then return end
	local st = self:st()
	st.n = st.n + n
	self:check()
end

function Q:check()
	local q = self:current()
	if q and self:done() and not self:st().told then
		self:st().told = true
		self.farm.ui:quest_done(q)
		self.farm:sfx('quest')
	end
end

function Q:claim()
	if not self:done() then return false end
	local q, st = self:current(), self.farm.st
	st.coins = st.coins + (q.reward.coins or 0)
	st.gems = st.gems + (q.reward.gems or 0)
	self.farm:sfx('coin')
	self.farm:add_xp(5)
	self.farm.player:celebrate()
	st.quest = { i = self:st().i + 1, n = 0, seen = false }
	self.farm:changed()
	return true
end

return M
