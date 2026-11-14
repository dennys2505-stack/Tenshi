# Les astuces de Tenshi — site

Site statique (Astro) : une page par map, par agent et par line up.

## Structure
- `src/data/lineups/*.json` : une line up par fichier (map, agent, côté, site, titre, images, points départ/arrivée `from`/`to` en proportions 0–1 de la mini map, vidéo, crédit).
- `src/data/maps.json` / `agents.json` : maps (ordre d'affichage, fond, mini map) et agents (fond).
- `public/img/` : toutes les images (fonds, mini maps, captures de line ups).
- `src/pages`, `src/components`, `src/layouts`, `src/styles` : pages et design.

## Ajouter une line up
Déposer un fichier JSON dans `src/data/lineups/` et ses images dans `public/img/lineups/`. Le site se reconstruit tout seul à chaque envoi sur GitHub.

## Numéros de line ups
Chaque line up a un numéro (`num`). Il n'apparaît que si on ouvre une page avec `?num=1` (par exemple `/?num=1`) ; `?num=0` le cache. Pour la suivante : prendre le plus grand numéro + 1.

## Commandes
- `npm install` puis `npm run dev` (aperçu local) ou `npm run build` (génère `dist/`).

## Hébergement
Vercel, avec « Root Directory » = `site`. Variable facultative `SITE_URL` (adresse définitive du site) pour les liens canoniques.
