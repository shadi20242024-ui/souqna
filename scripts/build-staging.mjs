import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configFile = process.argv[2];
if (!configFile) throw new Error('Usage: node scripts/build-staging.mjs PATH_TO_STAGING_WEB_CONFIG.json');
const config = JSON.parse(await readFile(resolve(configFile), 'utf8'));
for (const key of ['apiKey', 'authDomain', 'projectId', 'appId']) {
  if (typeof config[key] !== 'string' || !config[key].trim()) throw new Error('Missing Firebase field: ' + key);
}
if (!/^souqna-staging[a-z0-9-]*$/.test(config.projectId) || config.projectId.length > 30) throw new Error('Only souqna-staging project IDs are permitted');
if (config.authDomain !== config.projectId + '.firebaseapp.com') throw new Error('Auth domain must belong to the staging project');
if (config.storageBucket && ![config.projectId + '.appspot.com', config.projectId + '.firebasestorage.app'].includes(config.storageBucket)) throw new Error('Storage bucket must belong to staging');
const safeConfig = Object.fromEntries(['apiKey','authDomain','projectId','appId','storageBucket','messagingSenderId'].filter(k => k in config).map(k => [k,config[k]]));
let html = await readFile(resolve(root, 'index.html'), 'utf8');
const init = /const app=initializeApp\(\{[^\n]*?\}\);/g;
if ([...html.matchAll(init)].length !== 1) throw new Error('Expected exactly one Firebase initialization; review source before building');
html = html.replace(init, () => 'const app=initializeApp(' + JSON.stringify(safeConfig) + ');');
if (html.includes('souqna-sweida')) throw new Error('Production reference remains in staging output');
html = html.replace('</head>', '<meta name="robots" content="noindex,nofollow"></head>');
const out = resolve(root, 'staging-dist');
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'index.html'), html);
for (const name of ['logo.png','icon-192.png','icon-512.png','manifest.webmanifest','ui (2).jpg']) {
  await access(resolve(root, name));
  await copyFile(resolve(root, name), resolve(out, name));
}
await writeFile(resolve(out, 'sw.js'), "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())await caches.delete(k);await self.registration.unregister();})()));\n");
console.log('Staging build prepared for ' + safeConfig.projectId + '. No deployment performed.');
