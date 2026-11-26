// Tâche « credits » : pour chaque line up qui a une vidéo d'origine mais pas encore de crédit,
// lit le nom de l'auteur de la vidéo (yt-dlp, sans rien télécharger) et remplit « credit ».
// Ne remplace jamais un crédit déjà écrit. Params : limit (nombre max), dry (true = simulation, rien d'écrit).
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
const run = promisify(execFile);
const LU_DIR = new URL('../../site/src/data/lineups/', import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const handleFromUrl = (url) => {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/@([\w.\-]+)/) || (/(^|\.)(x|twitter)\.com$/.test(u.hostname) && u.pathname.match(/^\/([\w]+)\/status\//));
    return m ? m[1] : '';
  } catch { return ''; }
};

export default async function credits({ log, rep, job }) {
  const limit = job.limit ?? Infinity;
  const dry = job.dry === true;
  const files = fs.readdirSync(LU_DIR).filter((f) => f.endsWith('.json')).sort();
  rep(`## Crédits des vidéos d'origine${dry ? ' (simulation, rien écrit)' : ''}\n`);
  rep('| n° | line up | vidéo | crédit trouvé |'); rep('|---|---|---|---|');
  let found = 0, fail = 0, tried = 0;
  const cache = new Map();
  for (const f of files) {
    if (tried >= limit) break;
    const p = path.join(LU_DIR, f), l = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!l.video || (l.credit ?? '').trim()) continue;
    if (/discord\.com|astuces-de-tenshi/.test(l.video)) continue;
    tried++;
    let name = cache.get(l.video);
    if (name === undefined) {
      name = '';
      try {
        const { stdout } = await run('yt-dlp', ['--skip-download', '--no-playlist', '--no-warnings', '-J', l.video], { timeout: 60_000, maxBuffer: 50 * 1024 * 1024 });
        const d = JSON.parse(stdout);
        const handle = d.channel || d.uploader_id || '';
        // Nom affiché sans le slogan (« Affinity | UK Based Content Creator » → « Affinity »).
        const display = String(d.uploader || d.channel || d.creator || '').split(/\s+[|•·]\s+/)[0].trim();
        name = handle && display && handle !== display && !/^\d+$/.test(handle) ? `${display} (@${String(handle).replace(/^@/, '')})` : (display || handle);
      } catch (e) {
        log(`#${l.num} : yt-dlp n'a pas pu lire ${l.video} (${String(e.message).split('\n').pop().slice(0, 160)})`);
      }
      if (!name) name = handleFromUrl(l.video) ? `@${handleFromUrl(l.video)}` : '';
      cache.set(l.video, name);
      await sleep(/instagram/.test(l.video) ? 2500 : 800);
    }
    if (name) {
      found++;
      if (!dry) { l.credit = `Vidéo d’origine : ${name}`; fs.writeFileSync(p, JSON.stringify(l, null, 2) + '\n'); }
      rep(`| ${l.num ?? ''} | ${l.title} | ${l.video} | ✅ ${name} |`);
    } else {
      fail++;
      rep(`| ${l.num ?? ''} | ${l.title} | ${l.video} | ❌ à compléter à la main |`);
    }
  }
  rep(`\n**${found} crédits trouvés, ${fail} à compléter à la main** (sur ${tried} line ups sans crédit).`);
  log(`credits : ${found} trouvés, ${fail} échecs, ${tried} essayés${dry ? ' (simulation)' : ''}`);
}
