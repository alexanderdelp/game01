// Hilfsskript (kein Test): Screenshots von Gegnern für Statusberichte. Aufruf: node tests/e2e/shots.mjs
import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:4173/?seed=test');
const ready = async () => { for (let i = 0; i < 80; i++) { if (await p.evaluate(() => window.__game?.ready)) return; await p.waitForTimeout(250); } };
await ready();
for (const kind of process.argv.slice(2)) {
  const e = await p.evaluate((k) => window.__game.findEnemy(k), kind);
  if (!e) { console.log('kein', kind); continue; }
  await p.evaluate(([tx, ty]) => window.__game.teleport(tx - 4, ty), [e.tx, e.ty]);
  await ready();
  await p.keyboard.press('d');
  await p.waitForTimeout(1800);
  await p.keyboard.press('Space');
  await p.waitForTimeout(120);
  await p.screenshot({ path: `screenshots/m4-${kind}.png` });
}
await b.close();
