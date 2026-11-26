// Langues du site : français (par défaut, adresses sans préfixe) et anglais (adresses /en/…).
// - Textes de l'interface : dictionnaire UI ci-dessous.
// - Textes des line ups (titres, indications, légendes) : src/data/en.json, clé = texte français exact.
//   Texte absent de en.json → le français s'affiche (rien ne casse). Liste des manques : node scripts/en-missing.mjs
import en from '../data/en.json';

export const LANGS = ['fr', 'en'];
export const pre = (lang) => (lang === 'en' ? '/en' : '');

const UI = {
  fr: {
    home: 'Accueil',
    tagline: 'Line ups Valorant par map et par agent',
    lead: 'Choisis une map, puis ton agent, et retrouve toutes les line ups : où te placer, quoi viser, où ça atterrit.',
    homeDesc: (n) => `${n} line ups Valorant classées par map puis par agent : position de départ, visée et zone d'arrivée.`,
    pool: 'Map pool compétitif actuel',
    poolLead: (n) => `Les ${n} maps jouées en ce moment en compétitif. Mises à jour à chaque changement de map pool.`,
    other: 'Hors map pool',
    otherLead: "Maps qui ne sont plus en compétitif pour l'instant.",
    chooseAgent: 'Choisis ton agent',
    noMapLineup: 'Pas encore de line up pour cette map.',
    mapTitle: (m) => `Line ups ${m}`,
    mapDesc: (c, m) => `${c} sur ${m} (Valorant), classées par agent.`,
    mapSoon: (m) => `Les line ups ${m} arrivent bientôt.`,
    agentTitle: (a, m) => `${a} sur ${m} – line ups`,
    agentDesc: (c, a, m) => `${c} pour ${a} sur ${m} (Valorant) : position de départ, visée et arrivée.`,
    matchBtn: 'Mode match',
    matchHint: 'Écran coupé en 4 cases, pour un 2e écran',
    all: 'Tous',
    side: 'Côté', site: 'Site', ability: 'Compétence',
    noFilter: 'Aucune line up avec ces filtres.',
    alsoFor: 'Marche aussi pour',
    video: 'Voir la vidéo',
    videoOn: (h) => `Voir la vidéo (${h})`,
    share: 'Partager',
    copied: 'Lien copié ✔',
    noImg: 'Les images de visée sont dans la vidéo de l’auteur : ouvre « Voir la vidéo ».',
    backAll: (a, m) => `← Toutes les line ups de ${a} sur ${m}`,
    lineupTitle: (t, a, m) => `${t} – ${a} sur ${m}`,
    lineupDesc: (a, m, s, site, t) => `Line up ${a} sur ${m} (${s}${site ? `, site ${site}` : ''}) : ${t}.`,
    on: 'sur',
    soon: 'Bientôt', one: '1 line up', many: (n) => `${n} line ups`,
    mmFrom: 'Mini map : point = départ, cible = arrivée',
    mmRev: 'Mini map : point = départ, icône = zone de retombée de la reveal',
    mmMolly: 'Mini map : point = départ, feu = arrivée de la molly',
    mmMarks: (list, agent, hasFrom) => `Mini map : ${list}${hasFrom ? ` · point = position de ${agent}` : ''}`,
    origin: 'Vidéo d’origine',
    about: 'À propos, crédits et vie privée',
    footFree: 'Pas de cookies, pas de pub.',
    footFr: 'Site de fan gratuit et non officiel, créé selon la politique « Legal Jibber Jabber » de Riot Games avec des éléments appartenant à Riot Games. Riot Games ne soutient ni ne sponsorise ce projet.',
    switchTo: 'English',
    switchLabel: 'Read this page in English',
    // Mode match
    mTitle: 'Mode match', mRemember: 'Retenir mes cases sur cet appareil', mQuit: 'Quitter le mode match',
    mCase: 'Case', mPrev: 'précédent', mNext: 'suivant', mNoImg: "Pas encore d'image pour cette line up",
    mNoImgPublic: "Images de visée : voir la vidéo de l'auteur", mPos: 'POSITION', mAim: 'Repère de visée',
  },
  en: {
    home: 'Home',
    tagline: 'Valorant line ups by map and agent',
    lead: 'Pick a map, then your agent, and find every line up: where to stand, what to aim at, where it lands.',
    homeDesc: (n) => `${n} Valorant line ups sorted by map and agent: starting position, aim and landing spot.`,
    pool: 'Current competitive map pool',
    poolLead: (n) => `The ${n} maps currently played in competitive. Updated whenever the map pool changes.`,
    other: 'Out of the map pool',
    otherLead: 'Maps that are not in competitive right now.',
    chooseAgent: 'Pick your agent',
    noMapLineup: 'No line ups for this map yet.',
    mapTitle: (m) => `${m} line ups`,
    mapDesc: (c, m) => `${c} on ${m} (Valorant), sorted by agent.`,
    mapSoon: (m) => `${m} line ups are coming soon.`,
    agentTitle: (a, m) => `${a} on ${m} – line ups`,
    agentDesc: (c, a, m) => `${c} for ${a} on ${m} (Valorant): starting position, aim and landing spot.`,
    matchBtn: 'Match mode',
    matchHint: 'Screen split into 4 panels, for a second screen',
    all: 'All',
    side: 'Side', site: 'Site', ability: 'Ability',
    noFilter: 'No line ups match these filters.',
    alsoFor: 'Also works for',
    video: 'Watch the video',
    videoOn: (h) => `Watch the video (${h})`,
    share: 'Share',
    copied: 'Link copied ✔',
    noImg: 'The aiming pictures are in the author’s video: tap “Watch the video”.',
    backAll: (a, m) => `← All ${a} line ups on ${m}`,
    lineupTitle: (t, a, m) => `${t} – ${a} on ${m}`,
    lineupDesc: (a, m, s, site, t) => `${a} line up on ${m} (${s}${site ? `, site ${site}` : ''}): ${t}.`,
    on: 'on',
    soon: 'Coming soon', one: '1 line up', many: (n) => `${n} line ups`,
    mmFrom: 'Minimap: dot = start, target = landing spot',
    mmRev: 'Minimap: dot = start, icon = where the reveal lands',
    mmMolly: 'Minimap: dot = start, fire = where the molly lands',
    mmMarks: (list, agent, hasFrom) => `Minimap: ${list}${hasFrom ? ` · dot = ${agent}'s position` : ''}`,
    origin: 'Original video',
    about: 'About, credits and privacy',
    footFree: 'No cookies, no ads.',
    footFr: '',
    switchTo: 'Français',
    switchLabel: 'Lire cette page en français',
    mTitle: 'Match mode', mRemember: 'Remember my panels on this device', mQuit: 'Leave match mode',
    mCase: 'Panel', mPrev: 'previous', mNext: 'next', mNoImg: 'No picture for this line up yet',
    mNoImgPublic: "Aiming pictures: see the author's video", mPos: 'POSITION', mAim: 'Aim reference',
  },
};
export const ui = (lang) => UI[lang] ?? UI.fr;

// Valeurs des données (restent en français dans les fichiers, traduites à l'affichage).
const SIDES = { Attaque: 'Attack', 'Défense': 'Defense', 'Attaque et défense': 'Attack and defense', 'À classer': 'Unsorted' };
export const sideL = (lang, s) => (lang === 'en' ? SIDES[s] ?? s : s);
export const siteL = (lang, s) => (lang === 'en' ? String(s ?? '').replace(/\bet\b/g, 'and') : s);
const ABIL = { fil: 'Tripwire', tourelle: 'Turret', barriere: 'Barrier', mur: 'Wall', ronces: 'Razorvine', intercepteur: 'Interceptor', orb: 'Orb', cam: 'Camera' };
export const abilityL = (lang, a) => (lang === 'en' ? ABIL[a.key] ?? a.label : a.label);

// Textes des line ups : titres, indications (notes), légendes des photos (caps).
export const tx = (lang, kind, s) => (lang === 'en' && s ? en[kind]?.[s] ?? s : s);
export const countL = (lang, n) => { const u = ui(lang); return n === 0 ? u.soon : n === 1 ? u.one : u.many(n); };
