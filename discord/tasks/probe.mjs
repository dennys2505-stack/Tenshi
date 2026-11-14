// Tâche « probe » : teste si le serveur de GitHub peut télécharger les vidéos des line ups (yt-dlp) et en tirer des images (ffmpeg).
// Ne publie que le résultat (réussi / erreur), jamais la vidéo.
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
const run = promisify(execFile);
const LU_DIR = new URL('../../site/src/data/lineups/', import.meta.url).pathname;

export default async function probe({ log, rep, job }) {
  const urls = [...new Set(fs.readdirSync(LU_DIR).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(LU_DIR, f), 'utf8')).video).filter(Boolean))];
  const byHost = {};
  for (const u of urls) { const h = new URL(u).host.replace('www.', ''); (byHost[h] ||= []).push(u); }
  const pick = Object.values(byHost).flatMap((l) => l.slice(0, job.perHost ?? 2));
  const tmp = '/tmp/probe'; fs.mkdirSync(tmp, { recursive: true });
  try { const v = await run('yt-dlp', ['--version']); log('yt-dlp ' + v.stdout.trim()); } catch (e) { throw new Error('yt-dlp absent : ' + e.message); }
  rep('## Test de téléchargement des vidéos\n');
  rep('| site | résultat | détail |'); rep('|---|---|---|');
  let ok = 0;
  for (const u of pick) {
    const host = new URL(u).host.replace('www.', '');
    const out = path.join(tmp, `v${Math.random().toString(36).slice(2, 8)}.mp4`);
    try {
      await run('yt-dlp', ['--no-playlist', '--no-warnings', '-f', 'b[filesize<40M]/w', '--max-filesize', '40M', '-o', out, u], { timeout: 150_000 });
      const dur = parseFloat((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out])).stdout) || 0;
      let n = 0;
      for (const p of [0.15, 0.35, 0.55, 0.75]) {
        const f = out.replace('.mp4', `_${n}.jpg`);
        await run('ffmpeg', ['-y', '-v', 'error', '-ss', String((dur * p).toFixed(2)), '-i', out, '-frames:v', '1', f]);
        if (fs.existsSync(f)) n++;
      }
      ok++; rep(`| ${host} | ✅ | vidéo ${dur.toFixed(0)} s, ${n} images extraites |`);
    } catch (e) {
      const msg = String(e.stderr || e.message).split('\n').filter((l) => /ERROR|error/.test(l))[0] || String(e.message).split('\n')[0];
      rep(`| ${host} | ❌ | ${msg.slice(0, 160).replace(/\|/g, '/')} |`);
    }
  }
  log(`Probe : ${ok}/${pick.length} vidéos téléchargées`);
}
