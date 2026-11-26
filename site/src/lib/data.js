// Toutes les données du site viennent de fichiers du dépôt :
//  - src/data/maps.json     : maps connues (ordre d'affichage, images de fond, mini maps)
//  - src/data/agents.json   : agents connus (images de fond)
//  - src/data/lineups/*.json : une line up par fichier
import mapsData from '../data/maps.json';
import agentsData from '../data/agents.json';
import abilitiesData from '../data/abilities.json';

export const SITE_NAME = 'Les astuces de Tenshi';

// Version publique du site (2e projet Vercel, branche « public ») : variable PUBLIC_SITE=1 dans Vercel.
// Le site des amis (projet actuel) n'a pas cette variable et ne change pas.
export const PUBLIC = import.meta.env.PUBLIC_SITE === '1';
export const CONTACT_EMAIL = 'Tenshinigo@gmail.com';
export const SITE_TAGLINE = 'Line ups Valorant par map et par agent';

export const slug = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const files = import.meta.glob('../data/lineups/*.json', { eager: true });
// Toutes les line ups (admin, coulisses) et seulement celles visibles du public (« hidden » = en attente, cachée).
export const allLineups = Object.values(files)
  .map((m) => m.default ?? m)
  .sort((a, b) => a.id.localeCompare(b.id));
export const lineups = allLineups.filter((l) => !l.hidden);
export const hiddenLineups = allLineups.filter((l) => l.hidden);

// Photos affichées. Site des amis : toutes. Site public : seulement les photos qui sont à Tenshi
// (« own »: true) ou dont l'auteur a donné son accord (« imgOk »: true). Sinon, le public voit
// la mini map, les indications et le lien vers la vidéo d'origine (crédit).
export const imagesOk = (l) => !PUBLIC || l.own === true || l.imgOk === true;
export const shownImages = (l) => (imagesOk(l) ? l.images ?? [] : []);

// Nom du site d'une vidéo d'origine (pour « Vidéo d'origine sur Instagram » quand le crédit manque).
export const videoHost = (url) => {
  try {
    const h = new URL(url).hostname.replace(/^www\.|^m\./, '');
    return { 'instagram.com': 'Instagram', 'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'tiktok.com': 'TikTok', 'x.com': 'X', 'twitter.com': 'X', 'medal.tv': 'Medal' }[h] ?? h;
  } catch { return ''; }
};
// Crédit affiché : champ « credit » ; sinon, sur le site public, « Vidéo d'origine (Instagram) ».
export const creditOf = (l, lang) => {
  const origin = lang === 'en' ? 'Original video' : 'Vidéo d’origine';
  if (l.credit) return lang === 'en' ? l.credit.replace(/^Vidéo d[’']origine\s*:/, `${origin}:`).replace(/^By /, 'By ') : l.credit;
  if (PUBLIC && l.video) return `${origin} (${videoHost(l.video)})`;
  return '';
};

const uniq = (a) => [...new Set(a)];

// Numéro d'agent (VALORANT Protocol, visible sur la bannière en jeu ; le n° 08 n'existe pas).
export const AGENT_NO = { Brimstone: 1, Viper: 2, Omen: 3, Killjoy: 4, Cypher: 5, Sova: 6, Sage: 7, Phoenix: 9, Jett: 10, Reyna: 11, Raze: 12, Breach: 13, Skye: 14, Yoru: 15, Astra: 16, 'KAY/O': 17, Chamber: 18, Neon: 19, Fade: 20, Harbor: 21, Gekko: 22, Deadlock: 23, Iso: 24, Clove: 25, Vyse: 26, Tejo: 27, Waylay: 28, Veto: 29, Miks: 30, Hush: 31 };
export const agentNo = (name) => AGENT_NO[name] ?? 99;

// Maps : maps.json + toute map nouvelle apparue dans une line up.
// Ordre : map pool compétitif d'abord, puis les autres ; ordre alphabétique dans chaque groupe.
export const maps = (() => {
  const known = mapsData.map((m) => ({ ...m }));
  const names = new Set(known.map((m) => m.name));
  for (const n of uniq(lineups.map((l) => l.map))) {
    if (!names.has(n)) known.push({ name: n, slug: slug(n), named: false, bg: null, minimap: null, dim: [640, 640] });
  }
  return known.sort((a, b) => (a.pool ? 0 : 1) - (b.pool ? 0 : 1) || a.name.localeCompare(b.name, 'fr'));
})();

export const agents = agentsData;
export const agentInfo = (name) => agents.find((a) => a.name === name) ?? { name, slug: slug(name), bg: null };

export const mapBySlug = (s) => maps.find((m) => m.slug === s);
export const mapByName = (n) => maps.find((m) => m.name === n);

// Une line up peut servir à plusieurs agents : champ « also » (ex. ["Brimstone", "Viper"]).
export const agentsOf = (l) => uniq([l.agent, ...(l.also ?? [])]);

export const lineupsFor = (mapName, agentName) =>
  lineups.filter((l) => l.map === mapName && (!agentName || agentsOf(l).includes(agentName)));

// Agents d'une map, triés par numéro d'agent.
export const agentsForMap = (mapName) =>
  uniq(lineupsFor(mapName).flatMap(agentsOf)).sort((a, b) => agentNo(a) - agentNo(b) || a.localeCompare(b)).map(agentInfo);

export const count = (n) => (n === 0 ? 'Bientôt' : n === 1 ? '1 line up' : `${n} line ups`);

// Adresses ; lang = 'en' → même page en anglais, préfixée par /en.
const pfx = (lang) => (lang === 'en' ? '/en' : '');
export const lineupUrl = (l, lang) => `${pfx(lang)}/${slug(l.map)}/${slug(l.agent)}/${l.id}/`;
export const agentUrl = (mapName, agentName, lang) => `${pfx(lang)}/${slug(mapName)}/${slug(agentName)}/`;
export const mapUrl = (mapName, lang) => `${pfx(lang)}/${slug(mapName)}/`;
export const homeUrl = (lang) => `${pfx(lang)}/`;

// Compétences d'une line up pour un agent (filtre « Compétence » de la page agent) :
// champ « ability » s'il existe, sinon icônes posées sur la mini map, case Reveal, mots du titre.
// Sova : une line up qui n'est pas un reveal est un shock dart (sauf wall bang / à compléter).
export const abilitiesOf = (l, agentName) => {
  const list = abilitiesData[agentName] ?? [];
  if (!list.length) return [];
  const keys = new Set(list.map((a) => a.key));
  const out = new Set();
  for (const k of [].concat(l.ability ?? [])) if (keys.has(k)) out.add(k);
  if (out.size) return [...out];
  for (const m of l.marks ?? []) if (keys.has(m.t)) out.add(m.t);
  if (l.reveal && keys.has('reveal')) out.add('reveal');
  const title = ` ${String(l.title ?? '').toLowerCase().replace(/[^a-zà-ÿ0-9/]+/g, ' ')} `;
  for (const a of list) if (a.words.some((w) => title.includes(` ${w} `))) out.add(a.key);
  if (agentName === 'Sova' && !out.size && !/wall ?bang|walbang|compl[eé]ter/i.test(l.title ?? '')) out.add('shock');
  return [...out];
};
export const abilityInfo = (agentName, key) => (abilitiesData[agentName] ?? []).find((a) => a.key === key);

// Chemins des pages générées (partagés par les pages FR et EN).
export const mapPaths = () => maps.map((m) => ({ params: { map: m.slug }, props: { map: m } }));
export const agentPaths = () => {
  const pairs = new Map();
  for (const l of lineups) for (const a of agentsOf(l)) pairs.set(`${l.map}|${a}`, [l.map, a]);
  return [...pairs.values()].map(([map, agent]) => ({
    params: { map: slug(map), agent: slug(agent) },
    props: { mapName: map, agentName: agent },
  }));
};
export const lineupPaths = () => lineups.map((l) => ({ params: { map: slug(l.map), agent: slug(l.agent), id: l.id }, props: { lineup: l } }));
