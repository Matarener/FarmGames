// Сюжет и цепочка заданий. Задания идут по одному, по порядку.
// who: 'ghost' — говорит призрак, 'note' — записка бабушки Марфы.
// goal: { ev, key?, n } — счётчик событий с начала задания,
//       { state, n } — значение из состояния (house, level).

export const QUESTS = [
  {
    title: 'Пробуждение', who: 'ghost',
    text: 'Ой… Где это я? Старый домик, заросший сад… Кажется, я здесь уже бывал! А на грядке выросла морковка. Надо её собрать!',
    task: 'Собери урожай с грядки', goal: { ev: 'harvest', n: 1 }, reward: { coins: 10 },
  },
  {
    title: 'Записка у порога', who: 'note',
    text: '«Мой милый призрачок! Раз ты читаешь это, значит, проснулся. Без меня ферма совсем заросла. Посади семена: земля помнит заботу. Твоя бабушка Марфа»',
    task: 'Посади 2 морковки', goal: { ev: 'plant', key: 'carrot', n: 2 }, reward: { coins: 10 },
  },
  {
    title: 'Водичка', who: 'ghost',
    text: 'Без воды ничего не вырастет. Наберу лейку в пруду и полью грядки!',
    task: 'Полей грядки 2 раза', goal: { ev: 'water', n: 2 }, reward: { coins: 10 },
  },
  {
    title: 'Дровишки', who: 'ghost',
    text: 'Деревья подступили к самому дому. Бабушка всегда говорила: «Дрова зимой — лучшие друзья». Срублю парочку.',
    task: 'Сруби 2 дерева', goal: { ev: 'chop', n: 2 }, reward: { coins: 15 },
  },
  {
    title: 'Корчуем пни', who: 'ghost',
    text: 'После деревьев остались пни. Выкорчую хотя бы один, чтобы освободить место.',
    task: 'Выкорчуй пень', goal: { ev: 'stump', n: 1 }, reward: { coins: 10 },
  },
  {
    title: 'Крепкий фундамент', who: 'note',
    text: '«Камни с поля не выбрасывай: из них выйдет крепкий фундамент для дома. Бабушка Марфа»',
    task: 'Разбей 3 камня', goal: { ev: 'mine', n: 3 }, reward: { coins: 15 },
  },
  {
    title: 'Новые грядки', who: 'ghost',
    text: 'Двух грядок маловато. Вскопаю ещё, пусть ферма будет большой!',
    task: 'Вскопай 2 грядки', goal: { ev: 'dig', n: 2 }, reward: { coins: 15 },
  },
  {
    title: 'Первый урожай', who: 'ghost',
    text: 'Грядки зазеленели! Если поливать их вовремя, урожай будет быстрее.',
    task: 'Собери 5 урожаев', goal: { ev: 'harvest', n: 5 }, reward: { gems: 1, coins: 10 },
  },
  {
    title: 'На рынок!', who: 'note',
    text: '«На рынке всегда рады свежим овощам. А на вырученные монетки можно подлатать дом. Бабушка Марфа»',
    task: 'Продай 5 урожаев на рынке', goal: { ev: 'sell', n: 5 }, reward: { coins: 20 },
  },
  {
    title: 'Уютный дом', who: 'ghost',
    text: 'Домик совсем старенький: крыша скрипит, окна дрожат. Пора его подлатать! Нужны дерево, камень и монетки.',
    task: 'Улучши дом до 2 уровня', goal: { state: 'house', n: 2 }, reward: { gems: 2, coins: 30 },
  },
  {
    title: 'За забором', who: 'note',
    text: '«За забором — тоже наша земля. Когда-то там цвели целые поля… Бабушка Марфа»',
    task: 'Открой новый участок', goal: { ev: 'expand', n: 1 }, reward: { coins: 40 },
  },
  {
    title: 'Бабушкин хлеб', who: 'ghost',
    text: 'Бабушка пекла самый вкусный хлеб из своей пшеницы. Выращу пшеницу и я!',
    task: 'Собери 5 пшеницы', goal: { ev: 'harvest', key: 'wheat', n: 5 }, reward: { coins: 40, gems: 1 },
  },
  {
    title: 'Ферма оживает', who: 'ghost',
    text: 'Птицы вернулись, в саду пахнет яблоками! Интересно, что ещё бабушка спрятала на ферме?',
    task: 'Достигни 5 уровня', goal: { state: 'level', n: 5 }, reward: { gems: 3 },
  },
];

export const QUEST_END = {
  title: 'Продолжение следует', who: 'ghost',
  text: 'Ферма снова живая, и это только начало! Скоро бабушка оставит новые записки.',
};

export class Quests {
  constructor(farm) { this.farm = farm; }

  get st() {
    const s = this.farm.st;
    if (!s.quest) s.quest = { i: 0, n: 0, seen: false };
    return s.quest;
  }

  get current() { return QUESTS[this.st.i] || null; }

  progress() {
    const q = this.current;
    if (!q) return 0;
    if (q.goal.state) return Math.min(q.goal.n, this.farm.st[q.goal.state] || 0);
    return Math.min(q.goal.n, this.st.n);
  }

  get done() { const q = this.current; return !!q && this.progress() >= q.goal.n; }

  // Событие игры: ev — тип, key — уточнение (культура), n — сколько
  emit(ev, key, n = 1) {
    const q = this.current;
    if (!q || q.goal.state || q.goal.ev !== ev || (q.goal.key && q.goal.key !== key)) return;
    const was = this.done;
    this.st.n += n;
    if (!was && this.done) this.completed();
  }

  // Задания по состоянию (дом, уровень) проверяются после каждого изменения
  check() {
    const q = this.current;
    if (q && q.goal.state && this.done && !this.st.told) this.completed();
  }

  completed() {
    this.st.told = true;
    this.farm.ui.questDone(this.current);
    this.farm.tg.haptic('success');
  }

  claim() {
    if (!this.done) return false;
    const q = this.current, st = this.farm.st;
    st.coins += q.reward.coins || 0;
    st.gems += q.reward.gems || 0;
    this.farm.addXp(5);
    this.farm.player.celebrate();
    st.quest = { i: this.st.i + 1, n: 0, seen: false };
    this.farm.changed();
    return true;
  }
}
