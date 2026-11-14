// Point d'entrée : lit discord/job.json, exécute la tâche demandée et écrit out/run.log + out/report.md.
// Aucun secret n'est jamais écrit dans ces fichiers (ils sont publiés dans la branche bot-logs).
import fs from 'fs';

const job = JSON.parse(fs.readFileSync(new URL('./job.json', import.meta.url), 'utf8'));
fs.mkdirSync('out', { recursive: true });

const secrets = [process.env.DISCORD_TOKEN, process.env.GEMINI_API_KEY].filter((s) => s && s.length > 8);
const scrub = (s) => secrets.reduce((acc, sec) => acc.split(sec).join('***'), String(s));
const lines = [], report = [];
const log = (...a) => { const s = scrub(a.join(' ')); console.log(s); lines.push(s); };
const rep = (s = '') => report.push(scrub(s));

let ok = true;
try {
  const mod = await import(`./tasks/${job.task}.mjs`);
  await mod.default({ log, rep, job });
} catch (e) {
  ok = false;
  log('ERREUR :', e.message);
}
fs.writeFileSync('out/run.log', lines.join('\n') + '\n');
fs.writeFileSync('out/report.md', `# Tâche « ${job.task} » — ${new Date().toISOString()}\n\n${ok ? '' : '**Échec** : voir run.log\n\n'}${report.join('\n')}\n`);
process.exitCode = ok ? 0 : 1;
