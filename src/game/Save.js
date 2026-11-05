// Сохранение: localStorage (мгновенно) + Telegram CloudStorage (между устройствами).
// В CloudStorage значение ограничено 4096 символами, поэтому режем на части.

const LS_KEY = 'farm.save.v1';
const PART = 4000;
const MAX_PARTS = 16;

export class Save {
  constructor(tg) { this.tg = tg; this._t = null; this._pending = null; }

  async load() {
    let local = null, cloud = null;
    try { local = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { local = null; }
    try {
      const meta = await this.tg.cloudGet(['save_n']);
      const n = meta && parseInt(meta.save_n, 10);
      if (n > 0 && n <= MAX_PARTS) {
        const keys = Array.from({ length: n }, (_, i) => 'save_' + i);
        const parts = await this.tg.cloudGet(keys);
        if (parts) cloud = JSON.parse(keys.map((k) => parts[k] || '').join(''));
      }
    } catch (e) { cloud = null; }
    if (local && cloud) return (cloud.t || 0) > (local.t || 0) ? cloud : local;
    return local || cloud;
  }

  // Отложенная запись: частые изменения склеиваются в одну.
  schedule(getData, delay = 1500) {
    this._pending = getData;
    clearTimeout(this._t);
    this._t = setTimeout(() => this.flush(), delay);
  }

  flush() {
    clearTimeout(this._t);
    if (!this._pending || this.disabled) return;
    const data = this._pending();
    this._pending = null;
    data.t = Date.now();
    const str = JSON.stringify(data);
    try { localStorage.setItem(LS_KEY, str); } catch (e) { /* приватный режим */ }
    if (this.tg.hasCloud) {
      const n = Math.ceil(str.length / PART);
      if (n > MAX_PARTS) return;
      for (let i = 0; i < n; i++) this.tg.cloudSet('save_' + i, str.slice(i * PART, (i + 1) * PART));
      this.tg.cloudSet('save_n', String(n));
    }
  }

  reset() {
    this.disabled = true;
    try { localStorage.removeItem(LS_KEY); } catch (e) { /* */ }
    if (this.tg.hasCloud) this.tg.cloudSet('save_n', '0');
  }
}
