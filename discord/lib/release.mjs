// Release GitHub « verticaux » : dépôt des montages verticaux (MES vidéos uniquement) pour la publication sur les réseaux.
// Lien stable : https://github.com/<dépôt>/releases/download/verticaux/<nom>.mp4
import fs from 'node:fs';
const REPO = process.env.GITHUB_REPOSITORY || 'dennys2505-stack/Tenshi';
const TAG = 'verticaux';
const H = () => ({ Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });

async function release() {
  let r = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${TAG}`, { headers: H() });
  if (r.status === 404) {
    r = await fetch(`https://api.github.com/repos/${REPO}/releases`, { method: 'POST', headers: H(), body: JSON.stringify({ tag_name: TAG, target_commitish: 'main', name: 'Montages verticaux (Shorts / TikTok / Reels)', body: 'Montages verticaux de Tenshinigo, en attente de publication. Fichiers supprimés une fois publiés.', make_latest: 'false' }) });
  }
  if (!r.ok) throw new Error(`release ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

export const releaseUrl = (name) => `https://github.com/${REPO}/releases/download/${TAG}/${name}`;

// Dépose (ou remplace) un fichier dans la release.
export async function uploadVertical(file, name) {
  const rel = await release();
  const old = (rel.assets || []).find((a) => a.name === name);
  if (old) await fetch(`https://api.github.com/repos/${REPO}/releases/assets/${old.id}`, { method: 'DELETE', headers: H() });
  const r = await fetch(`https://uploads.github.com/repos/${REPO}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { ...H(), 'Content-Type': 'video/mp4' }, body: fs.readFileSync(file) });
  if (!r.ok) throw new Error(`upload ${r.status} ${(await r.text()).slice(0, 200)}`);
  return releaseUrl(name);
}

// Supprime un fichier de la release (vidéo publiée).
export async function deleteVertical(name) {
  const rel = await release();
  const a = (rel.assets || []).find((x) => x.name === name);
  if (!a) return 'absent';
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/assets/${a.id}`, { method: 'DELETE', headers: H() });
  return r.status === 204 ? 'supprimé' : `erreur ${r.status}`;
}

// Liste les fichiers présents.
export async function listVerticals() { return ((await release()).assets || []).map((a) => ({ name: a.name, size: a.size, url: releaseUrl(a.name) })); }
