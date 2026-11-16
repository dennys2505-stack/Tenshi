// Place départ (from) et arrivée (to) sur la mini map à partir du titre, grâce aux zones de discord/zones.json.
// Règle : « … depuis X » → départ = zone X ; le reste du titre (ou la lettre du site) → arrivée.
// Si une zone est ambiguë (ex. « Long » sans A/B) ou inconnue, le point reste vide : tu le places dans l'admin.
import fs from 'fs';

const Z = JSON.parse(fs.readFileSync(new URL('../zones.json', import.meta.url), 'utf8'));
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Cherche une zone dans un bout de texte. letter = A/B/C pour lever les ambiguïtés (« Long » → « B Long »).
function findZone(map, text, letter, side) {
  const zones = Z.zones[map]; if (!zones) return null;
  const t = ' ' + norm(text) + ' ';
  // 1. spawn
  if (/ barriere /.test(t) && letter && zones[letter.toUpperCase() + ' Barrier']) return letter.toUpperCase() + ' Barrier';
  if (/ spawn /.test(t) && letter && zones[letter.toUpperCase() + ' Spawn']) return letter.toUpperCase() + ' Spawn';
  if (/ spawn | barriere /.test(t)) {
    const att = / attaque | atk | attacker /.test(t) ? true : / defense | def | defender /.test(t) ? false : side !== 'Défense';
    return zones[att ? 'Attacker Side Spawn' : 'Defender Side Spawn'] ? (att ? 'Attacker Side Spawn' : 'Defender Side Spawn') : null;
  }
  // 2. nom complet « b long », « a short », « mid top »… (le plus long d'abord)
  const names = Object.keys(zones).sort((a, b) => b.length - a.length);
  for (const n of names) if (t.includes(' ' + norm(n) + ' ')) return n;
  // 3. alias propres à la map (shower, hookah, lampe…)
  const al = Object.entries(Z.aliases[map] || {}).sort((a, b) => b[0].length - a[0].length);
  for (const [k, v] of al) {
    if (!v || !t.includes(' ' + k + ' ')) continue;
    if (v[0] !== '?') return v;
    if (letter && zones[letter.toUpperCase() + ' ' + v.slice(1)]) return letter.toUpperCase() + ' ' + v.slice(1);
  }
  if (/^ site /.test(t) && letter && zones[letter.toUpperCase() + ' Site']) return letter.toUpperCase() + ' Site';
  // 4. mot seul « long », « short », « lobby », « main », « link »… complété par la lettre du site
  if (letter) for (const n of names) {
    const [l, ...rest] = n.split(' ');
    if (l.toLowerCase() === letter && rest.length && t.includes(' ' + norm(rest.join(' ')) + ' ')) return n;
  }
  return null;
}

export function place(map, side, site, title) {
  const zones = Z.zones[map]; if (!zones) return {};
  // « A depuis X vers Y » : X = départ ; ce qui suit « vers » ou précède « depuis » = arrivée.
  let t0 = ' ' + norm(title) + ' ', dest = '';
  const v = t0.split(/ vers | pour /); if (v.length > 1) { t0 = v[0] + ' '; dest = v.slice(1).join(' '); }
  // « C pour main depuis Main » : le « depuis » peut être après la destination.
  const dd = (' ' + dest + ' ').split(/ depuis | from /); if (dd.length > 1) { dest = dd[0].trim(); t0 = t0 + ' depuis ' + dd.slice(1).join(' ') + ' '; }
  const parts = t0.split(/ depuis | from /);
  const target = dest || parts[0], origin = parts.length > 1 ? parts.slice(1).join(' ') : '';
  const letter = (site || '').toLowerCase() || null;
  const out = {};
  const fz = origin ? findZone(map, origin, letter, side) : null;
  if (fz) { out.from = zones[fz]; out.fromZone = fz; }
  // Post plant « pour main / pour long » : la bombe est posée là où on la voit DEPUIS main/long (ce n'est pas l'arrivée).
  // → zone « X Plant Main » si on la connaît, sinon le default / le site.
  const nt = ' ' + norm(title) + ' ';
  const isPlant = / (post plant|plant|default|defaut|line up|lineup) /.test(nt) && !/ (retake|defense|anti rush|reveal|flash) /.test(nt);
  if (isPlant && dest && / pour /.test(' ' + norm(title) + ' ')) {
    const seen = findZone(map, dest, letter, side);
    const word = seen ? seen.split(' ').slice(1).join(' ') : norm(dest).split(' ')[0];
    const pz = letter && Object.keys(zones).find((k) => norm(k) === norm(letter + ' plant ' + word));
    const tzp = pz || (letter && zones[letter.toUpperCase() + ' Default'] ? letter.toUpperCase() + ' Default' : letter && zones[letter.toUpperCase() + ' Site'] ? letter.toUpperCase() + ' Site' : null);
    if (tzp && tzp !== fz) { out.to = zones[tzp]; out.toZone = tzp; }
    return out;
  }
  let tz = findZone(map, target.replace(/^(post plant|reveal|anti rush|set up|setup|defense|defaut|block|smoke|molly)\b/g, ''), letter, side);
  if (tz && /Spawn|Barrier/.test(tz)) tz = null; // « vers le spawn » : on ne sait pas où ça tombe, tu places à la main
  // « default / défaut » : point de plant habituel du site, s'il est connu sur cette map.
  if ((!tz || / Site$/.test(tz)) && / (default|defaut|defaults?) /.test(' ' + norm(title) + ' ') && letter && zones[letter.toUpperCase() + ' Default']) tz = letter.toUpperCase() + ' Default';
  if (!tz && !dest && letter && zones[letter.toUpperCase() + ' Site']) tz = letter.toUpperCase() + ' Site';
  if (tz && tz !== fz) { out.to = zones[tz]; out.toZone = tz; }
  return out;
}

// Position d'une zone citée librement (« B Main », « heaven »…) : sert aux utilitaires des sentinelles.
export function zoneAt(map, text, letter, side) {
  const z = findZone(map, text, (letter || '').toLowerCase() || null, side);
  return z ? { name: z, p: Z.zones[map][z] } : null;
}
