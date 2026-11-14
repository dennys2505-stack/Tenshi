// Tâche « frames » : pour chaque line up qui a une vidéo mais aucune image, télécharge la vidéo (yt-dlp)
// et en tire quelques images (ffmpeg), ajoutées à la fiche. À trier ensuite depuis /admin/.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
const run = promisify(execFile);
const ROOT = new URL('../../site/', import.meta.url).pathname;
const LU_DIR = path.join(ROOT, 'src/data/lineups');
const IMG_DIR = path.join(ROOT, 'public/img/lineups');

export default async function frames({ log, rep, job }) {
  const limit = job.limit ?? Infinity;
  const marks = job.marks ?? [0.2, 0.4, 0.6, 0.8];
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const files = fs.readdirSync(LU_DIR).filter((f) => f.endsWith('.json')).sort();
  rep('## Images tirées des vidéos\n'); rep('| n° | titre | résultat |'); rep('|---|---|---|');
  let done = 0, fail = 0;
  for (const f of files) {
    if (done + fail >= limit) break;
    const p = path.join(LU_DIR, f), l = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!l.video || (l.images ?? []).length || l.framesTried) continue;
    const tmp = fs.mkdtempSync('/tmp/fr-'), out = path.join(tmp, 'v.mp4');
    try {
      await run('yt-dlp', ['--no-playlist', '--no-warnings', '-f', 'b[filesize<40M]/w', '--max-filesize', '40M', '-o', out, l.video], { timeout: 150_000 });
      const dur = parseFloat((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out])).stdout) || 0;
      const imgs = [];
      for (const m of marks) {
        const name = crypto.createHash('sha1').update(l.id + m).digest('hex').slice(0, 12) + '.jpg';
        await run('ffmpeg', ['-y', '-v', 'error', '-ss', (dur * m).toFixed(2), '-i', out, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '4', path.join(IMG_DIR, name)]);
        if (fs.existsSync(path.join(IMG_DIR, name))) imgs.push({ src: `/img/lineups/${name}`, cap: '' });
      }
      // Sova : le nombre de rebonds est affiché à l'écran (« BOUNCES : 2 ») pendant la visée → indication ajoutée.
      let extra = '';
      if (l.agent === 'Sova') {
        try {
          await run('ffmpeg', ['-y', '-v', 'error', '-i', out, '-vf', "fps=2,crop=iw*0.6:ih*0.35:iw*0.2:ih*0.45,scale=iw*2:-2,format=gray,lutyuv=y='if(gt(val,165),0,255)'", path.join(tmp, 'o%03d.png')], { timeout: 120_000 });
          let last = null;
          for (const fr of fs.readdirSync(tmp).filter((x) => x.startsWith('o')).sort()) {
            const t = (await run('tesseract', [path.join(tmp, fr), '-', '--psm', '11'], { timeout: 30_000 })).stdout;
            const mm = t.match(/B[O0]UNCE[S5]?\s*[:;.]?\s*([0-2])/i);
            if (mm) last = +mm[1];
          }
          if (last !== null) {
            const note = last === 0 ? 'Sans rebond' : `${last} rebond${last > 1 ? 's' : ''}`;
            l.notes = [...(l.notes ?? []).filter((n) => !/rebond/i.test(n)), note]; extra = ` · ${note}`;
          }
        } catch (e) { log('lecture des rebonds impossible : ' + String(e.message).split('\n')[0]); }
      }
      l.images = imgs; fs.writeFileSync(p, JSON.stringify(l, null, 2) + '\n');
      done++; rep(`| ${l.num} | ${l.title.replace(/\|/g, '/')} | ✅ ${imgs.length} images (vidéo ${dur.toFixed(0)} s)${extra} |`);
    } catch (e) {
      fail++;
      const msg = (String(e.stderr || e.message).split('\n').find((x) => /ERROR/.test(x)) || String(e.message).split('\n')[0]).slice(0, 140).replace(/\|/g, '/');
      rep(`| ${l.num} | ${l.title.replace(/\|/g, '/')} | ❌ ${msg} |`);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  log(`Frames : ${done} réussies, ${fail} échecs`);
  rep(`\n${done} line ups complétées, ${fail} échecs.`);
}
