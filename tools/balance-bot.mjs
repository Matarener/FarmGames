// Бот баланса: проходит ферму на реальной генерации карты и проверяет,
// хватает ли дерева/камня/руды с участков на расширения и улучшения дома.
//   node tools/balance-bot.mjs [число карт]
import { World, CHUNKS } from '../src/game/World.js';
import { OBJECTS, HOUSE, CROPS, expansionCost, ENERGY_REGEN_SEC, xpToNext, houseNeedChunks } from '../src/game/data.js';

const RUNS = +process.argv[2] || 200;
const avg = ([a, b]) => (a + b) / 2;

function objsIn(w, c) {
  return w.objects.filter((o) => o && o.type !== 'house' && w.chunkOf(o.gx, o.gy) === c);
}

// сколько даёт расчистка участка: ресурсы, энергия (удары), опыт
function yieldOf(objs) {
  const r = { wood: 0, stone: 0, ore: 0, hits: 0, xp: 0 };
  for (const o of objs) {
    const d = OBJECTS[o.type];
    for (const [k, v] of Object.entries(d.drops || {})) r[k] += avg(v);
    if (d.oreChance) r.ore += d.oreChance * avg(d.ore || [1, 2]);
    r.hits += d.hp; r.xp += d.xp || 1;
    if (d.stump) { const s = OBJECTS.stump; r.wood += avg(s.drops.wood); r.hits += s.hp; r.xp += s.xp; }
  }
  return r;
}

function neighbors(c) {
  const x = c % CHUNKS, y = (c / CHUNKS) | 0, out = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < CHUNKS && ny < CHUNKS) out.push(ny * CHUNKS + nx);
  }
  return out;
}

// доход монет в час: грядки с лучшей культурой уровня (полив вовремя), продажа
function coinsPerHour(level, beds) {
  let best = 0;
  for (const c of Object.values(CROPS)) if (c.level <= level) best = Math.max(best, (c.sell - c.seed) / (c.time / 3600));
  return best * beds;
}

const stuck = {}, results = [];
for (let run = 0; run < RUNS; run++) {
  const w = new World((run * 2654435761) >>> 0);
  const open = new Set([...w.unlocked.keys()].filter((c) => w.unlocked[c]));
  const res = { wood: 0, stone: 0, ore: 0 };
  let house = 1, hits = 0, xp = 0, level = 1, coinsSpent = 0, hours = 0, beds = 2;
  const take = (c) => { const y = yieldOf(objsIn(w, c)); res.wood += y.wood; res.stone += y.stone; res.ore += y.ore; hits += y.hits; xp += y.xp; beds += 3; };
  take([...open][0]);
  const log = [];
  for (let step = 0; step < 60; step++) {
    while (xp >= xpToNext(level)) { xp -= xpToNext(level); level++; }
    const H = HOUSE[house], next = HOUSE[house + 1];
    const store = H.storage;
    let did = false;
    // 1) расширение (если дом позволяет)
    if (open.size < H.chunks) {
      const cost = expansionCost(open.size);
      const cand = [...open].flatMap(neighbors).filter((c) => !open.has(c));
      if (cand.length && res.wood >= cost.wood && res.stone >= cost.stone && cost.wood <= store && cost.stone <= store) {
        res.wood -= cost.wood; res.stone -= cost.stone; coinsSpent += cost.coins; hours += cost.coins / Math.max(1, coinsPerHour(level, Math.min(beds, 12)));
        const c = cand[(run + step) % cand.length]; open.add(c); take(c);
        log.push(`участок ${open.size}`); did = true;
      } else if (cand.length) {
        if (!next || res.wood < next.cost.wood || res.stone < next.cost.stone || (next.cost.ore || 0) > res.ore) {
          const why = [cost.wood > store && 'дерево > склада', cost.stone > store && 'камень > склада', res.wood < cost.wood && 'мало дерева', res.stone < cost.stone && 'мало камня'].filter(Boolean).join(', ');
          if (!next || why) { const k = `расширение до ${open.size + 1} уч. (дом ${house}): ${why || 'нет'}`; stuck[k] = (stuck[k] || 0) + 1; log.push('СТОП ' + k); break; }
        }
      }
    }
    if (did) continue;
    // 2) улучшение дома
    if (next && open.size >= houseNeedChunks(house)) {
      const c = next.cost;
      const ok = res.wood >= c.wood && res.stone >= c.stone && res.ore >= (c.ore || 0) && c.wood <= store && c.stone <= store;
      if (ok) {
        res.wood -= c.wood; res.stone -= c.stone; res.ore -= c.ore || 0; coinsSpent += c.coins; hours += c.coins / Math.max(1, coinsPerHour(level, Math.min(beds, 12)));
        house++; log.push(`дом ${house}`); continue;
      }
      const why = [res.wood < c.wood && `дерево ${res.wood | 0}/${c.wood}`, res.stone < c.stone && `камень ${res.stone | 0}/${c.stone}`, res.ore < (c.ore || 0) && `руда ${res.ore | 0}/${c.ore}`, c.wood > store && 'дерево > склада'].filter(Boolean).join(', ');
      const k = `дом ${house + 1} при ${open.size} уч.: ${why.replace(/\d+\//g, '…/')}`;
      stuck[k] = (stuck[k] || 0) + 1; log.push(`СТОП дом ${house + 1}: ${why}`); break;
    }
    log.push('ВСЁ ПРОЙДЕНО'); break;
  }
  hours += hits * ENERGY_REGEN_SEC / 3600; // энергия на расчистку
  results.push({ house, chunks: open.size, level, hours, coinsSpent, log });
}

const by = (f) => { const m = {}; for (const r of results) { const k = f(r); m[k] = (m[k] || 0) + 1; } return m; };
console.log(`Карт: ${RUNS}`);
console.log('Итоговый дом:', by((r) => r.house));
console.log('Итог участков:', by((r) => r.chunks));
console.log('Где застревает:'); for (const [k, v] of Object.entries(stuck).sort((a, b) => b[1] - a[1])) console.log(`  ${v}× ${k}`);
const hs = results.map((r) => r.hours).sort((a, b) => a - b);
console.log(`Время игры (энергия + фарм монет), медиана: ${hs[hs.length >> 1].toFixed(1)} ч`);
console.log('Пример:', results[0].log.join(' → '));
