// Automated playtest: a scripted "average player" bot plays full missions of
// Outpost Zero through the real input paths (virtual joystick, fire, interact),
// with rendering skipped, and prints the mission flow, AI Director decisions
// and any runtime errors. Used to validate pacing and catch soft-locks.
//
//   npm run build && npm run playtest            (5 runs)
//   node tools/playtest.mjs 10 scav               (styles: normal | scav | turtle)
//   CHROME=/path/to/chrome node tools/playtest.mjs
import { chromium } from 'playwright';
import { pathToFileURL } from 'url';
import { resolve } from 'path';

const runs = parseInt(process.argv[2] || '5');
const style = process.argv[3] || 'normal';
const launch = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
if (process.env.CHROME) launch.executablePath = process.env.CHROME;
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(pathToFileURL(resolve('docs/index.html')).href + '?debug=1');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(1000);

let wins = 0;
for (let r = 0; r < runs; r++) {
  await page.click(r === 0 ? '#t-go' : '#r-again');
  await page.waitForTimeout(200);
  if (await page.isVisible('#st-skip')) { await page.click('#st-skip'); await page.waitForTimeout(200); }
  const out = await page.evaluate((style) => {
    const SQ2 = Math.SQRT1_2, g = DZ.game, inp = DZ.app.input;
    inp.setTouchMode(true);
    const log = [];
    let last = '', frames = 0;
    const moveTo = (x, z, stopR = 0.5) => {
      const p = g.player, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d < stopR) { inp.joy.active = false; return true; }
      inp.joy.active = true; inp.joy.x = (dx / d - dz / d) * SQ2; inp.joy.y = -(dx / d + dz / d) * SQ2;
      return false;
    };
    DZ.sim(900, () => {
      frames++;
      const up = document.querySelector('#screen-upgrade:not(.hidden) .up-card');
      if (up) { up.click(); log.push(`  upgrade: ${up.dataset.id}`); }
      if (g.phase !== last) { last = g.phase; log.push(`[${g.time.toFixed(0).padStart(3)}s] ${g.phase.padEnd(10)} wave ${g.waveIdx + 1}  hp ${g.player.hp.toFixed(0).padStart(3)}  beacon ${g.beacon.hp.toFixed(0).padStart(3)}  banked ${g.beacon.bankedBio}`); }
      if (g.over) return false;
      if (g.phase === 'wave' && g.phaseT > 150) { log.push('SOFT-LOCK: wave did not complete'); return false; }
      const p = g.player, b = g.beacon, hp = p.hp / p.maxHp;
      inp.touchBtn.interact = false;
      if (g.phase === 'tutorial') { inp.edges.add('Enter'); return; }
      if (g.loot.grenades > 0 && g.enemiesNear(p.x, p.z, 9) >= 5 && frames % 20 === 0) inp.edges.add('KeyF');
      if (p.dashCd <= 0 && Math.random() < 0.5) {
        for (const e of g.enemies) {
          const danger = (e.state === 'windup' && e.slamX !== undefined && Math.hypot(p.x - e.slamX, p.z - e.slamZ) < e.cfg.slamRadius + 0.6 && e.t > e.cfg.windup * 0.5) || (e.state === 'cwindup' && e.t > 0.5);
          if (!e.dead && danger) { inp.edges.add('Space'); break; }
        }
      }
      if (b.destroyed) { const t = g.generator || b; if (moveTo(t.x, t.z, g.generator ? 1.5 : 2.6)) inp.touchBtn.interact = true; return; }
      if (g.phase === 'extract' || g.phase === 'extracting') { moveTo(4, -31, 1.5); return; }
      const caches = g.caches.filter((c) => !c.collected);
      if (style !== 'turtle' && caches.length && p.carriedBio < g.carryCap() && hp > 0.45 && (g.phase !== 'wave' || style === 'scav' || g.enemies.length < 6)) {
        caches.sort((a, c) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(c.x - p.x, c.z - p.z));
        moveTo(caches[0].x, caches[0].z, 0.4);
        return;
      }
      if (p.carriedBio > 0 || hp < 0.7) { moveTo(b.x + 2.5, b.z + 2.5, 1); return; }
      if (b.hp < b.maxHp * 0.6 && g.run.tech > 0 && g.enemiesNear(b.x, b.z, 6) === 0) { if (moveTo(b.x + 2.4, b.z, 0.6)) inp.touchBtn.interact = true; return; }
      moveTo(b.x + 3, b.z - 2, 1);
      if (style === 'turtle' && g.phase === 'lull' && frames % 30 === 0) inp.edges.add('KeyG');
    });
    if (g.phase !== 'done') log.push('  damage taken by source: ' + JSON.stringify(Object.fromEntries(Object.entries(g.stats.dmgBy).map(([k, v]) => [k, Math.round(v)]))));
    log.push(`  level ${g.level} · best combo ${g.stats.bestCombo} · loot: ${g.stats.loot.join(', ') || '-'} · grenades thrown ${g.stats.grenadesThrown}`);
    return { log, success: g.phase === 'done', director: g.director.log.filter((e) => e.kind !== 'relax').map((e) => `  ${e.t.toFixed(0).padStart(3)}s ${e.title}: ${e.text}`) };
  }, style);
  if (out.success) wins++;
  console.log(`\n=== RUN ${r + 1} (${style}): ${out.success ? 'EXTRACTED' : 'FAILED'}`);
  console.log(out.log.join('\n'));
  console.log(' AI Director:\n' + out.director.join('\n'));
  try { await page.waitForSelector('#rs-skip', { state: 'visible', timeout: 8000 }); await page.click('#rs-skip'); } catch { /* results not shown */ }
  try { await page.waitForSelector('#r-again', { state: 'visible', timeout: 8000 }); }
  catch { console.log('Mission did not end (expected for turtle style: the quota is never met).'); break; }
}
console.log(`\n${wins}/${runs} extracted. Runtime errors: ${errors.length ? '\n' + errors.join('\n') : 'none'}`);
await browser.close();
