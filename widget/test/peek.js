// Quick visual check of the widget while iterating on its look: node test/peek.js
// Writes shots/peek/<mood>.png composited over a light and a dark wallpaper colour.
const fs = require('node:fs'), path = require('node:path');
const { launch, temp, root } = require('./helpers');
const { execFileSync } = require('node:child_process');

const out = path.join(root, 'shots', 'peek');
fs.mkdirSync(out, { recursive: true });
const stats = (litres, mood, extra = {}) => ({
  today: { litres, sips: Math.round((litres * 1000) / 3.5), prompts: 12, tokens: 1 },
  ration: 7,
  mood,
  lastSip: Date.now(),
  bySource: { codex: { color: '#10A37F' }, claude: { color: '#D97757' } },
  settings: { sound: false },
  ...extra,
});

(async () => {
  const run = await launch({ dataDir: temp('peek-data'), claudeDir: temp('peek-c'), codexDir: temp('peek-x') });
  try {
    const page = await run.app.firstWindow();
    await page.waitForFunction(() => !!window.thirstyPreview);
    await page.evaluate(() => document.fonts.ready);
    const shots = [
      ['chill', 0.9, 'chill'],
      ['sipping', 3.2, 'sipping'],
      ['sweating', 6.1, 'sweating'],
      ['bloated', 9.5, 'bloated'],
      ['dramatic', 16, 'dramatic'],
      ['sleeping', 2.4, 'sleeping'],
    ];
    const files = [];
    for (const [name, litres, mood] of shots) {
      await page.evaluate((s) => window.thirstyPreview.draw(s), stats(litres, mood));
      await page.waitForTimeout(900);
      const file = path.join(out, name + '.png');
      await run.app.evaluate(async ({ BrowserWindow }, f) => {
        const w = BrowserWindow.getAllWindows().find((x) => x.isAlwaysOnTop());
        const image = await w.webContents.capturePage();
        return image.toPNG().toString('base64');
      }, file).then((b64) => fs.writeFileSync(file, Buffer.from(b64, 'base64')));
      files.push(file);
    }
    // Mid-gulp frame with a coalesced pop.
    await page.evaluate((s) => window.thirstyPreview.draw(s), stats(3.2, 'sipping'));
    await page.evaluate(() => window.thirstyPreview.gulp(5, 'codex'));
    await page.waitForTimeout(230);
    const gulpFile = path.join(out, 'gulp.png');
    const b64 = await run.app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.isAlwaysOnTop());
      return (await w.webContents.capturePage()).toPNG().toString('base64');
    });
    fs.writeFileSync(gulpFile, Buffer.from(b64, 'base64'));
    files.push(gulpFile);
    // One contact sheet over two wallpapers.
    execFileSync('python', [path.join(root, 'test', 'peek-sheet.py'), out, ...files], { stdio: 'inherit' });
  } finally {
    await run.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
