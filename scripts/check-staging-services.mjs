import assert from "node:assert/strict";
import { createRequire } from "node:module";

const PROJECT = "souqna-staging";
const REGION = "us-central1";
const NAMES = Object.freeze(["souqnaFinance", "souqnaMarketplace", "souqnaModeration"]);

async function main() {
  assert.equal(process.argv.length, 2, "This read-only check accepts no project arguments.");
  if (process.env.FIREBASE_EMULATOR_HUB || process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Uninstall emulator environment variables before checking real staging.");
  }

  const require = createRequire(new URL("../functions/index.js", import.meta.url));
  const { applicationDefault } = require("firebase-admin/app");
  let token;
  try {
    const auth = await applicationDefault().getAccessToken();
    token = auth.access_token;
    assert.ok(token, "Google Cloud did not return an OAuth token.");
  } catch {
    throw new Error("Google Cloud Application Default Credentials are missing. Run gcloud.cmd auth application-default login on your computer.");
  }

  const failed = [];
  for (const name of NAMES) {
    const resource = "projects/" + PROJECT + "/locations/" + REGION + "/functions/" + name;
    const url = "https://cloudfunctions.googleapis.com/v2/" + resource;
    let response;
    try {
      response = await fetch(url, {
        headers: { Authorization: "Bearer " + token, Accept: "application/json", "x-goog-user-project": PROJECT },
        signal: AbortSignal.timeout(20000)
      });
    } catch {
      failed.push(name + ": network connection failed");
      continue;
    }
    if (!response.ok) {
      failed.push(name + ": HTTP " + response.status + " (not confirmed deployed or insufficient read permission)");
      continue;
    }
    let body;
    try { body = await response.json(); }
    catch {
      failed.push(name + ": invalid Cloud Functions response");
      continue;
    }
    if (body.name !== resource || body.state !== "ACTIVE") {
      failed.push(name + ": Cloud Function is not ACTIVE");
      continue;
    }
    console.log("READY " + name + " in " + PROJECT + "/" + REGION);
  }
  token = undefined;

  if (failed.length) {
    for (const line of failed) console.error("NOT READY " + line);
    throw new Error("SOUQNA Staging backend is not verified. Nothing was deployed or changed.");
  }
  console.log("SOUQNA STAGING SERVICES VERIFIED: 3/3. Read-only check; no deployment.");
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
