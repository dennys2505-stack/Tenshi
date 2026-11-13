import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual, randomBytes } from "node:crypto";

const sha = (p, s) => createHash("sha256").update(s + ":" + p).digest();
const IMG = /^\/api\/img\/[a-f0-9]{24}$/;
const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function handle(req, cfg, data, imgs) {
  const path = new URL(req.url).pathname, m = req.method;
  const j = (o, st = 200) => new Response(JSON.stringify(o), { status: st, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  const isAdmin = async () => {
    const pw = req.headers.get("x-admin") || "", c = await cfg.get("auth", { type: "json" });
    if (!c || !pw) return false;
    const a = sha(pw, c.salt), b = Buffer.from(c.hash, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  };
  if (path === "/api/lineups" && m === "GET") return j({ items: (await data.get("all", { type: "json" })) || [] });
  if (path === "/api/auth" && m === "POST") {
    const pw = req.headers.get("x-admin") || "", c = await cfg.get("auth", { type: "json" });
    if (!c) {
      if (pw.length < 8) return j({ error: "short" }, 400);
      const salt = randomBytes(16).toString("hex");
      await cfg.setJSON("auth", { salt, hash: sha(pw, salt).toString("hex") });
      return j({ ok: true, first: true });
    }
    return (await isAdmin()) ? j({ ok: true }) : j({ error: "no" }, 401);
  }
  if (path.startsWith("/api/img/") && m === "GET") {
    if (!IMG.test(path)) return new Response("", { status: 404 });
    const buf = await imgs.get(path.slice(9), { type: "arrayBuffer" });
    if (!buf) return new Response("", { status: 404 });
    return new Response(buf, { headers: { "content-type": "image/jpeg", "x-content-type-options": "nosniff", "cache-control": "public, max-age=31536000, immutable" } });
  }
  if (!(await isAdmin())) return j({ error: "no" }, 401);
  if (path === "/api/img" && m === "POST") {
    const buf = await req.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 4e6) return j({ error: "size" }, 413);
    const id = randomBytes(12).toString("hex");
    await imgs.set(id, buf);
    return j({ url: "/api/img/" + id });
  }
  if (path === "/api/lineups" && m === "POST") {
    let r; try { r = await req.json(); } catch { return j({ error: "bad" }, 400); }
    const rec = { id: str(r?.id, 40), map: str(r?.map, 40), agent: str(r?.agent, 40), side: r?.side === "Défense" ? "Défense" : "Attaque", site: ["A", "B", "C"].includes(r?.site) ? r.site : "A", title: str(r?.title, 140), video: str(r?.video, 300), credit: str(r?.credit, 140), minimap: str(r?.minimap, 60), images: (Array.isArray(r?.images) ? r.images : []).slice(0, 4).map(i => ({ src: str(i?.src, 60), cap: str(i?.cap, 80) })) };
    if (!/^[\w-]+$/.test(rec.id) || !rec.map || !rec.agent || !rec.title) return j({ error: "bad" }, 400);
    if (rec.video && !/^https?:\/\//i.test(rec.video)) return j({ error: "video" }, 400);
    if ((rec.minimap && !IMG.test(rec.minimap)) || rec.images.some(i => !IMG.test(i.src))) return j({ error: "img" }, 400);
    const items = (await data.get("all", { type: "json" })) || [], i = items.findIndex(x => x.id === rec.id);
    if (i < 0) items.push(rec); else items[i] = rec;
    await data.setJSON("all", items);
    return j({ ok: true });
  }
  if (path === "/api/lineups" && m === "DELETE") {
    const id = new URL(req.url).searchParams.get("id") || "";
    const items = ((await data.get("all", { type: "json" })) || []).filter(x => x.id !== id);
    await data.setJSON("all", items);
    return j({ ok: true });
  }
  return j({ error: "nf" }, 404);
}

export default async (req) => handle(req, getStore("config"), getStore("lineups"), getStore("images"));
export const config = { path: ["/api/lineups", "/api/auth", "/api/img", "/api/img/*"] };
