// JSON анимаций в читаемом виде: каждый ключ — одной строкой.
export function formatAnims(animations) {
  const out = (v, ind) => {
    if (Array.isArray(v)) {
      if (v.every((x) => typeof x !== 'object' || x === null)) return '[' + v.map((x) => JSON.stringify(x)).join(', ') + ']';
      if (v.every((x) => Array.isArray(x) && x.every((y) => typeof y !== 'object'))) return '[' + v.map((x) => out(x, ind)).join(', ') + ']';
      return '[\n' + v.map((x) => ind + '  ' + out(x, ind + '  ')).join(',\n') + '\n' + ind + ']';
    }
    if (v && typeof v === 'object') {
      const ks = Object.keys(v);
      if (!ks.length) return '{}';
      return '{\n' + ks.map((k) => ind + '  ' + JSON.stringify(k) + ': ' + out(v[k], ind + '  ')).join(',\n') + '\n' + ind + '}';
    }
    return JSON.stringify(v);
  };
  return out({ version: 1, animations }, '') + '\n';
}
