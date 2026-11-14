import { defineConfig } from 'astro/config';

// Quand le nom de domaine définitif existe, renseigner SITE_URL (ex. https://astucesdetenshi.com)
// dans les variables d'environnement Vercel : il sert aux liens canoniques et aux aperçus de partage.
export default defineConfig({
  site: process.env.SITE_URL || undefined,
  trailingSlash: 'always',
  build: { format: 'directory' },
});
