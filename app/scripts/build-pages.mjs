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
writeFileSync(new URL('CNAME', out), `${DOMAIN}\n`);
writeFileSync(new URL('.nojekyll', out), '');
console.log(`GitHub Pages site ready in app/pages for ${DOMAIN}`);
