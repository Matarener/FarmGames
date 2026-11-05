// Увеличивает лист спрайтов ×4 нейросетью ESRGAN (модель esrgan-thick).
// Результат — assets/source/sprites@4x.webp, из него tools/slice_sprites.py берёт цвет.
//   cd tools/upscale && npm install && npm run upscale
const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const path = require('path');
const Upscaler = require('upscaler/node');

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = process.argv[2] || path.join(ROOT, 'assets/source/sprites.png');
const OUT = process.argv[3] || path.join(ROOT, 'assets/source/sprites@4x.png');

(async () => {
  const up = new Upscaler({ model: require('@upscalerjs/esrgan-thick/4x') });
  const img = tf.node.decodeImage(fs.readFileSync(SRC), 3);
  console.log('вход', img.shape.join('×'));
  const t0 = Date.now();
  const res = await up.upscale(img, {
    patchSize: 128, padding: 12, output: 'tensor',
    progress: (p) => process.stdout.write(`\r${(p * 100).toFixed(0)}%`),
  });
  const png = await tf.node.encodePng(tf.cast(tf.clipByValue(res, 0, 255), 'int32'));
  fs.writeFileSync(OUT, png);
  console.log(`\nготово за ${((Date.now() - t0) / 1000).toFixed(0)} с →`, OUT, res.shape.join('×'));
})();
