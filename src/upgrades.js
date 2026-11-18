// Temporary roguelite upgrades (GDD 7). Each offer shows one card per
// category: BEACON, WEAPON, EXCURSION (GDD 22: first offer must include a
// beacon option, a weapon option and an exploration option).
// `tags` let the AI Director weight offers toward the player's style.

export const UPGRADES = [
  // weapon
  { id: 'dmg', cat: 'weapon', name: 'Hollow Points', desc: '+20% weapon damage.', max: 3, tags: ['brawler'] },
  { id: 'rate', cat: 'weapon', name: 'Hair Trigger', desc: '+25% fire rate.', max: 3, tags: ['brawler'] },
  { id: 'pierce', cat: 'weapon', name: 'Penetrator Rounds', desc: 'Shots pierce one more enemy.', max: 2, tags: ['turtle', 'guardian'] },
  { id: 'ricochet', cat: 'weapon', name: 'Ricochet', desc: 'Shots bounce to a nearby enemy after hitting.', max: 2, tags: ['brawler'] },
  { id: 'volatile', cat: 'weapon', name: 'Volatile Crits', desc: '+10% crit chance. Crits explode, hitting nearby enemies.', max: 1, tags: ['brawler', 'turtle'] },
  // beacon
  { id: 'radius', cat: 'beacon', name: 'Field Expansion', desc: '+18% safe-field radius.', max: 3, tags: ['turtle', 'guardian'] },
  { id: 'regen', cat: 'beacon', name: 'Medical Nanites', desc: '+60% health regeneration inside the field.', max: 2, tags: ['scavenger', 'brawler'] },
  { id: 'core', cat: 'beacon', name: 'Reinforced Core', desc: '+40% beacon durability and a full repair.', max: 2, tags: ['guardian'] },
  { id: 'pulse', cat: 'beacon', name: 'Overcharge Pulse', desc: 'When the beacon is hit it blasts nearby enemies back (8s cooldown).', max: 1, tags: ['scavenger', 'guardian'] },
  { id: 'autorepair', cat: 'beacon', name: 'Auto-Repair', desc: 'Beacon repairs itself (4 HP/s) when not under attack.', max: 1, tags: ['scavenger'] },
  // excursion
  { id: 'exitshield', cat: 'excursion', name: 'Exit Shield', desc: 'Leaving the field gives 3s of 60% damage reduction.', max: 1, tags: ['turtle', 'scavenger'] },
  { id: 'runner', cat: 'excursion', name: 'Field Runner', desc: '+22% movement speed outside the field.', max: 2, tags: ['scavenger', 'turtle'] },
  { id: 'sealant', cat: 'excursion', name: 'Hazmat Sealant', desc: 'Outside-field health drain reduced by 35%.', max: 2, tags: ['scavenger', 'brawler'] },
  { id: 'samplemed', cat: 'excursion', name: 'Sample Stims', desc: 'Every Bio Sample you pick up heals 12 HP.', max: 1, tags: ['scavenger'] },
  { id: 'pockets', cat: 'excursion', name: 'Deep Pockets', desc: '+2 sample carry capacity and +50% pickup radius.', max: 1, tags: ['scavenger'] },
  { id: 'scanner', cat: 'excursion', name: 'Loot Scanner', desc: 'Reveals a hidden supply crate with loot right now.', max: 1, tags: ['turtle', 'scavenger'] },
  { id: 'grenades', cat: 'weapon', name: 'Frag Pack', desc: '+3 grenades. Right-click to throw.', max: 3, tags: ['brawler', 'guardian'] },
  { id: 'rations', cat: 'excursion', name: 'Field Rations', desc: 'Heal 40 HP right now.', max: 99, tags: [] },
  { id: 'revive', cat: 'excursion', name: 'Second Wind', desc: 'Once this run, survive a lethal hit with 40% health.', max: 1, tags: ['brawler'] },
];

export const CAT_INFO = {
  beacon: { label: 'BEACON', color: '#4ee8ff' },
  weapon: { label: 'WEAPON', color: '#ffb93a' },
  excursion: { label: 'EXCURSION', color: '#6dff5a' },
};
