import { Client, GatewayIntentBits } from 'discord.js';
import { GoogleGenAI } from '@google/genai';
import YTDlpWrap from 'yt-dlp-wrap';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// Compatibilité ESM : yt-dlp-wrap exporte la classe dans .default
const YTDlpClass = YTDlpWrap.default ?? YTDlpWrap;
const YTDLP_PATH = path.resolve('./yt-dlp');
if (!fs.existsSync(YTDLP_PATH)) {
  console.log('Téléchargement du binaire yt-dlp...');
  await YTDlpClass.downloadFromGithub(YTDLP_PATH);
  fs.chmodSync(YTDLP_PATH, 0o755);
}
const ytDlpWrap = new YTDlpClass(YTDLP_PATH);

const TARGET_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const NETLIFY_WEBHOOK_URL = process.env.NETLIFY_WEBHOOK_URL; // Ex: https://ton-site.netlify.app/api/lineups

client.once('ready', () => {
  console.log(`✅ Bot Discord connecté : ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || message.channel.id !== TARGET_CHANNEL_ID) return;

  // Détecte un lien Instagram, TikTok, X ou autre dans le message
  const urlMatch = message.content.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) return;

  const videoUrl = urlMatch[0];
  await message.react('⏳');

  const outputFilePath = path.resolve(`./temp_${Date.now()}.mp4`);

  try {
    // 1. Téléchargement de la vidéo via yt-dlp
    console.log(`Téléchargement de la vidéo : ${videoUrl}`);
    await ytDlpWrap.exec([videoUrl, '-o', outputFilePath]);

    // 2. Lecture du fichier pour l'envoyer à Gemini
    const videoBuffer = fs.readFileSync(outputFilePath);
    const base64Data = videoBuffer.toString('base64');

    const videoPart = {
      inlineData: {
        data: base64Data,
        mimeType: 'video/mp4'
      }
    };

    // 3. Demande d'analyse à Gemini 2.5 Flash
    const prompt = `
      Analyse cette vidéo de lineup Valorant provenant d'un réseau social.
      Réponds UNIQUEMENT avec un objet JSON valide (pas de markdown, pas de \`\`\`json) avec ces champs :
      {
        "agent": "Nom de l'agent (ex: Sova, Viper, Omen...)",
        "map": "Nom de la map (ex: Ascent, Bind, Haven, Lotus...)",
        "side": "Attaque ou Défense",
        "site": "A, B ou C (le site concerné)",
        "title": "Titre court de la line up (ex: Post-plant B depuis Windows)",
        "startSpot": "Description précise d'où le joueur se place",
        "endSpot": "Zone d'arrivée sur la map",
        "description": "Explication courte de ce qu'il faut viser et de la posture (accroupi, saut...)"
      }
    `;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [videoPart, { text: prompt }] }]
    });

    const raw = (result.text || '').replace(/```json|```/g, '').trim();
    const data = JSON.parse(raw);

    // 4. Envoi vers le site (API protégée par le mot de passe admin)
    const lineup = {
      id: 'l' + Date.now(),
      map: data.map,
      agent: data.agent,
      side: data.side || 'Attaque',
      site: data.site || '',
      title: data.title || `${data.startSpot} → ${data.endSpot}`,
      video: videoUrl,
      credit: 'Bot Discord',
      description: [data.startSpot, data.endSpot, data.description].filter(Boolean).join(' — '),
      images: [],
      minimap: ''
    };

    const res = await fetch(NETLIFY_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-admin': process.env.ADMIN_PASSWORD || ''
      },
      body: JSON.stringify(lineup)
    });
    if (!res.ok) throw new Error(`Site: réponse ${res.status}`);

    await message.reactions.removeAll().catch(() => {});
    await message.react('✅');
  } catch (err) {
    console.error('Erreur traitement lineup :', err);
    await message.reactions.removeAll().catch(() => {});
    await message.react('❌');
  } finally {
    fs.rm(outputFilePath, { force: true }, () => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
