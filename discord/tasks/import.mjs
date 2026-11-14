// Tâche « import » : transforme les messages du serveur Discord en line ups du site.
// Catégorie = map, salon = agent. Écrit des fichiers JSON + images dans site/ (le workflow les commit).
// Paramètres (job.json) : maps ["Bind"] (vide = toutes), limit (nombre max de line ups créées), dry (true = rien écrit).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { discord, sleep } from '../lib/discord.mjs';

const ROOT = new URL('../../site/', import.meta.url).pathname;
const LU_DIR = path.join(ROOT, 'src/data/lineups');
const IMG_DIR = path.join(ROOT, 'public/img/lineups');
const URL_RE = /https?:\/\/[^\s<>)]+/g;
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normUrl = (u) => { try { const x = new URL(u); return (x.host.replace(/^www\./, '') + x.pathname).replace(/\/$/, '').toLowerCase(); } catch { return u; } };

// Salons dont le nom n'est pas un agent : traités plus tard à part.
const SPECIAL = new Set(['general', 'proposition', 'multiagent', 'wallbang', 'gekkokayo']);
const AGENT_ALIASES = { kj: 'Killjoy', kayo: 'KAY/O', pheonix: 'Phoenix', miks: 'Miks', weyley: 'Waylay' };

// Empreinte visuelle 16x16 : sert à repérer une image déjà présente sur le site même recadrée (écart typique 12–22 sur 256 ; images différentes ≈ 90).
async function dhash(sharp, input) {
  const b = await sharp(input).rotate().resize(17, 16, { fit: 'fill' }).greyscale().raw().toBuffer();
  const bits = [];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) bits.push(b[y * 17 + x] > b[y * 17 + x + 1] ? 1 : 0);
  return bits;
}
const ham = (a, b) => a.reduce((s, v, i) => s + (v !== b[i]), 0);

export default async function importTask({ log, rep, job }) {
  const onlyMaps = (job.maps || []).map(norm);
  const limit = job.limit ?? Infinity;
  const dry = !!job.dry;
  const { default: sharp } = await import('sharp');

  const mapsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/maps.json'), 'utf8'));
  const agentsData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/agents.json'), 'utf8'));
  const mapName = (cat) => mapsData.find((m) => norm(m.name) === norm(cat))?.name ?? cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
  const agentName = (ch) => {
    const k = norm(ch);
    return AGENT_ALIASES[k] ?? agentsData.find((a) => norm(a.name) === k)?.name ?? ch.charAt(0).toUpperCase() + ch.slice(1).toLowerCase();
  };

  // Existant : pour ne rien dupliquer et continuer la numérotation.
  fs.mkdirSync(LU_DIR, { recursive: true }); fs.mkdirSync(IMG_DIR, { recursive: true });
  const existing = fs.readdirSync(LU_DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(LU_DIR, f), 'utf8')));
  const seenMsg = new Set(existing.map((l) => l.source?.message).filter(Boolean));
  const seenVideo = new Set(existing.map((l) => l.video && normUrl(l.video)).filter(Boolean));
  const ids = new Set(existing.map((l) => l.id));
  let num = existing.reduce((m, l) => Math.max(m, l.num || 0), 0);

  const known = [];
  for (const f of fs.readdirSync(IMG_DIR).filter((f) => /\.(jpe?g|png)$/i.test(f))) {
    try { known.push(await dhash(sharp, path.join(IMG_DIR, f))); } catch {}
  }
  log(`Images déjà sur le site : ${known.length}`);
  const guilds = (await discord('/users/@me/guilds')).data;
  const created = [], skipped = { dejaLa: 0, vide: 0, speciaux: [], horsFiltre: 0 }, inconnus = new Set();
  rep(`## Import ${dry ? '(simulation) ' : ''}— cartes : ${onlyMaps.length ? job.maps.join(', ') : 'toutes'}, limite : ${Number.isFinite(limit) ? limit : 'aucune'}\n`);

  outer:
  for (const g of guilds) {
    const ch = (await discord(`/guilds/${g.id}/channels`)).data;
    const cats = ch.filter((c) => c.type === 4).sort((a, b) => a.position - b.position);
    for (const cat of cats) {
      const map = mapName(cat.name);
      if (onlyMaps.length && !onlyMaps.includes(norm(map))) { skipped.horsFiltre++; continue; }
      const chans = ch.filter((c) => (c.type === 0 || c.type === 5) && c.parent_id === cat.id).sort((a, b) => a.position - b.position);
      for (const c of chans) {
        if (SPECIAL.has(norm(c.name))) { skipped.speciaux.push(`${map}/${c.name}`); continue; }
        const agent = agentName(c.name);
        if (!agentsData.some((a) => a.name === agent)) inconnus.add(`${c.name} → ${agent}`);
        // Tous les messages, du plus ancien au plus récent.
        let all = [], before = null;
        for (let p = 0; p < 60; p++) {
          const r = await discord(`/channels/${c.id}/messages?limit=100` + (before ? `&before=${before}` : ''));
          await sleep(220);
          if (r.status !== 200 || !r.data.length) break;
          all = all.concat(r.data); before = r.data[r.data.length - 1].id;
          if (r.data.length < 100) break;
        }
        all.reverse();
        for (const m of all) {
          if (created.length >= limit) break outer;
          if (seenMsg.has(m.id)) { skipped.dejaLa++; continue; }
          const text = (m.content || '').trim();
          const urls = text.match(URL_RE) || [];
          const video = urls[0] || '';
          const imgUrls = [
            ...(m.attachments || []).filter((a) => (a.content_type || '').startsWith('image/')).map((a) => a.url),
          ];
          if (!imgUrls.length) for (const e of m.embeds || []) { const u = e.image?.url || e.thumbnail?.url; if (u) imgUrls.push(u); }
          if (!video && !imgUrls.length) { skipped.vide++; continue; }
          if (video && seenVideo.has(normUrl(video))) { skipped.dejaLa++; continue; }

          const clean = text.replace(URL_RE, '').replace(/<[@#:][^>]*>/g, '').split('\n').map((s) => s.trim()).filter(Boolean);
          const title = (clean[0] || `${agent} – à compléter`).slice(0, 90);
          const notes = clean.slice(1, 6);
          const all_text = clean.join(' ');
          const side = /\bd[ée]fense\b|\bdef\b/i.test(all_text) ? 'Défense' : /post ?plant|attaque|\batk\b/i.test(all_text) ? 'Attaque' : 'À classer';
          const site = (all_text.match(/\b(?:site\s*)?([ABC])\b/) || [])[1] || '';

          const images = [], pending = [];
          let dupImage = false;
          if (!dry) {
            for (const u of imgUrls.slice(0, 6)) {
              try {
                const r = await fetch(u);
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const buf = Buffer.from(await r.arrayBuffer());
                const hh = await dhash(sharp, buf);
                if (known.some((k) => ham(k, hh) <= 40)) { dupImage = true; break; }
                pending.push({ buf, hh, u });
              } catch (e) { log(`image ignorée (${c.name}) : ${e.message}`); }
            }
            if (dupImage) { skipped.dejaLa++; continue; }
            for (const { buf, hh, u } of pending) {
              const name = crypto.createHash('sha1').update(new URL(u).pathname).digest('hex').slice(0, 12) + '.jpg';
              await sharp(buf).rotate().resize({ width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(path.join(IMG_DIR, name));
              known.push(hh);
              images.push({ src: `/img/lineups/${name}`, cap: m.attachments?.length ? 'Repère de visée' : 'Aperçu de la vidéo' });
            }
          }
          let id = slug(`${map}-${agent}-${title}`) || `${slug(map)}-${slug(agent)}-${m.id}`;
          if (ids.has(id)) id += '-' + m.id.slice(-5);
          ids.add(id);
          const lu = { id, num: ++num, map, agent, side, site, title, notes, reveal: false, images, video, credit: '', auto: true, source: { message: m.id } };
          if (!dry) fs.writeFileSync(path.join(LU_DIR, id + '.json'), JSON.stringify(lu, null, 2) + '\n');
          seenMsg.add(m.id); if (video) seenVideo.add(normUrl(video));
          created.push({ ...lu, imgCount: images.length || imgUrls.length });
        }
      }
    }
  }

  log(`Import : ${created.length} line ups ${dry ? 'simulées' : 'créées'}`);
  rep(`### ${created.length} line ups ${dry ? 'simulées' : 'créées'}\n`);
  rep('| n° | map | agent | côté | site | titre | photos | vidéo |');
  rep('|---|---|---|---|---|---|---|---|');
  for (const l of created) rep(`| ${l.num} | ${l.map} | ${l.agent} | ${l.side} | ${l.site || '–'} | ${l.title.replace(/\|/g, '/')} | ${l.imgCount} | ${l.video ? new URL(l.video).host.replace('www.', '') : '–'} |`);
  rep(`\nIgnorés : ${skipped.dejaLa} déjà présents (même message, même lien ou même image), ${skipped.vide} messages sans lien ni image.`);
  if (skipped.speciaux.length) rep(`\nSalons spéciaux laissés de côté pour l'instant : ${skipped.speciaux.join(', ')}.`);
  if (inconnus.size) rep(`\nSalons dont le nom n'est pas un agent connu (créés quand même) : ${[...inconnus].join(' ; ')}.`);
}
