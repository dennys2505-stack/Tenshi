// Tâche « import » : transforme les messages du serveur Discord en line ups du site.
// Catégorie = map, salon = agent. Écrit des fichiers JSON + images dans site/ (le workflow les commit).
// Paramètres (job.json) : maps ["Bind"] (vide = toutes), limit (nombre max de line ups créées), dry (true = rien écrit).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { discord, sleep } from '../lib/discord.mjs';
import { place, zoneAt } from '../lib/zones.mjs';
const IGNORED = new Set((() => { try { return JSON.parse(fs.readFileSync(new URL('../../site/src/data/ignored.json', import.meta.url), 'utf8')).messages; } catch { return []; } })());
const ABILITIES = JSON.parse(fs.readFileSync(new URL('../../site/src/data/abilities.json', import.meta.url), 'utf8'));
import { execFileSync } from 'child_process';

const ROOT = new URL('../../site/', import.meta.url).pathname;
const LU_DIR = path.join(ROOT, 'src/data/lineups');
const IMG_DIR = path.join(ROOT, 'public/img/lineups');
const URL_RE = /https?:\/\/[^\s<>)]+/g;
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normUrl = (u) => { try { const x = new URL(u); return (x.host.replace(/^www\./, '') + x.pathname).replace(/\/$/, '').toLowerCase(); } catch { return u; } };

// Salons dont le nom n'est pas un agent : traités plus tard à part.
const SPECIAL = new Set(['general', 'multiagent', 'wallbang', 'gekkokayo']);
// Salon « proposition » : la map et l'agent sont lus dans le message ; tout arrive caché, dans les Coulisses.
const PROPOSAL = 'proposition';
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
  const onlyAgents = (job.agents || []).map(norm);
  const ignores = [];
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
  rep(`## Import ${dry ? '(simulation) ' : ''}— cartes : ${onlyMaps.length ? job.maps.join(', ') : 'toutes'}${onlyAgents.length ? ', agents : ' + job.agents.join(', ') : ''}, limite : ${Number.isFinite(limit) ? limit : 'aucune'}\n`);

  outer:
  for (const g of guilds) {
    const ch = (await discord(`/guilds/${g.id}/channels`)).data;
    const cats = ch.filter((c) => c.type === 4).sort((a, b) => a.position - b.position);
    for (const cat of cats) {
      const catMap = mapName(cat.name);
      const chansAll = ch.filter((c) => (c.type === 0 || c.type === 5) && c.parent_id === cat.id);
      const hasProposal = chansAll.some((c) => norm(c.name) === PROPOSAL);
      if (onlyMaps.length && !onlyMaps.includes(norm(catMap)) && !hasProposal) { skipped.horsFiltre++; continue; }
      const chans = ch.filter((c) => (c.type === 0 || c.type === 5) && c.parent_id === cat.id).sort((a, b) => a.position - b.position);
      for (const c of chans) {
        if (SPECIAL.has(norm(c.name))) { skipped.speciaux.push(`${catMap}/${c.name}`); continue; }
        const prop = norm(c.name) === PROPOSAL;
        if (!prop && onlyMaps.length && !onlyMaps.includes(norm(catMap))) continue;
        const chAgent = prop ? null : agentName(c.name);
        if (!prop && onlyAgents.length && !onlyAgents.includes(norm(chAgent))) continue;
        if (!prop && !agentsData.some((a) => a.name === chAgent)) inconnus.add(`${c.name} → ${chAgent}`);
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
          if (seenMsg.has(m.id) || IGNORED.has(m.id)) { skipped.dejaLa++; continue; }
          const text = (m.content || '').trim();
          // Proposition : map et agent cités dans le texte (sinon « À classer »).
          const tn = ' ' + norm(text.replace(URL_RE, ' ')).replace(/[^a-z0-9]+/g, ' ') + ' ';
          const allMaps = [...mapsData.map((x) => x.name), 'Ascent', 'Split', 'Fracture', 'Icebox', 'Pearl', 'Breeze', 'Sunset', 'Lotus', 'Abyss', 'Haven', 'Bind', 'Corrode', 'Summit'];
          const map = prop ? (allMaps.find((n) => tn.includes(' ' + norm(n) + ' ')) || 'À classer') : catMap;
          const agentNames = [...agentsData.map((a) => a.name), ...Object.keys(AGENT_ALIASES)];
          const foundAg = prop ? agentNames.find((n) => tn.includes(' ' + norm(n).replace(/[^a-z0-9]+/g, '') + ' ')) : null;
          const agent = prop ? (foundAg ? agentName(foundAg) : 'À classer') : chAgent;
          if (prop && onlyAgents.length && !onlyAgents.includes(norm(agent))) continue;
          const urls = text.match(URL_RE) || [];
          const video = urls[0] || '';
          const imgUrls = [
            ...(m.attachments || []).filter((a) => (a.content_type || '').startsWith('image/')).map((a) => a.url),
          ];
          if (!imgUrls.length) for (const e of m.embeds || []) { const u = e.image?.url || e.thumbnail?.url; if (u) imgUrls.push(u); }
          if (!video && !imgUrls.length) { skipped.vide++; continue; }
          if (video && seenVideo.has(normUrl(video))) { skipped.dejaLa++; ignores.push(`${catMap}/${c.name} : « ${(text.split('\n')[0] || '').slice(0, 60)} » (même vidéo)`); continue; }

          const clean = text.replace(URL_RE, '').replace(/<[@#:][^>]*>/g, '').split('\n').map((s) => s.trim()).filter(Boolean);
          let title = (clean[0] || `${agent} – à compléter`).slice(0, 90);
          const notes = clean.slice(1, 6);
          const all_text = clean.join(' ');
          const side = agent === 'Sova' && /reveal/i.test(all_text) && !/post ?plant|d[ée]faut|d[ée]fault|attaque|d[ée]fen[cs]e|atk|\bdef\b|retake|anti ?rush/i.test(all_text) ? 'Attaque et défense' : /\bd[ée]fen[cs]e\b|\bdef\b|anti ?rush|retake|set ?up/i.test(all_text) ? 'Défense' : /post ?plant|attaque|attaquant|\batk\b|d[ée]faut|d[ée]fault|depuis (le |la )?spawn|\bentry\b|one ?way|depuis (le |la )?([abc] )?main/i.test(all_text) ? 'Attaque' : 'À classer';
          let site = (all_text.match(/\b(?:site\s*)?([ABC])\b/) || [])[1] || '';

          const images = [], pending = [];
          let mmPts = null;
          let dupImage = false;
          if (!dry) {
            for (const u of imgUrls.slice(0, 6)) {
              try {
                const r = await fetch(u);
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const buf = Buffer.from(await r.arrayBuffer());
                const hh = await dhash(sharp, buf);
                pending.push({ buf, hh, u, dup: known.some((k) => ham(k, hh) <= 12) });
              } catch (e) { log(`image ignorée (${c.name}) : ${e.message}`); }
            }
            // Doublon par l'image seulement pour un message sans vidéo dont TOUTES les images sont déjà sur le site
            // (avant : une seule image proche suffisait → les mini maps, toutes semblables, faisaient sauter des line ups).
            dupImage = !video && pending.length > 0 && pending.every((x) => x.dup);
            if (dupImage) { skipped.dejaLa++; ignores.push(`${catMap}/${c.name} : « ${(text.split('\n')[0] || '').slice(0, 60)} » (mêmes images)`); continue; }
            for (const { buf, hh, u } of pending) {
              const name = crypto.createHash('sha1').update(new URL(u).pathname).digest('hex').slice(0, 12) + '.jpg';
              await sharp(buf).rotate().resize({ width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(path.join(IMG_DIR, name));
              known.push(hh);
              // Image = mini map annotée (point blanc = départ, croix = arrivée) ? On en tire les points, sans l'afficher en photo.
              const mm = mapsData.find((x) => x.name === map)?.minimap;
              if (mm) {
                try {
                  const r = JSON.parse(execFileSync('python3', [new URL('../tools/minimap_points.py', import.meta.url).pathname, path.join(IMG_DIR, name), path.join(ROOT, 'public', mm)], { encoding: 'utf8', timeout: 120000 }));
                  if (r.minimap) { mmPts = r; log(`mini map reconnue (${map}, score ${r.score})`); continue; }
                } catch (e) { log('analyse mini map impossible : ' + e.message.split('\n')[0]); }
              }
              images.push({ src: `/img/lineups/${name}`, cap: '' });
            }
          }
          let id = slug(`${map}-${agent}-${title}`) || `${slug(map)}-${slug(agent)}-${m.id}`;
          if (ids.has(id)) id += '-' + m.id.slice(-5);
          ids.add(id);
          // Charge et rebonds écrits dans le message (« full charge un rebond », « charge pleine 2 rebonds »).
          if (/full ?charge|charge pleine|pleine charge/i.test(all_text)) notes.push('Charge pleine');
          const rb = all_text.match(/\b(0|1|2|un|une|deux|z[ée]ro|sans)\s*(rebonds?|bounces?)\b/i);
          if (rb) { const n = { un: 1, une: 1, deux: 2, zero: 0, 'zéro': 0, sans: 0 }[rb[1].toLowerCase()] ?? +rb[1]; notes.push(n === 0 ? 'Sans rebond' : `${n} rebond${n > 1 ? 's' : ''}`); }
          // … et on les retire du titre, puisqu'ils passent en indications.
          title = title.replace(/\s*(full ?charge|charge pleine|pleine charge)\s*/ig, ' ').replace(/\s*\b(0|1|2|un|une|deux|z[ée]ro|sans)\s*(rebonds?|bounces?)\b\s*/ig, ' ').replace(/\s+/g, ' ').trim() || title;
          let pts = place(map, side, site, title);
          // Pas de lettre de site dans le texte : on la déduit de la zone (« elbow » sur Sunset → A).
          const zl = [pts.toZone, pts.fromZone].map((z) => (z || '').match(/^([ABC]) /)?.[1]).find(Boolean);
          if (!site && zl) { site = zl; pts = place(map, side, site, title); }
          if (mmPts?.from) { pts.from = mmPts.from; pts.fromZone = 'mini map Discord'; }
          if (mmPts?.to) { pts.to = mmPts.to; pts.toZone = 'mini map Discord'; }
          // Trop peu d'infos (pas de titre exploitable ni de point) → cachée au public, visible dans les Coulisses.
          // Sentinelles : une ligne par utilitaire, ex. « Cage : B Main », « Fil - B Lobby » → icône posée sur la zone.
          const marks = [];
          for (const ab of ABILITIES[agent] ?? []) {
            for (const line of text.split('\n').slice(1)) {
              const mm2 = line.match(/^\s*([^:\-–]+?)\s*[:\-–]\s*(.+)$/); if (!mm2) continue;
              const w = norm(mm2[1]).replace(/[^a-z]/g, '');
              if (!ab.words.some((x) => norm(x).replace(/[^a-z]/g, '') === w || w === norm(x).replace(/[^a-z]/g, '') + 's')) continue;
              const z = zoneAt(map, mm2[2], site, side); if (z) marks.push({ t: ab.key, p: z.p });
            }
          }
          const poor = /à compléter/.test(title) || (!pts.from && !pts.to && !marks.length);
          // Vérifiée d'office seulement si tout y est et vient de l'auteur : photos jointes sur Discord (pas des images tirées de la vidéo),
          // départ ET arrivée lus sur sa mini map, côté et site connus, vrai titre. Au moindre doute → « À vérifier ».
          const sure = !poor && mmPts?.from && mmPts?.to && (m.attachments?.length ?? 0) > 0 && images.length > 0
            && side !== 'À classer' && !!site && title.split(/\s+/).length >= 3;
          const lu = { id, num: ++num, map, agent, side, site, title, notes, reveal: agent === 'Fade' && /reveal/i.test(all_text), images, from: pts.from || null, to: pts.to || null, ...(marks.length ? { marks } : {}), video, credit: '', auto: true, ...(poor || prop ? { hidden: true } : {}), ...(prop ? { proposed: true } : {}), ...(sure && !prop ? { checked: true } : {}), source: { message: m.id } };
          if (!dry) fs.writeFileSync(path.join(LU_DIR, id + '.json'), JSON.stringify(lu, null, 2) + '\n');
          seenMsg.add(m.id); if (video) seenVideo.add(normUrl(video));
          created.push({ ...lu, imgCount: images.length || imgUrls.length, zones: `${pts.fromZone || '?'} → ${pts.toZone || '?'}` });
        }
      }
    }
  }

  log(`Import : ${created.length} line ups ${dry ? 'simulées' : 'créées'}`);
  rep(`### ${created.length} line ups ${dry ? 'simulées' : 'créées'}\n`);
  rep('| n° | map | agent | côté | site | titre | points | photos | vidéo |');
  rep('|---|---|---|---|---|---|---|---|---|');
  for (const l of created) rep(`| ${l.num} | ${l.map} | ${l.agent} | ${l.side} | ${l.site || '–'} | ${l.title.replace(/\|/g, '/')} | ${l.zones} | ${l.imgCount} | ${l.video ? new URL(l.video).host.replace('www.', '') : '–'} |`);
  rep(`\nIgnorés : ${skipped.dejaLa} déjà présents (même message, même lien ou même image), ${skipped.vide} messages sans lien ni image.`);
  if (ignores.length) { rep('\nDétail des doublons (hors messages déjà importés) :'); for (const x of ignores) rep('- ' + x); }
  if (skipped.speciaux.length) rep(`\nSalons spéciaux laissés de côté pour l'instant : ${skipped.speciaux.join(', ')}.`);
  if (inconnus.size) rep(`\nSalons dont le nom n'est pas un agent connu (créés quand même) : ${[...inconnus].join(' ; ')}.`);
}
