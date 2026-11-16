import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "dist");
const publicFiles = Object.freeze([
  "index.html",
  "assets/responsive.css",
  "assets/admin-metrics.js",
  "sw.js",
  "manifest.webmanifest",
  "logo.png",
  "icon-192.png",
  "icon-512.png"
]);

const manifest = JSON.parse(readFileSync(join(root, "manifest.webmanifest"), "utf8"));
assert.equal(manifest.start_url, "./");
for (const icon of manifest.icons || []) {
  assert.ok(publicFiles.includes(icon.src), "Unbundled PWA icon: " + icon.src);
}
const serviceWorker = readFileSync(join(root, "sw.js"), "utf8");
const precache = serviceWorker.match(/,F=(\[[^;]+\]);/)?.[1];
assert.ok(precache, "PWA precache list is missing");
for(const url of JSON.parse(precache)){
  assert.ok(url === "./" || publicFiles.includes(url), "Unbundled PWA asset: " + url);
}
const html = readFileSync(join(root, "index.html"), "utf8");
assert.match(html, /href="assets\/responsive\.css"/);
assert.match(html, /httpsCallable\(functions,"souqnaFinance"\)/);
assert.ok(!html.includes("connectFunctionsEmulator(functions"), "Production HTML must not point at local emulators");

rmSync(target, { recursive: true, force: true });
for (const filename of publicFiles) {
  const source = join(root, filename);
  assert.ok(existsSync(source), "Public asset missing: " + filename);
  const destination = join(target, filename);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
}
const topLevel = readdirSync(target).sort();
assert.deepEqual(topLevel, ["assets","icon-192.png","icon-512.png","index.html","logo.png","manifest.webmanifest","sw.js"].sort());
for (const prohibited of ["firestore.rules", "functions", "tests", "docs", "package.json", ".git"]) {
  assert.ok(!existsSync(join(target, prohibited)), "Private project artifact leaked into hosting: " + prohibited);
}
console.log("SOUQNA hosting package created: " + target);
console.log("Published files: " + publicFiles.join(", "));
console.log("No deployment has been performed.");
