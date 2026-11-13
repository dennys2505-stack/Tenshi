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
const ytDlpWrap = new YTDlpWrap();

const TARGET_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const NETLIFY_WEBHOOK_URL = process.env.NETLIFY_WEBHOOK_URL; // Ex: https://ton-site.netlify.app/.netlify/functions/lineups

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
        "startSpot": "Description précise d'où le joueur se place",
        "endSpot": "Zone d'arrivée sur la map",
        "description": "
