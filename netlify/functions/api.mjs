// API du site Line Up : /api/auth, /api/lineups, /api/img
// Données stockées dans Netlify Blobs (persistant, pas besoin de base de données).
import { getStore } from "@netlify/blobs";
import { scryptSync, randomBytes, timingSafeEqual, randomUUID } from "node:crypto";

export const config = { path: "/api/*" };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_IMG = 4 * 1024 * 1024; // 4 Mo

async function isAdmin(req) {
  const pw = req.headers.get("x-admin") || "";
  if (pw.length < 8) return false;
  const cfg = await getStore("config").get("admin", { type: "json" });
  if (!cfg) return false;
  const h = scryptSync(pw, Buffer.from(cfg.salt, "hex"), 32);
  const ref = Buffer.from(cfg.hash, "hex");
  return h.length === ref.length && timingSafeEqual(h, ref);
}

export default async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const lineups = getStore("lineups");

  try {
    // --- Connexion admin (crée le mot de passe à la première utilisation) ---
    if (route === "auth" && req.method === "POST") {
      const pw = req.headers.get("x-admin") || "";
      if (pw.length < 8) return json({ error: "8 caractères minimum" }, 400);
      const cfgStore = getStore("config");
      const cfg = await cfgStore.get("admin", { type: "json" });
      if (!cfg) {
        const salt = randomBytes(16);
        const hash = scryptSync(pw, salt, 32);
        await cfgStore.setJSON("admin", { salt: salt.toString("hex"), hash: hash.toString("hex") });
        return json({ ok: true, created: true });
      }
      return (await isAdmin(req)) ? json({ ok: true }) : json({ error: "refusé" }, 401);
    }

    // --- Lecture publique des line ups ---
    if (route === "lineups" && req.method === "GET") {
      const { blobs } = await lineups.list();
      const items = (await Promise.all(blobs.map((b) => lineups.get(b.key, { type: "json" })))).filter(Boolean);
      items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      return json({ items });
    }

    // --- Lecture publique d'une image ---
    if (route === "img" && req.method === "GET") {
      const id = url.searchParams.get("id") || "";
      if (!ID_RE.test(id)) return json({ error: "id invalide" }, 400);
      const data = await getStore("imgs").get(id, { type: "arrayBuffer" });
      if (!data) return json({ error: "introuvable" }, 404);
      return new Response(data, {
        headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
      });
    }

    // --- Tout le reste demande le mot de passe admin ---
    if (!(await isAdmin(req))) return json({ error: "refusé" }, 401);

    if (route === "lineups" && req.method === "POST") {
      const rec = await req.json();
      if (!rec || !ID_RE.test(String(rec.id || ""))) return json({ error: "id invalide" }, 400);
      if (!rec.map || !rec.agent || !rec.title) return json({ error: "champs obligatoires manquants" }, 400);
      const old = await lineups.get(rec.id, { type: "json" });
      rec.ts = (old && old.ts) || Date.now();
      await lineups.setJSON(rec.id, rec);
      return json({ ok: true, id: rec.id });
    }

    if (route === "lineups" && req.method === "DELETE") {
      const id = url.searchParams.get("id") || "";
      if (!ID_RE.test(id)) return json({ error: "id invalide" }, 400);
      await lineups.delete(id);
      return json({ ok: true });
    }

    if (route === "img" && req.method === "POST") {
      const buf = await req.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > MAX_IMG) return json({ error: "image trop lourde ou vide" }, 400);
      const id = randomUUID();
      await getStore("imgs").set(id, buf);
      return json({ url: "/api/img?id=" + id });
    }

    return json({ error: "route inconnue" }, 404);
  } catch (e) {
    console.error("api error", e);
    return json({ error: "erreur serveur" }, 500);
  }
};
