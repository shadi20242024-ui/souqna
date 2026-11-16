import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "Firebase application module must exist");

// Syntax validation only: module CDN imports are removed before parsing.
new Function(script.replace(/^import.*$/gm, ""));

for (const [label, marker] of [
  ["Primary and secondary news ribbons", "function tkHtml(secondary=false)"],
  ["Secondary ticker admin toggle", 'id="s-tk2on"'],
  ["Local fuel-station directory", 'value="fuel"'],
  ["Image compression", "async function shrink(file)"],
  ["Image readiness before submission", "await photoReady;"],
  ["Image duplicate detection", "imgHash===photoHash"],
  ["Sponsor booking route", 'view=="sponsor"'],
  ["Manual payment approval", "هل تحققت بالفعل من استلام الدفع"],
  ["Atomic sponsor approval", "runTransaction(db"],
]) {
  assert.ok(html.includes(marker), label + " is missing");
}

// Verify desktop styling and that every pre-cached file actually exists.
const css = readFileSync(new URL("../assets/responsive.css",import.meta.url), "utf8");
assert.match(css, /@media\s*\(min-width:\s*1024px\)/);
assert.ok(html.includes('href="assets/responsive.css"'), "Desktop stylesheet must be linked");
assert.ok(html.includes('class="lgi mobile-logo"'), "Mobile logo artwork must exist");
assert.ok(css.includes(".top > img.mobile-logo"), "Responsive mobile logo style must exist");
const sw = readFileSync(new URL("../sw.js",import.meta.url), "utf8");
new Function(sw);
const assets = sw.match(/,F=(\[[^;]+\]);/)?.[1];
assert.ok(assets, "Precache manifest not found");
for(const filename of JSON.parse(assets)){
  if(filename==="./")continue;
  assert.ok(existsSync(new URL("../"+filename,import.meta.url)), "Missing PWA precache asset: "+filename);
}
for(const marker of ['"sub_"+id','"topup_"+id','"promo_"+id']){
  assert.ok(html.includes(marker), "Idempotent ledger key missing: "+marker);
}

console.log("SOUQNA source checks passed (syntax and feature markers).");
console.log("Important: these checks do not test Firebase security rules or live user flows.");
