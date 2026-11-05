// Обёртка над Telegram WebApp API. Вне Telegram всё работает как заглушки,
// поэтому игру можно запускать и в обычном браузере.

export class TelegramBridge {
  constructor() {
    this.tg = window.Telegram && window.Telegram.WebApp;
    this.inTelegram = !!(this.tg && this.tg.initData);
    this.user = this.tg && this.tg.initDataUnsafe && this.tg.initDataUnsafe.user;
  }

  init() {
    const tg = this.tg;
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      if (this.ver('7.7')) tg.disableVerticalSwipes(); // свайп по карте не должен закрывать приложение
      if (this.ver('6.1')) { tg.setHeaderColor('#5ea83f'); tg.setBackgroundColor('#3d7a35'); }
      if (this.ver('7.10')) tg.setBottomBarColor && tg.setBottomBarColor('#3d7a35');
      if (this.ver('6.2')) tg.enableClosingConfirmation && tg.disableClosingConfirmation();
    } catch (e) { console.warn(e); }
    const apply = () => this.applySafeArea();
    apply();
    tg.onEvent && ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged'].forEach((ev) => tg.onEvent(ev, apply));
  }

  ver(v) { return this.tg && this.tg.isVersionAtLeast && this.tg.isVersionAtLeast(v); }

  // Отступы Telegram (шапка в полноэкранном режиме, вырезы) → CSS-переменные
  applySafeArea() {
    const tg = this.tg, s = document.documentElement.style;
    const a = (tg && tg.safeAreaInset) || {}, c = (tg && tg.contentSafeAreaInset) || {};
    for (const k of ['top', 'bottom', 'left', 'right']) s.setProperty(`--tg-${k}`, ((a[k] || 0) + (c[k] || 0)) + 'px');
    if (tg && tg.viewportStableHeight) s.setProperty('--tg-vh', tg.viewportStableHeight + 'px');
  }

  haptic(kind = 'light') {
    const h = this.tg && this.ver('6.1') && this.tg.HapticFeedback;
    if (!h) return;
    try {
      if (kind === 'success' || kind === 'error' || kind === 'warning') h.notificationOccurred(kind);
      else if (kind === 'select') h.selectionChanged();
      else h.impactOccurred(kind);
    } catch (e) { /* старые клиенты */ }
  }

  get hasCloud() { return !!(this.tg && this.ver('6.9') && this.tg.CloudStorage && this.inTelegram); }

  cloudGet(keys) {
    return new Promise((res) => {
      if (!this.hasCloud) return res(null);
      try { this.tg.CloudStorage.getItems(keys, (err, v) => res(err ? null : v)); } catch (e) { res(null); }
    });
  }

  cloudSet(key, value) {
    return new Promise((res) => {
      if (!this.hasCloud) return res(false);
      try { this.tg.CloudStorage.setItem(key, value, (err, ok) => res(!err && ok)); } catch (e) { res(false); }
    });
  }
}
