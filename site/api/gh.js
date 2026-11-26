// Fonction Vercel : permet à la page /admin/ d'écrire sur GitHub avec un simple mot de passe.
// Variables à définir dans Vercel : ADMIN_PASSWORD (ton mot de passe) et GH_TOKEN (clé GitHub fine-grained, Contents : Read and write, dépôt Tenshi).
import crypto from 'node:crypto';

const REPO = 'dennys2505-stack/Tenshi';
const ALLOWED = /^\/contents\/site\/(src\/data\/|public\/img\/)[A-Za-z0-9_\-./]*(\?ref=main(&t=\d+)?)?$/;

const same = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (process.env.PUBLIC_SITE === '1') return res.status(404).json({ message: 'introuvable' }); // jamais d'écriture depuis le site public
  if (req.method !== 'POST') return res.status(405).json({ message: 'POST uniquement' });
  if (!process.env.ADMIN_PASSWORD || !process.env.GH_TOKEN) return res.status(501).json({ message: 'non configuré' });
  const { password, method = 'GET', path = '', body } = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  if (!same(password ?? '', process.env.ADMIN_PASSWORD)) {
    await new Promise((r) => setTimeout(r, 1200)); // freine les essais répétés
    return res.status(401).json({ message: 'Mot de passe incorrect' });
  }
  if (path === '' && method === 'GET') return res.status(200).json({ ok: true }); // simple test de connexion
  if (!['GET', 'PUT', 'DELETE'].includes(method) || !ALLOWED.test(path) || path.includes('..'))
    return res.status(400).json({ message: 'Chemin non autorisé' });
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'tenshi-admin' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  res.status(r.status).setHeader('Content-Type', 'application/json').send(text || '{}');
}
