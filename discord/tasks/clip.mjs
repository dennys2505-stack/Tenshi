// Tâche « clip » (test) : pour les line ups choisies (param nums), télécharge la vidéo et découpe ~3 s autour
// du moment où ça bouge le plus (souvent le lancer), en boucle muette, légère (480 px, sans son).
// Résultat : site/public/clips/<id>.mp4 + champ « clipTest » dans la fiche (affiché seulement sur /test-clip/).
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
const run = promisify(execFile);
const ROOT = new URL('../../site/', import.meta.url).pathname;
const LU_DIR = path.join(ROOT, 'src/data/lineups');
const CLIP_DIR = path.join(ROOT, 'public/clips');

const MOTION_PY = `
import sys, glob, numpy as np
from PIL import Image
fs = sorted(glob.glob(sys.argv[1] + '/m*.png'))
prev = None; d = []
for f in fs:
    a = np.asarray(Image.open(f).convert('L')).astype(float)
    d.append(0 if prev is None else float(np.abs(a - prev).mean())); prev = a
d = np.array(d); k = 5
s = np.convolve(d, np.ones(k) / k, mode='same') if len(d) > k else d
print(int(s.argmax()) if len(s) else 0, len(d))
`;

export default async function clip({ log, rep, job }) {
  const nums = job.nums || [];
  fs.mkdirSync(CLIP_DIR, { recursive: true });
  rep('## Clips de test\n'); rep('| n° | titre | résultat |'); rep('|---|---|---|');
  for (const f of fs.readdirSync(LU_DIR).filter((x) => x.endsWith('.json'))) {
    const p = path.join(LU_DIR, f), l = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!nums.includes(l.num) || !l.video) continue;
    const tmp = fs.mkdtempSync('/tmp/cl-'), v = path.join(tmp, 'v.mp4');
    try {
      await run('yt-dlp', ['--no-playlist', '--no-warnings', '-f', 'b[filesize<40M]/w', '--max-filesize', '40M', '-o', v, l.video], { timeout: 150_000 });
      const dur = parseFloat((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', v])).stdout) || 0;
      await run('ffmpeg', ['-y', '-v', 'error', '-i', v, '-vf', 'fps=5,scale=160:-2', path.join(tmp, 'm%04d.png')], { timeout: 120_000 });
      fs.writeFileSync(path.join(tmp, 'motion.py'), MOTION_PY);
      const [idx] = (await run('python3', [path.join(tmp, 'motion.py'), tmp])).stdout.trim().split(' ').map(Number);
      const peak = idx / 5, len = Math.min(3, dur);
      const start = Math.max(0, Math.min(peak - 2, dur - len));
      const out = path.join(CLIP_DIR, `${l.id}.mp4`);
      await run('ffmpeg', ['-y', '-v', 'error', '-ss', start.toFixed(2), '-i', v, '-t', len.toFixed(2), '-an', '-vf', 'scale=480:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { timeout: 120_000 });
      const kb = Math.round(fs.statSync(out).size / 1024);
      l.clipTest = `/clips/${l.id}.mp4`; fs.writeFileSync(p, JSON.stringify(l, null, 2) + '\n');
      rep(`| ${l.num} | ${l.title.replace(/\|/g, '/')} | ✅ ${len.toFixed(1)} s à partir de ${start.toFixed(1)} s (pic de mouvement à ${peak.toFixed(1)} s), ${kb} Ko |`);
    } catch (e) {
      rep(`| ${l.num} | ${l.title.replace(/\|/g, '/')} | ❌ ${String(e.stderr || e.message).split('\n')[0].slice(0, 140).replace(/\|/g, '/')} |`);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
}
