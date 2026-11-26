// Liste les textes de line ups (titres, indications, légendes) qui n'ont pas encore de traduction
// dans src/data/en.json. Sur le site anglais, ces textes s'affichent en français en attendant.
// Usage : cd site && node scripts/en-missing.mjs
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const en = JSON.parse(fs.readFileSync(path.join(root, 'src/data/en.json'), 'utf8'));
const dir = path.join(root, 'src/data/lineups');
const miss = { titles: new Set(), notes: new Set(), caps: new Set() };
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const l = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (l.hidden) continue;
  if (l.title && !en.titles[l.title]) miss.titles.add(l.title);
  for (const n of l.notes ?? []) if (n && !en.notes[n]) miss.notes.add(n);
  for (const i of l.images ?? []) if (i.cap && !en.caps[i.cap]) miss.caps.add(i.cap);
}
let total = 0;
for (const [k, s] of Object.entries(miss)) { total += s.size; if (s.size) console.log(`\n${k} (${s.size}) :\n` + [...s].map((x) => `  "${x}": "",`).join('\n')); }
console.log(total ? `\n${total} texte(s) à traduire dans src/data/en.json` : 'Tout est traduit ✔');
