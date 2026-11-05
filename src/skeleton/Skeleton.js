// Скелетная анимация: кости (иерархия аффинных матриц), слоты (что и в каком
// порядке рисуется), скины (наборы картинок частей тела).
// Формат данных — простой JSON, совместимый с будущим редактором.
//
// data = {
//   bones: [{name, parent, x, y, rotation, scaleX, scaleY}],   // родитель раньше потомка
//   slots: [{name, bone, attachment}],                          // порядок = порядок отрисовки
//   skins: { default: { slotName: { attachmentName: {sprite, x, y, rotation} } }, back: {...} },
//   drawOrders: { back: [slotName, ...] },                      // необязательно
//   animations: { name: Animation-данные }
// }

const DEG = Math.PI / 180;

export class Bone {
  constructor(data, parent) {
    this.data = data;
    this.parent = parent;
    this.setToSetup();
    this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.tx = 0; this.ty = 0;
  }

  setToSetup() {
    const d = this.data;
    this.x = d.x || 0; this.y = d.y || 0;
    this.rotation = d.rotation || 0;
    this.scaleX = d.scaleX ?? 1; this.scaleY = d.scaleY ?? 1;
  }

  updateWorld() {
    const r = this.rotation * DEG;
    const cos = Math.cos(r), sin = Math.sin(r);
    const la = cos * this.scaleX, lb = sin * this.scaleX;
    const lc = -sin * this.scaleY, ld = cos * this.scaleY;
    const p = this.parent;
    if (p) {
      this.a = p.a * la + p.c * lb; this.b = p.b * la + p.d * lb;
      this.c = p.a * lc + p.c * ld; this.d = p.b * lc + p.d * ld;
      this.tx = p.a * this.x + p.c * this.y + p.tx;
      this.ty = p.b * this.x + p.d * this.y + p.ty;
    } else {
      this.a = la; this.b = lb; this.c = lc; this.d = ld;
      this.tx = this.x; this.ty = this.y;
    }
  }
}

function prepAttachment(att) {
  if (att._m) return att;
  const r = (att.rotation || 0) * DEG;
  att._m = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), att.x || 0, att.y || 0];
  return att;
}

export class Skeleton {
  constructor(data) {
    this.data = data;
    this.bones = [];
    this.boneMap = {};
    for (const bd of data.bones) {
      const b = new Bone(bd, bd.parent ? this.boneMap[bd.parent] : null);
      this.bones.push(b);
      this.boneMap[bd.name] = b;
    }
    this.slots = data.slots.map((s) => ({
      name: s.name, bone: this.boneMap[s.bone], attachment: s.attachment ?? null, setup: s.attachment ?? null,
    }));
    this.slotMap = {};
    for (const s of this.slots) this.slotMap[s.name] = s;
    this.skin = 'default';
    this.drawOrder = this.slots;
    this.override = {}; // slotName → имя вложения, задаётся кодом (например, инструмент)
  }

  setSkin(name) {
    if (this.skin === name) return;
    this.skin = name;
    const order = this.data.drawOrders && this.data.drawOrders[name];
    this.drawOrder = order ? order.map((n) => this.slotMap[n]) : this.slots;
  }

  setToSetupPose() {
    for (const b of this.bones) b.setToSetup();
    for (const s of this.slots) s.attachment = s.setup;
  }

  updateWorld() { for (const b of this.bones) b.updateWorld(); }

  getAttachment(slot, name) {
    const skins = this.data.skins;
    const sk = skins[this.skin] && skins[this.skin][slot.name];
    return (sk && sk[name]) || (skins.default[slot.name] && skins.default[slot.name][name]) || null;
  }

  // Рисование. view = {va, ve, vf} — матрица камеры рендерера.
  draw(ctx, view, x, y, scale = 1, flipX = false) {
    const ba = (flipX ? -scale : scale) * view.va;
    const bd = scale * view.va;
    const be = x * view.va + view.ve;
    const bf = y * view.va + view.vf;
    for (let i = 0; i < this.drawOrder.length; i++) {
      const slot = this.drawOrder[i];
      const name = slot.name in this.override ? this.override[slot.name] : slot.attachment;
      if (!name) continue;
      const att = this.getAttachment(slot, name);
      if (!att) continue;
      prepAttachment(att);
      const m = att._m, bn = slot.bone;
      // W = bone * attachment
      const wa = bn.a * m[0] + bn.c * m[1];
      const wb = bn.b * m[0] + bn.d * m[1];
      const wc = bn.a * m[2] + bn.c * m[3];
      const wd = bn.b * m[2] + bn.d * m[3];
      const we = bn.a * m[4] + bn.c * m[5] + bn.tx;
      const wf = bn.b * m[4] + bn.d * m[5] + bn.ty;
      // M = base * W (base — диагональная матрица с переносом)
      ctx.setTransform(ba * wa, bd * wb, ba * wc, bd * wd, ba * we + be, bd * wf + bf);
      const s = att.sprite;
      ctx.drawImage(s.canvas, -s.ax, -s.ay, s.w, s.h);
    }
    ctx.setTransform(view.va, 0, 0, view.va, view.ve, view.vf);
  }
}
