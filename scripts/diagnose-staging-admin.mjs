import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PROJECT_ID = "souqna-staging";

export function diagnoseAdminProfile(authRecord, profile) {
  if (!authRecord) return { status: "AUTH_USER_MISSING", message: "No user found in staging Firebase Authentication." };
  if (authRecord.disabled) return { status: "AUTH_USER_DISABLED", message: "The staging Authentication user is disabled." };
  if (!profile) return { status: "FIRESTORE_PROFILE_MISSING", message: "Authentication user exists, but users/UID is missing in staging Firestore." };
  if (profile.role !== "admin") return { status: "ADMIN_ROLE_MISSING", message: "Authentication is valid, but the Firestore profile is not assigned the admin role." };
  return { status: "ADMIN_READY", message: "Staging Authentication and Firestore admin role are consistent." };
}

export async function inspectStagingAdmin({ email, authClient, firestoreClient }) {
  assert.ok(typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Provide a valid email through SOUQNA_ADMIN_EMAIL.");
  assert.ok(authClient && typeof authClient.getUserByEmail === "function", "Firebase Auth read client is required.");
  assert.ok(firestoreClient && typeof firestoreClient.collection === "function", "Firestore read client is required.");
  let account;
  try {
    account = await authClient.getUserByEmail(email);
  } catch (error) {
    if (error?.code === "auth/user-not-found") return diagnoseAdminProfile(null, null);
    throw error;
  }
  assert.ok(typeof account.uid === "string" && account.uid.length > 0, "Firebase returned an invalid user UID.");
  const snapshot = await firestoreClient.collection("users").doc(account.uid).get();
  return diagnoseAdminProfile(account, snapshot.exists ? snapshot.data() : null);
}

async function main() {
  assert.equal(process.argv.length, 2, "No arguments accepted; this script is pinned to souqna-staging.");
  assert.ok(!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST,
    "Unset emulator variables before checking real staging.");
  assert.ok(!process.env.GCLOUD_PROJECT || process.env.GCLOUD_PROJECT === PROJECT_ID,
    "GCLOUD_PROJECT does not match souqna-staging.");
  assert.ok(!process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT === PROJECT_ID,
    "GOOGLE_CLOUD_PROJECT does not match souqna-staging.");
  const email = String(process.env.SOUQNA_ADMIN_EMAIL || "").trim();
  assert.ok(email, "Set SOUQNA_ADMIN_EMAIL locally. Do not send credentials to chat.");

  const require = createRequire(new URL("../functions/index.js", import.meta.url));
  const { initializeApp, applicationDefault, deleteApp } = require("firebase-admin/app");
  const { getAuth } = require("firebase-admin/auth");
  const { getFirestore } = require("firebase-admin/firestore");
  const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID },
    "souqna-staging-readonly-admin-diagnostic");
  try {
    assert.equal(app.options.projectId, PROJECT_ID);
    const result = await inspectStagingAdmin({
      email,
      authClient: getAuth(app),
      firestoreClient: getFirestore(app)
    });
    console.log("SOUQNA STAGING ADMIN CHECK:", result.status);
    console.log(result.message);
    console.log("No user details or secrets printed. No records modified.");
    if (result.status !== "ADMIN_READY") process.exitCode = 2;
  } finally {
    await deleteApp(app);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    const code = String(error?.code || "unknown").replace(/[^a-z0-9/-]/gi, "").slice(0,80);
    console.error("SOUQNA STAGING ADMIN CHECK FAILED:", code);
    console.error("Verify Google ADC access to souqna-staging, or review the stated local configuration requirement.");
    process.exitCode = 1;
  });
}
