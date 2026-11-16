import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

console.log("SOUQNA source checks passed (syntax and feature markers).");
console.log("Important: these checks do not test Firebase security rules or live user flows.");
