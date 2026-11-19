import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const STAGING_PROJECT = "souqna-staging";
export const STAGING_URLS = Object.freeze([
  "https://souqna-staging.web.app/",
  "https://souqna-staging.firebaseapp.com/"
]);

export function inspectPublishedHtml(html) {
  if (typeof html !== "string" || html.length < 100) return "NO_APPLICATION_HTML";
  if (!html.includes('id="souqna-environment-banner"')) return "SOUQNA_STAGING_BANNER_MISSING";
  if (!html.includes("بيئة اختبار سوقنا")) return "SOUQNA_STAGING_LABEL_MISSING";
  const match = html.match(/const app=initializeApp\((\{[^\n;]*\})\);/);
  if (!match) return "FIREBASE_APPLICATION_CONFIG_MISSING";
  let config;
  try { config = JSON.parse(match[1]); } catch { return "FIREBASE_APPLICATION_CONFIG_INVALID"; }
  if (config.projectId !== STAGING_PROJECT ||
    config.authDomain !== STAGING_PROJECT + ".firebaseapp.com") {
    return "WRONG_FIREBASE_PROJECT";
  }
  if (!html.includes('name="robots" content="noindex,nofollow,noarchive"')) {
    return "STAGING_NOINDEX_MISSING";
  }
  if (!html.includes('href="assets/souqna-guide.css"') ||
      !html.includes('from"./assets/souqna-guide.js"')) return "GUIDE_NOT_DEPLOYED";
  if (!html.includes("acceptedTermsVersion:GUIDE_VERSION") ||
      !html.includes("acceptedPrivacyVersion:GUIDE_VERSION") ||
      !html.includes("acceptedAt:serverTimestamp()")) return "CONSENT_FLOW_NOT_DEPLOYED";
  return "READY";
}

export async function checkHosting(fetcher = fetch) {
  const results = [];
  for (const url of STAGING_URLS) {
    try {
      const response = await fetcher(url, { redirect:"follow", signal:AbortSignal.timeout(15000) });
      if (!response.ok) {
        results.push({ url, status:"HTTP_" + response.status });
        continue;
      }
      const text = await response.text();
      results.push({ url, status:inspectPublishedHtml(text) });
    } catch {
      results.push({ url, status:"UNREACHABLE" });
    }
  }
  return results;
}

async function main() {
  assert.equal(process.argv.length,2,"This check accepts no deployment target arguments.");
  const results = await checkHosting();
  for (const item of results) console.log(item.status + " " + item.url);
  if (results.every(item=>item.status==="READY")) {
    console.log("SOUQNA STAGING HOSTING VERIFIED. Read-only; no deployment.");
  } else {
    console.error("SOUQNA Staging Hosting is not verified on both default domains.");
    process.exitCode=2;
  }
}

if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error=>{ console.error("HOSTING CHECK FAILED: "+error.message); process.exitCode=1; });
}
