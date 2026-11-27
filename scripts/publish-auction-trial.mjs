import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { fetchStagingRules } from "./check-staging-legal.mjs";
import { backupStagingRules } from "./backup-staging-rules.mjs";
import { fetchStagingWebConfig, STAGING_PROJECT } from "./auto-staging-setup.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const channel = "auctions-trial";
const clean = text => text.replace(/\r\n/g, "\n").trim();

export function compareRules(remote, local) {
  const current = clean(remote);
  const next = clean(local);
  if (current === next) return "installed";
  const first = next.indexOf("    function auctionOffice()");
  const last = next.indexOf("    // Survey data", first);
  assert.ok(first > 0 && last > first, "Auction rules section is missing.");
  assert.equal(current === clean(next.slice(0, first) + next.slice(last)), true,
    "Live staging rules differ from the reviewed base. Backup saved. Review the differences before publishing.");
  return "add-auctions";
}

export function previewLink(result) {
  const site = result[STAGING_PROJECT];
  assert.ok(site?.url, "Firebase did not return a preview URL for souqna-staging.");
  const url = new URL(site.url);
  assert.ok(url.protocol === "https:" && !url.port && !url.username && !url.password &&
    /^souqna-staging--auctions-trial-[a-z0-9-]+\.web\.app$/.test(url.hostname),
    "Unexpected Hosting channel URL.");
  return new URL("/assets/auctions/index.html", url).href;
}

function node(script, args, capture = false) {
  const result = spawnSync(process.execPath, [join(root, script), ...args], {
    cwd: root, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture && result.stdout) console.error(result.stdout);
    throw new Error("Command failed: " + args[0] + ". Check the Firebase message above.");
  }
  return result.stdout;
}

async function main() {
  assert.equal(process.argv.length, 2);
  for (const key of ["FIRESTORE_EMULATOR_HOST","FIREBASE_AUTH_EMULATOR_HOST","FIREBASE_EMULATOR_HUB","SOUQNA_HOSTING_OUT"]) {
    assert.ok(!process.env[key], "Unset " + key + " before publishing.");
  }
  // Use the local login of the project's pinned Firebase CLI for read-only
  // Management API calls. Deployment uses this same CLI login in subprocesses.
  const require = createRequire(import.meta.url);
  const { getGlobalDefaultAccount, getAccessToken } = require("firebase-tools/lib/auth");
  const { setScopes, getScopes } = require("firebase-tools/lib/api");
  const { CLOUD_PLATFORM } = require("firebase-tools/lib/scopes");
  const account = getGlobalDefaultAccount();
  assert.ok(account?.tokens?.refresh_token, "Sign in with firebase login on this computer first.");
  setScopes([CLOUD_PLATFORM]);
  const token = async () => (await getAccessToken(account.tokens.refresh_token, getScopes())).access_token;
  const config = await fetchStagingWebConfig(async url => {
    const response = await fetch(url, {headers: {Authorization: "Bearer " + await token()}, signal: AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error("Staging Web App lookup returned HTTP " + response.status);
    return response.json();
  });
  const remote = await fetchStagingRules(fetch, await token());
  const backup = backupStagingRules(remote);
  console.log("Staging rules backup:", backup);
  const local = readFileSync(join(root, "firestore.rules"), "utf8");
  const state = compareRules(remote, local);
  writeFileSync(join(root, "firebase.staging.json"), JSON.stringify(config), {mode: 0o600});
  node("scripts/build-hosting.mjs", ["staging","firebase.staging.json"]);
  node("scripts/preflight-staging.mjs", [STAGING_PROJECT]);
  const expected = readFileSync(join(root,"dist/assets/auctions/index.html"),"utf8");
  assert.ok(expected.includes("souqnaAuctionTest") && expected.includes('"projectId":"souqna-staging"'));
  const cli = (args, capture) => node("node_modules/firebase-tools/lib/bin/firebase.js",
    [...args,"--project",STAGING_PROJECT,"--account",account.user.email,"--non-interactive"], capture);
  cli(["deploy","--only","functions:souqnaAuctionTest,functions:souqnaAuctionTestClose"]);
  if (state === "add-auctions") {
    const latest = await fetchStagingRules(fetch, await token());
    if (compareRules(latest, local) === "add-auctions") cli(["deploy","--only","firestore:rules"]);
  }
  assert.equal(compareRules(await fetchStagingRules(fetch, await token()), local), "installed");
  const result = JSON.parse(cli(["hosting:channel:deploy", channel,"--expires","7d","--json"],true));
  const url = previewLink(result.result);
  const response = await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(30000)});
  assert.ok(response.ok && clean(await response.text()) === clean(expected), "Could not verify the published auction page.");
  const path = join(root, "artifacts", "AUCTIONS-URL.txt");
  mkdirSync(join(root, "artifacts"), {recursive:true});
  writeFileSync(path, url + "\n");
  console.log("\nSOUQNA Auctions:", url, "\nSaved:", path);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {console.error(error.message); process.exitCode = 1;});
}
