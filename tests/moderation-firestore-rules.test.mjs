import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

const projectId = "demo-souqna-rules";
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
let environment;

before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Start these tests with npm run test:rules; the Firestore Emulator is required.");
  }
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules }
  });
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "users", "admin-1"), { name: "Manager", email: "admin@example.test", role: "admin", stars: 0 }),
      setDoc(doc(db, "users", "moderator-1"), { name: "Moderator", email: "mod@example.test", role: "moderator", stars: 0 }),
      setDoc(doc(db, "users", "user-1"), { name: "User", email: "user@example.test", role: "user", stars: 0 }),
      setDoc(doc(db, "ads", "pending-ad"), { title: "Test ad", ownerId: "user-1", status: "pending" }),
      setDoc(doc(db, "stores", "pending-store"), { name: "Test store", ownerId: "user-1", status: "pending" }),
      setDoc(doc(db, "moderationAudit", "audit-1"), {
        type: "ad", targetId: "pending-ad", action: "approve",
        fromStatus: "pending", toStatus: "approved",
        actorId: "admin-1", ownerId: "user-1", createdAt: 1
      })
    ]);
  });
});

after(async () => {
  if (environment) await environment.cleanup();
});

test("a client administrator cannot directly approve or reject an ad", async () => {
  const db = environment.authenticatedContext("admin-1").firestore();
  await assertFails(updateDoc(doc(db, "ads", "pending-ad"), { status: "approved" }));
  await assertFails(updateDoc(doc(db, "ads", "pending-ad"), { status: "rejected" }));
});

test("a client moderator cannot directly approve a store", async () => {
  const db = environment.authenticatedContext("moderator-1").firestore();
  await assertFails(updateDoc(doc(db, "stores", "pending-store"), { status: "approved" }));
});

test("a client administrator cannot directly approve a store", async () => {
  const db = environment.authenticatedContext("admin-1").firestore();
  await assertFails(updateDoc(doc(db, "stores", "pending-store"), { status: "approved" }));
});

test("a regular user cannot change moderation status", async () => {
  const db = environment.authenticatedContext("user-1").firestore();
  await assertFails(updateDoc(doc(db, "ads", "pending-ad"), { status: "approved" }));
});

test("audit history is readable only by administrators", async () => {
  const adminDb = environment.authenticatedContext("admin-1").firestore();
  const moderatorDb = environment.authenticatedContext("moderator-1").firestore();
  const userDb = environment.authenticatedContext("user-1").firestore();
  await assertSucceeds(getDoc(doc(adminDb, "moderationAudit", "audit-1")));
  await assertFails(getDoc(doc(moderatorDb, "moderationAudit", "audit-1")));
  await assertFails(getDoc(doc(userDb, "moderationAudit", "audit-1")));
});

test("even administrators cannot forge or modify audit records", async () => {
  const db = environment.authenticatedContext("admin-1").firestore();
  await assertFails(setDoc(doc(db, "moderationAudit", "audit-2"), {
    actorId: "admin-1", targetId: "pending-ad", action: "approve"
  }));
  await assertFails(updateDoc(doc(db, "moderationAudit", "audit-1"), { action: "reject" }));
});

test("administrators cannot bypass moderation by deleting another user's content", async () => {
  const adminDb = environment.authenticatedContext("admin-1").firestore();
  const moderatorDb = environment.authenticatedContext("moderator-1").firestore();
  await assertFails(deleteDoc(doc(adminDb, "ads", "pending-ad")));
  await assertFails(deleteDoc(doc(moderatorDb, "stores", "pending-store")));
});

test("the content owner retains deletion rights", async () => {
  const db = environment.authenticatedContext("user-1").firestore();
  await assertSucceeds(deleteDoc(doc(db, "ads", "pending-ad")));
  await assertSucceeds(deleteDoc(doc(db, "stores", "pending-store")));
});

test("administrators cannot reassign content ownership to bypass audited review", async () => {
  const db = environment.authenticatedContext("admin-1").firestore();
  await assertFails(updateDoc(doc(db, "ads", "pending-ad"), { ownerId: "admin-1" }));
  await assertFails(updateDoc(doc(db, "stores", "pending-store"), { ownerId: "admin-1" }));
  await assertFails(updateDoc(doc(db, "ads", "pending-ad"), { createdAt: 0 }));
});
