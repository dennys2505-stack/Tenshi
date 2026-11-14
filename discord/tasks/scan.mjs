// Tâche « scan » : vérifie l'accès du bot à Discord et dresse la carte du serveur
// (catégories, salons, nombre de messages, types de messages). Ne publie JAMAIS le contenu des messages.
import { discord, sleep } from '../lib/discord.mjs';

const URL_RE = /https?:\/\/\S+/;

export default async function scan({ log, rep }) {
  const me = await discord('/users/@me');
  log(`Test du token : HTTP ${me.status}`);
  if (me.status !== 200) {
    rep('## Résultat\n\nLe token est refusé ou invalide (HTTP ' + me.status + ').');
    throw new Error('token refusé');
  }
  rep(`## Bot\n\nConnexion réussie : bot « ${me.data.username} ».\n`);

  const guilds = (await discord('/users/@me/guilds')).data;
  log(`Serveurs où le bot est présent : ${guilds.length}`);
  rep(`## Serveurs (${guilds.length})\n`);
  if (!Array.isArray(guilds) || guilds.length === 0) {
    rep('Le bot n\'est sur aucun serveur : il faut l\'inviter (OAuth2 → URL Generator).');
    return;
  }

  for (const g of guilds) {
    rep(`### ${g.name}\n`);
    const ch = await discord(`/guilds/${g.id}/channels`);
    if (ch.status !== 200) { rep(`Impossible de lister les salons (HTTP ${ch.status}).`); continue; }
    const cats = ch.data.filter((c) => c.type === 4).sort((a, b) => a.position - b.position);
    const texts = ch.data.filter((c) => c.type === 0 || c.type === 5);
    const forums = ch.data.filter((c) => c.type === 15);
    log(`Salons texte : ${texts.length}, catégories : ${cats.length}, forums : ${forums.length}`);

    const tot = { channels: 0, messages: 0, link: 0, image: 0, linkOnly: 0, linkImage: 0, embedThumb: 0, empty: 0, denied: 0 };
    const groups = [...cats.map((c) => ({ cat: c.name, id: c.id })), { cat: '(sans catégorie)', id: null }];
    for (const grp of groups) {
      const list = texts.filter((t) => (t.parent_id ?? null) === grp.id).sort((a, b) => a.position - b.position);
      if (!list.length) continue;
      rep(`**${grp.cat}**\n`);
      rep('| salon | messages | avec lien | avec image | lien seul | lien + image |');
      rep('|---|---|---|---|---|---|');
      for (const t of list) {
        tot.channels++;
        const s = { n: 0, link: 0, image: 0, linkOnly: 0, linkImage: 0, thumb: 0, empty: 0 };
        let before = null, pages = 0, denied = false;
        while (pages < 60) {
          const q = `/channels/${t.id}/messages?limit=100` + (before ? `&before=${before}` : '');
          const r = await discord(q);
          await sleep(220);
          if (r.status === 403) { denied = true; break; }
          if (r.status !== 200) { log(`#${t.name} : HTTP ${r.status}`); break; }
          if (!r.data.length) break;
          for (const m of r.data) {
            s.n++;
            const hasLink = URL_RE.test(m.content || '');
            const hasImg = (m.attachments || []).some((a) => (a.content_type || '').startsWith('image/'));
            if (hasLink) s.link++;
            if (hasImg) s.image++;
            if (hasLink && !hasImg) s.linkOnly++;
            if (hasLink && hasImg) s.linkImage++;
            if ((m.embeds || []).some((e) => e.thumbnail || e.video || e.image)) s.thumb++;
            if (!m.content && !(m.attachments || []).length && !(m.embeds || []).length) s.empty++;
          }
          before = r.data[r.data.length - 1].id;
          pages++;
          if (r.data.length < 100) break;
        }
        if (denied) { tot.denied++; rep(`| ${t.name} | accès refusé | | | | |`); continue; }
        rep(`| ${t.name} | ${s.n} | ${s.link} | ${s.image} | ${s.linkOnly} | ${s.linkImage} |`);
        tot.messages += s.n; tot.link += s.link; tot.image += s.image;
        tot.linkOnly += s.linkOnly; tot.linkImage += s.linkImage; tot.embedThumb += s.thumb; tot.empty += s.empty;
      }
      rep('');
    }
    rep('#### Totaux\n');
    rep(`- Salons lus : ${tot.channels} (accès refusé : ${tot.denied})`);
    rep(`- Messages : ${tot.messages}`);
    rep(`- Avec un lien : ${tot.link}, avec une image : ${tot.image}`);
    rep(`- Lien seul (sans image) : ${tot.linkOnly}, lien + image : ${tot.linkImage}`);
    rep(`- Messages avec aperçu (vignette/vidéo) intégré par Discord : ${tot.embedThumb}`);
    rep(`- Messages au contenu totalement vide : ${tot.empty}` + (tot.empty > tot.messages * 0.3 ? '  ⚠️ beaucoup : « Message Content Intent » probablement désactivé' : ''));
    log(`Totaux : ${tot.messages} messages dans ${tot.channels} salons ; lien seul ${tot.linkOnly}, lien+image ${tot.linkImage}, vides ${tot.empty}`);
  }
}
