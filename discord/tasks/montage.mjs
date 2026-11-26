// Tâche « montage » (étape 1 : récupération) : lit le salon privé « video-line-up-a-monter »,
// prend la vidéo la plus récente (fichier joint ou lien Google Drive), la télécharge et publie dans le
// compte-rendu (branche bot-logs) : infos, planches d'images (1 image / seconde) ; les vidéos (copie légère, montages) vont dans l'artefact privé « videos-bot ».
// Rien n'est publié sur le site ni sur Discord à cette étape.
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { discord } from '../lib/discord.mjs';
const run = promisify(execFile);
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const CHANNEL = 'videolineupamonter';
const DRIVE_RE = /https?:\/\/(?:drive|docs)\.google\.com\/[^\s<>]+/i;

function driveId(u) {
  const m = u.match(/\/d\/([\w-]{20,})/) || u.match(/[?&]id=([\w-]{20,})/);
  return m ? m[1] : null;
}

async function downloadDrive(url, out, log) {
  try {
    await run('yt-dlp', ['--no-playlist', '--no-warnings', '-o', out, url], { timeout: 300_000, maxBuffer: 1 << 26 });
    if (fs.existsSync(out) && fs.statSync(out).size > 100_000) return 'yt-dlp';
  } catch (e) { log('yt-dlp Drive :', String(e.stderr || e.message).split('\n').filter(Boolean).pop()); }
  const id = driveId(url);
  if (!id) throw new Error('lien Drive sans identifiant de fichier (lien de dossier ?)');
  const r = await fetch(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`, { redirect: 'follow' });
  const type = r.headers.get('content-type') || '';
  if (!r.ok || type.includes('text/html')) throw new Error(`Drive refuse le téléchargement (${r.status}, ${type}) : le fichier est-il partagé « Tous les utilisateurs disposant du lien » ?`);
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  return 'téléchargement direct';
}

export default async function montage({ log, rep, job }) {
  const guilds = (await discord('/users/@me/guilds')).data;
  let chan = null;
  for (const g of guilds) {
    const ch = (await discord(`/guilds/${g.id}/channels`)).data;
    chan = ch.find((c) => norm(c.name) === CHANNEL) || chan;
  }
  if (!chan) throw new Error('salon « video-line-up-a-monter » introuvable ou invisible pour le bot (vérifier qu’il est ajouté au salon privé)');
  // Nettoyage : supprime les messages du bot dans le fil d'un message (param « cleanup » = id du message).
  if (job.cleanup) {
    const me = (await discord('/users/@me')).data.id;
    const tm = await discord(`/channels/${job.cleanup}/messages?limit=50`);
    let n = 0;
    for (const m of tm.status === 200 ? tm.data : []) if (m.author?.id === me) { const d = await discord(`/channels/${job.cleanup}/messages/${m.id}`, { method: 'DELETE' }); if (d.status < 300) n++; }
    const del = await discord(`/channels/${job.cleanup}`, { method: 'DELETE' });
    await discord(`/channels/${chan.id}/messages/${job.cleanup}/reactions/${encodeURIComponent('🎬')}/@me`, { method: 'DELETE' });
    rep(`- Nettoyage du fil ${job.cleanup} : ${n} message(s) du bot supprimé(s), fil ${del.status < 300 ? 'supprimé' : 'gardé (' + del.status + ')'}`);
    if (!job.render && !job.at && !job.dense) return;
  }
  // Dossier Drive (secret DRIVE_FOLDER) : liste des clips ; param « file » = nom (ou début du nom) du clip à monter.
  let driveFiles = [];
  if (process.env.DRIVE_FOLDER) {
    try {
      const ls = await run('python3', [new URL('../tools/drive_list.py', import.meta.url).pathname], { timeout: 120_000, maxBuffer: 1 << 24 });
      driveFiles = JSON.parse(ls.stdout.trim().split('\n').pop() || '[]').sort((a, b) => a.name.localeCompare(b.name));
      rep(`- Dossier Drive : ${driveFiles.length} vidéo(s)`);
      if (!driveFiles.length && ls.stderr) rep(`  (détail : ${ls.stderr.trim().slice(0, 600)})`);
      for (const [i, f] of driveFiles.entries()) rep(`  ${i + 1}. ${f.name}`);
    } catch (e) { rep(`- Dossier Drive illisible : ${String(e.stderr || e.message).split('\n').filter(Boolean).pop()}`); }
    if (job.list) return;
  }
  // Lire les messages d'un fil (param « thread » = id du message de départ).
  if (job.thread) {
    const t = await discord(`/channels/${job.thread}/messages?limit=50`);
    rep(`## Fil ${job.thread} (${t.status})\n`);
    for (const m of (t.status === 200 ? t.data : []).reverse()) rep(`- ${m.timestamp.slice(0, 16)} ${m.author?.bot ? '[bot]' : '[toi]'} ${(m.content || '').replace(/\n/g, ' ')}${(m.attachments || []).map((a) => ' [pièce jointe ' + a.filename + ']').join('')}`);
    fs.mkdirSync('out/thread', { recursive: true });
    for (const m of (t.status === 200 ? t.data : [])) for (const a of (m.author?.bot ? [] : m.attachments || [])) {
      if (/^image\//.test(a.content_type || '')) { const b = await fetch(a.url); fs.writeFileSync(`out/thread/${a.filename}`, Buffer.from(await b.arrayBuffer())); }
    }
    return;
  }
  const r = await discord(`/channels/${chan.id}/messages?limit=100`);
  if (r.status !== 200) throw new Error(`lecture du salon refusée (${r.status}) : donner au bot « Voir le salon » + « Lire l’historique »`);
  const msgs = r.data.filter((m) => !m.author?.bot);
  // Heure d'un clip Medal (nom « MedalTVValorantAAAAMMJJhhmmss… », heure de Bruxelles) → Date.
  const clipTime = (name) => {
    const m = name.match(/(20\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (!m) return null;
    const asUtc = Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    const tz = new Date(asUtc).toLocaleString('en-US', { timeZone: 'Europe/Brussels', hour12: false });
    const off = new Date(tz + ' UTC').getTime() - asUtc; // décalage de Bruxelles à cette date
    return new Date(asUtc - off);
  };
  const driveFile = job.file ? driveFiles.find((f) => f.name === job.file) || driveFiles.find((f) => f.name.startsWith(job.file)) : null;
  if (job.file && !driveFile) throw new Error(`clip « ${job.file} » introuvable dans le dossier Drive`);
  const hasVideoRaw = (m) => (m.attachments || []).some((a) => /^video\//.test(a.content_type || '') || /\.(mp4|mov|webm|mkv)$/i.test(a.filename)) || DRIVE_RE.test(m.content || '');
  const hasVideo = (m) => (m.attachments || []).some((a) => /^video\//.test(a.content_type || '') || /\.(mp4|mov|webm|mkv)$/i.test(a.filename)) || DRIVE_RE.test(m.content || '');
  // Sans lien ni fichier : le clip Drive le plus récent enregistré avant le message.
  // Chaque consigne prend le clip le plus récent enregistré AVANT elle, qui n'a pas déjà été pris par une consigne plus ancienne.
  const clipsT = driveFiles.map((f) => ({ ...f, t: clipTime(f.name) })).filter((f) => f.t).sort((a, b) => a.t - b.t);
  const assigned = new Map();
  for (const m of [...msgs].filter((x) => !hasVideoRaw(x)).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))) {
    const used = new Set(assigned.values());
    const c = clipsT.filter((f) => f.t <= new Date(m.timestamp) && !used.has(f.id)).pop();
    if (c) assigned.set(m.id, c.id);
  }
  const autoClip = (m) => clipsT.find((f) => f.id === assigned.get(m.id));
  // Téléchargement de la vidéo d'un message (fichier joint, lien Drive, clip du dossier Drive).
  const getVideo = async (m, dest, file = null) => {
    const a = (m.attachments || []).find((x) => /^video\//.test(x.content_type || '') || /\.(mp4|mov|webm|mkv)$/i.test(x.filename));
    if (a) { const b = await fetch(a.url); fs.writeFileSync(dest, Buffer.from(await b.arrayBuffer())); return 'fichier Discord'; }
    if (file) { await downloadDrive(`https://drive.google.com/file/d/${file.id}/view`, dest, log); return `dossier Drive (${file.name})`; }
    if (DRIVE_RE.test(m.content || '')) return downloadDrive((m.content || '').match(DRIVE_RE)[0], dest, log);
    const f = autoClip(m);
    if (f) { await downloadDrive(`https://drive.google.com/file/d/${f.id}/view`, dest, log); return `dossier Drive, clip le plus proche (${f.name})`; }
    throw new Error(`pas de vidéo pour le message ${m.id}`);
  };
  // Liste des consignes récentes et du clip associé (param « messages »).
  if (job.messages) {
    rep('## Consignes\n');
    for (const m of [...msgs].reverse()) {
      const done = (m.reactions || []).some((r) => r.emoji?.name === '🎬');
      const c = hasVideo(m) ? 'lien/fichier' : (autoClip(m)?.name ?? '—');
      rep(`- ${m.id} · ${m.timestamp.slice(0, 16)} ${done ? '🎬' : ''} · ${(m.content || '').replace(DRIVE_RE, '[lien]').replace(/\n/g, ' ').slice(0, job.full ? 600 : 160)} → ${c}`);
    }
    return;
  }
  // Planches détaillées de plusieurs consignes d'un coup (param « sheets » : [ids], « dense » [début, fin, ips]).
  if (job.sheets) {
    rep('## Planches\n');
    fs.mkdirSync('out/sheets', { recursive: true });
    const [a0, b0, f0] = job.dense || [0, 64, 2];
    for (const id of job.sheets) {
      const m = msgs.find((x) => x.id === id);
      if (!m) { rep(`- ❌ ${id} introuvable`); continue; }
      const tmpS = fs.mkdtempSync('/tmp/sh-'), src = path.join(tmpS, 'source.mp4');
      try {
        const how = await getVideo(m, src);
        await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(a0), '-to', String(b0), '-i', src, '-vf', `fps=${f0},scale=480:-2,tile=4x4:padding=4:color=white`, `out/sheets/${id}-%02d.jpg`], { timeout: 300_000 });
        rep(`- ${id} : ${how}`);
      } catch (e) { rep(`- ❌ ${id} : ${String(e.stderr || e.message).split('\n').filter(Boolean).pop()}`); }
      fs.rmSync(tmpS, { recursive: true, force: true });
    }
    return;
  }
  // Compilation YouTube (param « compile » : {title, subtitle, minimap, items: [{message, plan, label, tag, from, to, impact}]}).
  // Sortie dans youtube/ (artefact GitHub de 3 jours), jamais dans bot-logs.
  if (job.compile) {
    rep('## Compilation YouTube\n');
    fs.mkdirSync('youtube', { recursive: true });
    const tmpC = fs.mkdtempSync('/tmp/cp-');
    const items = [];
    for (const [i, it] of job.compile.items.entries()) {
      const m = msgs.find((x) => x.id === it.message);
      if (!m) throw new Error(`consigne ${it.message} introuvable`);
      const src = path.join(tmpC, `src${i}.mp4`), pl = path.join(tmpC, `plan${i}.json`), out = path.join(tmpC, `m${i}.mp4`);
      const how = await getVideo(m, src);
      fs.writeFileSync(pl, JSON.stringify(it.plan));
      const r1 = await run('python3', [new URL('../tools/montage.py', import.meta.url).pathname, src, pl, out, 'horizontal', 'hq'], { timeout: 900_000 });
      rep(`- ${i + 1}. ${it.label} (${how}) : ${r1.stdout.trim()}`);
      items.push({ ...it, plan: undefined, mp4: out });
    }
    const spec = path.join(tmpC, 'spec.json');
    fs.writeFileSync(spec, JSON.stringify({ ...job.compile, minimap: path.resolve('site/public' + job.compile.minimap), items }));
    const r2 = await run('python3', [new URL('../tools/compile.py', import.meta.url).pathname, spec, `youtube/${job.compile.file || 'compilation'}.mp4`], { timeout: 1_800_000 });
    rep(`- Compilation : ${r2.stdout.trim()}`);
    return;
  }
  // Images fixes pour le site (param « stills » : [{ message | match, shots: [{ t, name, marks }] }]).
  if (job.stills) {
    rep('## Images pour le site\n');
    fs.mkdirSync('out/stills', { recursive: true });
    for (const it of job.stills) {
      const m = msgs.find((x) => (it.message ? x.id === it.message : (x.content || '').toLowerCase().includes(String(it.match).toLowerCase())));
      if (!m) { rep(`- ❌ message introuvable (${it.message || it.match})`); continue; }
      const tmpS = fs.mkdtempSync('/tmp/st-'), src = path.join(tmpS, 'source.mp4');
      try {
        const how = await getVideo(m, src, it.file ? driveFiles.find((f) => f.name.startsWith(it.file)) : null);
        for (const sh of it.shots) {
          const res = await run('python3', [new URL('../tools/still.py', import.meta.url).pathname, src, String(sh.t), `out/stills/${sh.name}`, JSON.stringify(sh.marks || [])]);
          rep(`- ${sh.name} (${m.id}, ${sh.t} s, ${how}) : ${res.stdout.trim().split(' ').pop()} octets`);
        }
      } catch (e) { rep(`- ❌ ${m.id} : ${String(e.stderr || e.message).split('\n').filter(Boolean).pop()}`); }
      fs.rmSync(tmpS, { recursive: true, force: true });
    }
    return;
  }
  const pick = msgs.find((m) => (job.message ? m.id === job.message : true) &&
    (driveFile || (!hasVideo(m) && autoClip(m)) || (m.attachments || []).some((a) => /^video\//.test(a.content_type || '') || /\.(mp4|mov|webm|mkv)$/i.test(a.filename)) || DRIVE_RE.test(m.content || '')));
  rep(`## Montage — étape 1 : récupération\n`);
  rep(`- Salon : #${chan.name} — ${msgs.length} message(s) lus`);
  if (!pick) { rep('- Aucune vidéo (fichier ou lien Drive) trouvée.'); return; }
  const text = (pick.content || '').replace(DRIVE_RE, '[lien Drive]').trim();
  rep(`- Message ${pick.id} du ${pick.timestamp}`);
  rep(`- Consigne : ${text || '(aucune)'}`);

  const tmp = fs.mkdtempSync('/tmp/mt-'), v = path.join(tmp, 'source.mp4');
  const att = (pick.attachments || []).find((a) => /^video\//.test(a.content_type || '') || /\.(mp4|mov|webm|mkv)$/i.test(a.filename));
  let how;
  if (att) { const b = await fetch(att.url); fs.writeFileSync(v, Buffer.from(await b.arrayBuffer())); how = 'fichier Discord'; }
  else if (!driveFile && !DRIVE_RE.test(pick.content || '') && autoClip(pick)) { const f = autoClip(pick); how = `dossier Drive, clip le plus proche (${f.name})`; await downloadDrive(`https://drive.google.com/file/d/${f.id}/view`, v, log); }
  else if (driveFile) { how = `dossier Drive (${driveFile.name})`; await downloadDrive(`https://drive.google.com/file/d/${driveFile.id}/view`, v, log); }
  else how = await downloadDrive((pick.content || '').match(DRIVE_RE)[0], v, log);
  const mb = (fs.statSync(v).size / 1e6).toFixed(1);
  const info = JSON.parse((await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', v])).stdout);
  const st = info.streams[0], dur = parseFloat(info.format.duration);
  rep(`- Téléchargé via ${how} : ${mb} Mo, ${st.width}×${st.height}, ${st.r_frame_rate} ips, ${dur.toFixed(1)} s`);

  fs.mkdirSync('out/montage', { recursive: true });
  // Planches : 1 image par seconde, 4×4 = 16 s par planche, dans l'ordre (gauche→droite, haut→bas).
  await run('ffmpeg', ['-y', '-v', 'error', '-i', v, '-vf', 'fps=1,scale=480:-2,tile=4x4:padding=4:color=white', 'out/montage/planche-%02d.jpg'], { timeout: 300_000 });
  // Copie légère pour revoir la vidéo.
  await run('ffmpeg', ['-y', '-v', 'error', '-i', v, '-vf', 'scale=960:-2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-b:a', '96k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'out/montage/apercu.mp4'], { timeout: 300_000 });
  // Images pleine définition demandées (param « at » : secondes).
  for (const t of job.at || []) {
    await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', v, '-frames:v', '1', '-q:v', '2', `out/montage/image-${String(t).replace('.', '_')}s.jpg`]);
  }
  // Planche détaillée (param « dense » : [début, fin, images/s]).
  if (job.dense) {
    const [a, b, f] = job.dense;
    await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(a), '-to', String(b), '-i', v, '-vf', `fps=${f},scale=480:-2,tile=4x4:padding=4:color=white`, 'out/montage/detail-%02d.jpg'], { timeout: 300_000 });
  }
  // Étape 2 : montage selon le plan (param « render »), puis envoi dans un fil sous la vidéo (param « post »).
  if (job.render) {
    const plan = path.join(tmp, 'plan.json');
    fs.writeFileSync(plan, JSON.stringify(job.render));
    const files = [];
    for (const fmt of job.formats || ['horizontal']) {
      const outFile = `out/montage/montage-${fmt}.mp4`;
      const res = await run('python3', [new URL('../tools/montage.py', import.meta.url).pathname, v, plan, outFile, fmt], { timeout: 900_000 });
      rep(`- Montage ${fmt} : ${res.stdout.trim()} → ${outFile}`);
      files.push(outFile);
    }
    if (job.post) {
      const th = await discord(`/channels/${chan.id}/messages/${pick.id}/threads`, { method: 'POST', body: { name: job.render.title.slice(0, 90), auto_archive_duration: 10080 } });
      const threadId = th.status < 300 ? th.data.id : pick.id; // fil déjà créé → id du fil = id du message
      const { cleanToken } = await import('../lib/discord.mjs');
      for (const [i, f] of files.entries()) {
        const fd = new FormData();
        fd.append('payload_json', JSON.stringify({ content: i === 0 ? (job.postText || 'Montage test : dis-moi ce qu’il faut corriger 🙂') : '' }));
        fd.append('files[0]', new Blob([fs.readFileSync(f)], { type: 'video/mp4' }), path.basename(f));
        const pr = await fetch(`https://discord.com/api/v10/channels/${threadId}/messages`, { method: 'POST', headers: { Authorization: `Bot ${cleanToken()}` }, body: fd });
        rep(`- Envoi ${path.basename(f)} dans le fil : ${pr.status}${pr.ok ? ' ✅' : ' ❌ ' + (await pr.text()).slice(0, 200)}`);
      }
      await discord(`/channels/${chan.id}/messages/${pick.id}/reactions/${encodeURIComponent('🎬')}/@me`, { method: 'PUT' });
    }
  }
  const sheets = fs.readdirSync('out/montage').filter((f) => f.startsWith('planche')).length;
  rep(`- ${sheets} planche(s) d'images (1 image/s) dans bot-logs (montage/) ; apercu.mp4 et montages mp4 en artefact privé « videos-bot » (3 jours)`);
  fs.rmSync(tmp, { recursive: true, force: true });
}
