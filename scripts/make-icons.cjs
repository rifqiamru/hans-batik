// Membuat ikon PNG & logo kop dari assets/logo-hans.png (butuh Playwright).
// Jalankan: node scripts/make-icons.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'www', 'icons');
const src = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'assets', 'logo-hans.png')).toString('base64');
// [file keluaran, ukuran, latar, skala logo]
const jobs = [
  ['icon-192.png', 192, 'transparent', 0.96],
  ['icon-512.png', 512, 'transparent', 0.96],
  ['icon-maskable-512.png', 512, '#C30000', 0.78],
  ['apple-touch-icon.png', 180, '#FFF9E8', 0.9],
  ['favicon.png', 64, 'transparent', 1],
  ['logo-kop.png', 400, 'transparent', 1],
];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [out, size, bg, scale] of jobs) {
    await page.setViewportSize({ width: size, height: size });
    const s = Math.round(size * scale);
    await page.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${bg}">
      <img src="${src}" style="width:${s}px;height:${s}px"></body></html>`);
    await page.waitForFunction(() => document.images[0].complete);
    await page.screenshot({ path: path.join(dir, out), omitBackground: bg === 'transparent', clip: { x: 0, y: 0, width: size, height: size } });
    console.log('dibuat', out);
  }
  await browser.close();
})();
