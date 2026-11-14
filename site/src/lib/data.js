// Toutes les données du site viennent de fichiers du dépôt :
//  - src/data/maps.json     : maps connues (ordre d'affichage, images de fond, mini maps)
//  - src/data/agents.json   : agents connus (images de fond)
//  - src/data/lineups/*.json : une line up par fichier
import mapsData from '../data/maps.json';
import agentsData from '../data/agents.json';

export const SITE_NAME = 'Les astuces de Tenshi';
export const SITE_TAGLINE = 'Line ups Valorant par map et par agent';

export const slug = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const files = import.meta.glob('../data/lineups/*.json', { eager: true });
export const lineups = Object.values(files)
  .map((m) => m.default ?? m)
  .sort((a, b) => a.id.localeCompare(b.id));

const uniq = (a) => [...new Set(a)];

// Maps : celles de maps.json d'abord (ordre du classé), puis toute map nouvelle apparue dans une line up.
export const maps = (() => {
  const known = mapsData.map((m) => ({ ...m }));
  const names = new Set(known.map((m) => m.name));
  for (const n of uniq(lineups.map((l) => l.map))) {
    if (!names.has(n)) known.push({ name: n, slug: slug(n), named: false, bg: null, minimap: null, dim: [640, 640] });
  }
  return known;
})();

export const agents = agentsData;
export const agentInfo = (name) => agents.find((a) => a.name === name) ?? { name, slug: slug(name), bg: null };

export const mapBySlug = (s) => maps.find((m) => m.slug === s);
export const mapByName = (n) => maps.find((m) => m.name === n);

// Une line up peut servir à plusieurs agents : champ « also » (ex. ["Brimstone", "Viper"]).
export const agentsOf = (l) => uniq([l.agent, ...(l.also ?? [])]);

export const lineupsFor = (mapName, agentName) =>
  lineups.filter((l) => l.map === mapName && (!agentName || agentsOf(l).includes(agentName)));

export const agentsForMap = (mapName) =>
  uniq(lineupsFor(mapName).flatMap(agentsOf)).map(agentInfo);

export const count = (n) => (n === 0 ? 'Bientôt' : n === 1 ? '1 line up' : `${n} line ups`);

export const lineupUrl = (l) => `/${slug(l.map)}/${slug(l.agent)}/${l.id}/`;
export const agentUrl = (mapName, agentName) => `/${slug(mapName)}/${slug(agentName)}/`;
export const mapUrl = (mapName) => `/${slug(mapName)}/`;
