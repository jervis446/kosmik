/**
 * Lays out app/dist for GitHub Pages at kosmik.asanoha.co.in (set up like wearday.asanoha.co.in):
 *   index.html  the landing page
 *   404.html    the app (GitHub Pages serves it for /chat, /account, ... so the app's own router runs)
 *   CNAME       the custom domain
 *   .nojekyll   so GitHub serves the _expo folder (Jekyll skips folders starting with "_")
 * The API stays on the Cloudflare Worker; build with EXPO_PUBLIC_API_URL set to its address.
 *
 * Usage: EXPO_PUBLIC_API_URL=https://kosmik.prime-adarsh108.workers.dev npm run build:pages
 */
import { cpSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

const DOMAIN = 'kosmik.asanoha.co.in';
const dist = new URL('../dist/', import.meta.url);
const out = new URL('../pages/', import.meta.url);

if (!process.env.EXPO_PUBLIC_API_URL) throw new Error('Set EXPO_PUBLIC_API_URL to the Worker address before building for Pages.');
if (!existsSync(new URL('landing.html', dist))) throw new Error('Run the web export first (npm run build:web).');
const bundle = readFileSync(new URL('index.html', dist), 'utf8');
if (bundle.includes('127.0.0.1') && !process.env.ALLOW_LOCAL_TEST) throw new Error('This build points at a local server; build with production settings.');

rmSync(out, { recursive: true, force: true });
cpSync(dist, out, { recursive: true });
renameSync(new URL('index.html', out), new URL('404.html', out));
renameSync(new URL('landing.html', out), new URL('index.html', out));
// PostHog for the static pages: the same public project key and host as the app build.
const phKey = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
if (phKey) {
  if (!/^phc_[A-Za-z0-9]+$/.test(phKey)) throw new Error('EXPO_PUBLIC_POSTHOG_KEY should look like phc_…');
  const phHost = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
  if (!/^https:\/\/(us|eu)\.i\.posthog\.com$/.test(phHost)) throw new Error('EXPO_PUBLIC_POSTHOG_HOST should be https://us.i.posthog.com or https://eu.i.posthog.com');
  const phFile = new URL('ph.js', out);
  const src = readFileSync(phFile, 'utf8');
  if (!src.includes("var KEY = '';")) throw new Error('public/ph.js changed: update build-pages.mjs');
  writeFileSync(phFile, src.replace("var KEY = '';", `var KEY = '${phKey}';`).replace("var HOST = 'https://us.i.posthog.com';", `var HOST = '${phHost}';`));
}
writeFileSync(new URL('CNAME', out), `${DOMAIN}\n`);
writeFileSync(new URL('.nojekyll', out), '');
console.log(`GitHub Pages site ready in app/pages for ${DOMAIN}`);
