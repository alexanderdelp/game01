// Belastungstest: simulierte Spielsitzung. Aufruf: node tools/soak.mjs <sekunden> (Vorschau-Server muss laufen)
import { chromium } from 'playwright';
const secs = Number(process.argv[2] ?? 180);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack ?? '').split('\n')[1]));
p.on('console', (m) => m.type() === 'error' && errs.push('console: ' + m.text()));
await p.goto('http://localhost:4173/?seed=soak-' + Date.now());
for (let i = 0; i < 60; i++) { const s = await p.evaluate(() => window.__game?.scene); if (s === 'create' && await p.evaluate(() => !!window.__game.createLook())) await p.evaluate(() => window.__game.createConfirm('Soak')); if (await p.evaluate(() => window.__game?.ready)) break; await p.waitForTimeout(500); }
const keys = ['w', 'a', 's', 'd'];
const t0 = Date.now();
let i = 0;
const heap = () => p.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1));
const h0 = await heap();
while (Date.now() - t0 < secs * 1000) {
  const k = keys[Math.floor(Math.random() * 4)];
  await p.keyboard.down(k);
  await p.keyboard.down('Shift');
  await p.waitForTimeout(400 + Math.random() * 1200);
  await p.keyboard.up('Shift');
  await p.keyboard.up(k);
  await p.keyboard.press('Space');
  await p.keyboard.press('e');
  if (i % 7 === 3) { await p.keyboard.press('m'); await p.waitForTimeout(300); await p.keyboard.press('m'); }
  if (i % 9 === 5) { await p.keyboard.press('c'); await p.waitForTimeout(200); await p.keyboard.press('c'); }
  if (i % 11 === 7) { const sp = await p.evaluate(() => window.__game.spawn); await p.evaluate(([x, y]) => window.__game.teleport(x + Math.floor(Math.random() * 400 - 200), y + Math.floor(Math.random() * 400 - 200)), [sp.tx, sp.ty]); }
  if (i % 13 === 9) { await p.evaluate(() => (window.__game.timeOffset += 3 * 3600_000)); }
  i++;
}
const s = await p.evaluate(() => ({ chunks: window.__game.chunksLoaded, npcs: window.__game.npcs.length, enemies: window.__game.enemies.length, hp: window.__game.hp, lvl: window.__game.hero.level, xp: window.__game.hero.xp, pickups: window.__game.pickups, textures: window.Phaser ? -1 : -1 }));
const tex = await p.evaluate(() => { const g = document.querySelector('canvas'); return g ? 1 : 0; });
console.log(JSON.stringify({ loops: i, heapStartMB: h0, heapEndMB: await heap(), ...s, tex }));
console.log('errors:', errs.length, [...new Set(errs)].slice(0, 10));
await b.close();
