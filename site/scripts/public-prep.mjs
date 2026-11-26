// Préparation du SITE PUBLIC, lancée avant « astro build » (voir package.json).
// Ne fait rien sur le site des amis : il faut PUBLIC_SITE=1 (variable du 2e projet Vercel)
// ET être sur Vercel ou GitHub Actions (jamais sur un ordinateur par erreur, sauf PUBLIC_PREP_FORCE=1 pour tester).
// Sur la copie de travail de Vercel uniquement, retire du site public :
//  - les pages réservées (admin, coulisses, test du clip) et la fonction /api (écriture sur GitHub) ;
//  - le dossier clips (extraits de vidéos d'autres créateurs) ;
//  - les photos de line ups non autorisées en public (ni « own », ni « imgOk ») et les line ups cachées
//    → le site public est plus léger (moins de stockage Vercel) et ne publie que ce qui est permis.
import fs from 'node:fs';
import path from 'node:path';

if (process.env.PUBLIC_SITE !== '1') process.exit(0);
if (!process.env.VERCEL && !process.env.CI && process.env.PUBLIC_PREP_FORCE !== '1') {
  console.error('public-prep : PUBLIC_SITE=1 hors Vercel/CI → rien supprimé (mettre PUBLIC_PREP_FORCE=1 pour tester sur une copie).');
  process.exit(1);
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rm = (p) => { const f = path.join(root, p); if (fs.existsSync(f)) { fs.rmSync(f, { recursive: true, force: true }); console.log('public-prep : retiré', p); } };

for (const p of ['src/pages/admin', 'src/pages/coulisses', 'src/pages/test-clip', 'api', 'public/clips']) rm(p);

// Line ups : les cachées sont retirées ; photos gardées seulement si autorisées.
const dir = path.join(root, 'src/data/lineups');
const keep = new Set();
let removedLineups = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
  const l = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (l.hidden) { fs.rmSync(path.join(dir, f)); removedLineups++; continue; }
  if (l.own === true || l.imgOk === true) for (const i of l.images ?? []) keep.add(i.src);
}
const imgDir = path.join(root, 'public/img/lineups');
let removedImgs = 0;
for (const f of fs.readdirSync(imgDir)) {
  if (!keep.has(`/img/lineups/${f}`)) { fs.rmSync(path.join(imgDir, f)); removedImgs++; }
}
// Tuiles claires d'agents (grand V = forme du logo VALORANT) : jamais sur le site public.
const agDir = path.join(root, 'public/img/agents');
for (const f of fs.readdirSync(agDir)) if (/-clair\.webp$/.test(f)) fs.rmSync(path.join(agDir, f));

// Site public : indexable par les moteurs de recherche.
fs.writeFileSync(path.join(root, 'public/robots.txt'), 'User-agent: *\nAllow: /\n');
console.log(`public-prep : ${removedLineups} line ups cachées retirées, ${removedImgs} photos non autorisées retirées, ${keep.size} photos gardées.`);
