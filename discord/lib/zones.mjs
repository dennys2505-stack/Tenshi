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
  const v = t0.split(' vers '); if (v.length > 1) { t0 = v[0] + ' '; dest = v.slice(1).join(' '); }
  const parts = t0.split(/ depuis | from /);
  const target = dest || parts[0], origin = parts.length > 1 ? parts.slice(1).join(' ') : '';
  const letter = (site || '').toLowerCase() || null;
  const out = {};
  const fz = origin ? findZone(map, origin, letter, side) : null;
  if (fz) { out.from = zones[fz]; out.fromZone = fz; }
  let tz = findZone(map, target.replace(/^(post plant|reveal|anti rush|set up|setup|defense|defaut|block|smoke|molly)\b/g, ''), letter, side);
  if (tz && /Spawn|Barrier/.test(tz)) tz = null; // « vers le spawn » : on ne sait pas où ça tombe, tu places à la main
  if (!tz && !dest && letter && zones[letter.toUpperCase() + ' Site']) tz = letter.toUpperCase() + ' Site';
  if (tz && tz !== fz) { out.to = zones[tz]; out.toZone = tz; }
  return out;
}
