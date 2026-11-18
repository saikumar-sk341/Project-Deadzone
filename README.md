# Project Deadzone: playable prototype

> *Defend your lifeline. Venture into the deadzone. Bring the samples home.*

An isometric PvE action shooter for mobile and PC, built around one decision: **stay safe, or go out for the loot?**

A robotic beacon projects a protective field. Inside it you heal. Outside it the air is toxic and your health drains, and the drain gets faster the longer you stay out. The Bio Samples you need are out there. Hold off the waves, make short and deliberate trips out of the field, bank your samples at the beacon, then survive extraction.

**Play in the browser:** https://saikumar-sk341.github.io/Project-Deadzone/ (one click, nothing to install, works on PC and mobile)

**Source code:** https://github.com/saikumar-sk341/Project-Deadzone

---

## Controls

| | Desktop | Mobile / touch |
|---|---|---|
| Move | WASD / arrow keys | Left-thumb virtual joystick |
| Aim | Mouse (light aim assist) | Automatic (targets charging Disruptors first) |
| Fire | Hold left mouse | **Automatic** when an enemy is in range |
| Grenade | Right mouse / F | **GRENADE** |
| Dash (short i-frames) | Space / Shift | **DASH** |
| Class skill | Q | **SKILL** |
| Interact (hold) | E | **USE** (appears when needed) |
| Call next wave early | G | **READY** |
| AI Director lens | I | Settings |
| Pause | Esc / P | `II` button |

First launch plays a 3-panel story intro and an interactive training (move, shoot, dash, grenade, leave and re-enter the field). Each step waits for the player to do it. Training can be skipped and replayed from the pause menu.

## What's in the build

**Core loop feedback (v0.3):**
- **One objective at a time** at the top of the screen (HOLD THE FIELD → GRAB THE SAMPLES → GO TO THE LANDING PAD → HOLD THE PAD), with a progress bar and sample pips: solid = banked, dashed = carried.
- **One callout line** instead of stacked radio messages, with all messages cut to a few words.
- **XP and level-ups:** kills drop XP gems; every level pauses for a pick-1-of-3 upgrade (about 8 per mission).
- **Combos** (RAMPAGE, UNSTOPPABLE), damage numbers, kill splats, short slow-motion on big kills, samples that fly into the HUD and pulse when banked.
- **Gold supply crates** (guarded, 11–18 m from the beacon) give **loot**: a new weapon for the mission (Arc Caster, Minigun, Breacher Shotgun), +3 grenades, a Sentry Turret or a Damage Amp. The first crate is always a weapon.
- **Faster pacing:** lulls are 13–16 s and you can call the wave early.
- **Air strike finale:** in the last 3 s of extraction the dropship wipes out every enemy before lift-off.

**Menus (v0.3.1):**
- Home screen (HQ) with four tabs (Mission, Research, Armory, Rewards). Orange dots mark tabs where something can be done. The mission card and DEPLOY button sit over the live 3D beacon.
- Settings (gear icon on the title screen and HQ, or from the pause menu): sound, graphics, AI Director lens, replay story, replay training, reviewer tools and **Reset progress** (with confirmation).
- In-mission HUD: loadout and XP sit in a bottom action bar. The beacon and player labels over the 3D scene only appear when they need attention.

**Systems from the GDD:**

Everything in the GDD's MVP scope (section 16), plus the v0.2 locked decisions:

- **Beacon field** with health regeneration inside the field and drain outside it. Includes the exit grace and re-entry grace periods, a ground cue pointing back to safety, a red vignette, a heartbeat sound and a live `-X HP/s` readout.
- **Beacon states:** ACTIVE, UNDER ATTACK, CRITICAL, DISRUPTED, DESTROYED and REBOOTING.
  - A Disruptor EMP is telegraphed. Kill the Disruptor before the charge completes to interrupt it.
  - If the beacon is destroyed you get an **emergency state, not an instant loss**. Hold E to reboot it with an emergency kit. With no kits left, you have to activate a backup generator out in the danger zone.
  - Beacon repair costs Tech Fragments, which creates a real choice between spending Tech now and banking it for HQ.
- **Carried vs banked samples:** you can carry 4. Walking into the field banks them. If you die, carried samples are lost.
- **Mission Outpost Zero:** deployment, then 5 combat waves with lulls for loot runs, then an extraction defence.
  - Enemies: Rusher, Spitter, Brute (telegraphed slam), Disruptor (EMP) and the Elite (telegraphed charge and slam, summons adds, drops a high-value specimen).
  - Spawn lanes are marked with ground chevrons and edge-of-screen warnings.
  - Extraction is a countdown you have to survive on the landing pad. The countdown pauses if you step off.
- **Roguelite upgrades** on every level-up. Each choice offers one Beacon card, one Weapon card and one Excursion card. 18 upgrades, most of which change behaviour: pierce, ricochet, exploding crits, knockback pulse, exit shield, sample stims, loot scanner, frag pack, second wind.
- **Two operatives.** Assault (Combat Overdrive) is available from the start. Scout (Phase Dash: fast, fragile, larger pickup radius) is unlocked through research.
- **Weapons:** Assault Rifle and Breacher Shotgun as loadout (shotgun unlocked in the Armory); Arc Caster and Minigun from supply crates.
- **HQ**, saved in localStorage:
  - Research Lab: the Scout unlock track, plus Field Mk II, Medical Nanites and a Region 2 survey
  - Armory & Beacon Workshop
  - A 6.5-hour supply drop with an opt-in "open now with a rewarded ad" button (simulated)
  - Daily contract
  - Beacon skins
  - AI Director memory
- **Results sequence:** see the D1 retention section below.

## D1 retention: why come back tomorrow (v0.4)

The goal is that a player who finishes their first mission knows what they collected, why it mattered, and what is waiting next.

**1. Results, one beat at a time.** Each beat fills the screen and has a single CONTINUE button (Space or Enter on desktop). Skip jumps to the last beat.

1. **Mission summary.** A top-down map of Outpost Zero showing your route, the crates you opened and missed, and the survey nodes. Next to it: samples secured, zones explored, kills, best combo and specimens found.
2. **Research Lab.** The samples count up, the currencies earned are shown, and the Scout unlock bar animates toward its target.
3. **Specimen Log.** Every specimen type, with NEW and +n badges for this run, the milestone track and any rewards that just unlocked.
4. **Rewards.** Supply drop timer, daily contract and the login streak.
5. **Come back for.** The next concrete goals: Scout unlock, next codex milestone, unsurveyed zones, supply drop timer and **Tomorrow's** streak reward and contract. It also offers one immediate upgrade, then GO TO HQ or DEPLOY AGAIN.

**2. Specimen Log (codex).** There are 8 specimen types, and each has a short line of lore.

| Specimen | Where it comes from |
|---|---|
| Rust Lichen, Coolant Leech, Crystal Shard, Hive Egg | Survey node in the North, East, South and West zones |
| Spitter Gland | 12 % drop from Spitters |
| Brute Plate | 50 % drop from Brutes |
| Disruptor Core | Kill a Disruptor mid-charge (or 35 % drop) |
| Elite Heart | Kill the Elite |

The first time you find a type, a full-screen card reveals it. After that, each pickup counts up. Collection milestones:

- **3 types:** Spore Green beacon skin
- **5 types:** Field Kit, +2 grenades every mission
- **8 types:** Hive Hunter title and 3 Mutagen Cores

A first run usually finds 5–7 types. The last ones need specific play, such as interrupting a Disruptor.

**3. Outpost Zero map.** The HQ Codex tab shows the map. Zones you have not surveyed stay under fog until you reach their node. Survey nodes are guarded, are marked on screen until surveyed, and also give credits and XP.

**4. Small hooks**

- **3-day login streak:**
  - Day 1: +60 credits
  - Day 2: +120 credits and +3 Tech
  - Day 3: a free supply drop

  Missing a day resets the streak. You claim it in the Rewards tab.
- **Tomorrow preview:** the next streak reward and the next daily contract are shown in advance.
- **Notifications:** when the supply drop is ready or the streak can be claimed, a one-time notice appears in HQ, and the tab gets a dot.
- Codex progress is saved even when a mission fails, so a bad run still moves the collection forward.

## AI in the game: the AI Director

`src/director.js`. This is a real-time adaptive system in the tradition of Left 4 Dead's director. It is not a language model. It runs fully offline, so the one-click link stays one click.

1. **Pacing.** The Director tracks an *intensity* signal fed by damage taken, nearby threats and low health. When intensity peaks, it holds spawns to give the player a breather.
2. **Profiling.** It classifies *how you use the beacon* from behaviour, not stats:
   - **TURTLE**: never leaves the field
   - **SCAVENGER**: long, frequent loot runs
   - **BRAWLER**: fights in the open
   - **GUARDIAN**: hugs the beacon
3. **Response.** It counters or rewards each style so the core decision never goes stale:

   | Profile or situation | What the Director does |
   |---|---|
   | Turtle | Ranged siege comes next, and a high-value lure cache surfaces outside the field |
   | Scavenger | Ambushers spawn between you and the beacon on your route home |
   | Beacon neglect | More enemies target the beacon, and a Disruptor arrives early |
   | Guardian | Spitters harass from beyond the field edge |
   | Struggling | Lower pressure, med-pack drops and a longer lull |
   | Dominating | Higher pressure |

   It also weights upgrade offers toward your style.
4. **Memory.** The profile and skill estimate persist between runs, so the next mission opens with them in mind.

Every decision is visible to the player:

- As **AI DIRECTOR** radio chatter during play
- In the live **AI lens**: press `I` to see intensity, pacing state, pressure and style scores
- In the **post-mission Director report**

## Tuning (from the GDD's tuning hypotheses)

| Value | Build | GDD |
|---|---|---|
| Field radius | 8.5 m | 7–9 m |
| Regen inside | 1.75 % max HP/s after 0.75 s re-entry grace | 1.5–2.0 %, 0.5–1.0 s |
| Drain outside | 1.25 %/s after a 1.25 s grace, **+0.15 %/s for every second outside, capped at 4.5 %** | 1.0–1.5 %, 1.0–1.5 s grace |
| EMP charge / outage | 4.2 s telegraph / 7 s outage | telegraphed, recoverable |
| Emergency window after beacon destruction | 35 s | "emergency survival timer" |
| Extraction countdown | 25 s | 20–30 s |
| Supply drop | 6.5 h | 6–7 h |
| Lull between waves | 13–16 s (G to skip) | "short recovery windows" |

All values live in `src/config.js`.

### Deviations from the GDD

Each of these was made on purpose:

- **Drain ramps up over time.** A flat 1.25 %/s made a 15-second trip cost about 19 HP, which meant long trips were nearly free. With the ramp, short trips stay cheap (so the first excursion is fair at baseline, as the GDD requires) and greedy trips become a real decision.
- **Mission length and wave count.** The GDD's "Wave 0" deployment is folded into a 3-second deploy, which leaves 5 combat waves plus extraction. The mission runs about 5.5–7 minutes, so a reviewer reaches extraction and the HQ hook in a single sitting.
- **Scout costs 12 Bio Samples.** One successful run banks 6–14, so the track always shows visible progress and is honest about what is left. Two minimum-quota runs are guaranteed to unlock it.
- **Failure rules:**
  - Die with the beacon intact: banked samples are kept and carried samples are lost.
  - Lose the beacon: half of the banked samples are kept.
  - Credits and Tech are halved on any failure.
- **The extraction pad stops the drain.** The dropship's field emitter covers the pad, so the countdown is a fight rather than a health race.

## Project structure

```
src/
  main.js       app shell, screens, loop
  game.js       mission: player, beacon, combat, samples, flow, extraction
  enemies.js    enemy AI (rusher, spitter, brute, disruptor, elite) + unstick logic
  director.js   AI Director
  waves.js      Outpost Zero wave script, cache placement
  upgrades.js   roguelite upgrade pool
  meta.js       HQ persistence: research, armory, chest, contract, skins, codex, streak
  codex.js      zones, specimen types, milestones, Outpost Zero map (SVG)
  hud.js        in-mission HUD (GDD section 14), indicators, AI lens
  ui.js         title, story, HQ, level-up pick, pause, results
  story.js      3 illustrated story panels (SVG drawn in code)
  world.js      Three.js scene, isometric camera, level layout, collision
  models.js     procedural low-poly models (no art assets)
  fx.js         particles, telegraphs, floating text
  audio.js      procedural WebAudio sound (no audio files)
  input.js      keyboard/mouse + touch joystick/buttons
tools/playtest.mjs  automated full-mission playtest bot
docs/index.html     built, self-contained game (served by GitHub Pages)
```

## Build and deploy

```bash
npm install
npm run build          # writes docs/index.html (single self-contained file)
open docs/index.html   # or serve the folder
```

To publish on **GitHub Pages**:

1. Push the repo.
2. Go to **Settings → Pages**.
3. Under "Build and deployment", choose **Deploy from a branch**, then pick `main` and `/docs`.

## Automated playtests

`npm run playtest` runs full missions with a scripted "average player" bot. The bot uses the real touch-input paths, dodges telegraphs some of the time and plays without rendering. This was used to:

- Tune the wave curve
- Find and fix a soft-lock: an enemy could get stuck behind a barricade, which stopped the wave from ending. Enemies now detect when they are stuck and detour.
- Confirm the full flow end to end: waves → upgrades → extraction → results → HQ → research → supply drop → Scout

Results at the current tuning:

- 8 of 9 runs extracted (6 average-player runs, 3 scavenger runs), with no runtime errors. The Director's memory carries over between runs, and the runs after Scout unlocks are played as Scout.
- A rule now sends the last few enemies of a wave toward the player after 20 s, so a wave can never stall (found when the bot held a short-range weapon against spitters at range).
- A "turtle" bot that never leaves the field cannot finish, by design: the sample quota forces excursions.

## Next steps

- Region 2 and its hazard (spore clouds)
- Real art pass
- Additional classes (Engineer, Medic, Heavy) as described in the GDD
- Soft-launch analytics hooks for the metrics in GDD section 17

## Credits

Built with [Three.js](https://threejs.org) and esbuild. All models, effects and audio are generated procedurally in code.
