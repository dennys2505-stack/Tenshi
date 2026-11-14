// Petit client pour l'API REST de Discord (sans connexion permanente).
// Le token vient uniquement de la variable d'environnement DISCORD_TOKEN (secret GitHub).
const API = process.env.DISCORD_API || 'https://discord.com/api/v10';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Nettoie les erreurs de copier-coller courantes : espaces, retours à la ligne, guillemets, préfixes « Bot » / « DISCORD_TOKEN= ».
export function cleanToken(raw = process.env.DISCORD_TOKEN || '') {
  return raw.trim().replace(/^DISCORD_TOKEN\s*=\s*/i, '').replace(/^["']|["']$/g, '').replace(/^Bot\s+/i, '').trim();
}

// Décrit la forme du token sans jamais l'afficher.
export function describeToken(raw = process.env.DISCORD_TOKEN || '') {
  const t = cleanToken(raw);
  return {
    defini: raw.length > 0,
    longueur: t.length,
    morceaux: t.split('.').length, // un vrai token de bot en a 3
    espacesOuGuillemetsRetires: t !== raw,
    ressembleAUneCleHexa64: /^[0-9a-f]{64}$/i.test(t), // = « Client Secret » ou « Public Key », pas un token de bot
  };
}

export async function discord(path, { method = 'GET', body, tries = 6 } = {}) {
  const token = cleanToken();
  if (!token) throw new Error('DISCORD_TOKEN absent (secret GitHub non défini)');
  for (let i = 0; i < tries; i++) {
    const r = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        'content-type': 'application/json',
        'user-agent': 'DiscordBot (https://github.com/dennys2505-stack/Tenshi, 1.0)',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (r.status === 429) {
      if (typeof data === 'string') throw new Error('429 non JSON : Discord/Cloudflare bloque cette adresse IP');
      const wait = Math.ceil((data.retry_after ?? 1) * 1000) + 250;
      if (wait > 90_000) throw new Error(`429 : attente demandée trop longue (${Math.round(wait / 1000)} s)`);
      await sleep(wait);
      continue;
    }
    return { status: r.status, data };
  }
  throw new Error('Trop de tentatives (429 répétés)');
}
