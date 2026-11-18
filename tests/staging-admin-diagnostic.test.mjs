import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnoseAdminProfile, inspectStagingAdmin, PROJECT_ID } from "../scripts/diagnose-staging-admin.mjs";

test("diagnostic is pinned to staging", () => {
  assert.equal(PROJECT_ID, "souqna-staging");
});

test("missing Authentication user never gains admin", () => {
  assert.equal(diagnoseAdminProfile(null, null).status, "AUTH_USER_MISSING");
});

test("disabled Authentication user never gains admin", () => {
  assert.equal(diagnoseAdminProfile({ uid: "test", disabled: true }, { role: "admin" }).status, "AUTH_USER_DISABLED");
});

test("missing Firestore profile never gains admin", () => {
  assert.equal(diagnoseAdminProfile({ uid: "test", disabled: false }, null).status, "FIRESTORE_PROFILE_MISSING");
});

test("non-admin Firestore role is rejected", () => {
  assert.equal(diagnoseAdminProfile({ uid: "test", disabled: false }, { role: "user" }).status, "ADMIN_ROLE_MISSING");
  assert.equal(diagnoseAdminProfile({ uid: "test", disabled: false }, { role: "moderator" }).status, "ADMIN_ROLE_MISSING");
});

test("admin role is accepted only for enabled Authentication users", () => {
  assert.equal(diagnoseAdminProfile({ uid: "test", disabled: false }, { role: "admin" }).status, "ADMIN_READY");
});

test("Firebase lookup only reads the matching user's document", async () => {
  const calls = [];
  const authClient = {
    async getUserByEmail(email) {
      calls.push(["auth", email]);
      return { uid: "test-uid", disabled: false };
    }
  };
  const firestoreClient = {
    collection(name) {
      calls.push(["collection", name]);
      return {
        doc(uid) {
          calls.push(["doc", uid]);
          return {
            async get() {
              calls.push(["get"]);
              return { exists: true, data: () => ({ role: "admin" }) };
            }
          };
        }
      };
    }
  };
  const result = await inspectStagingAdmin({ email: "admin@example.test", authClient, firestoreClient });
  assert.equal(result.status, "ADMIN_READY");
  assert.deepEqual(calls, [
    ["auth", "admin@example.test"],
    ["collection", "users"],
    ["doc", "test-uid"],
    ["get"]
  ]);
});

test("user-not-found is returned without Firestore access", async () => {
  const authClient = {
    async getUserByEmail() {
      throw Object.assign(new Error("not found"), { code: "auth/user-not-found" });
    }
  };
  const firestoreClient = {
    collection() {
      throw new Error("Firestore must not be accessed");
    }
  };
  const result = await inspectStagingAdmin({
    email: "missing@example.test",
    authClient,
    firestoreClient
  });
  assert.equal(result.status, "AUTH_USER_MISSING");
});

test("invalid email is rejected before touching Firebase", async () => {
  await assert.rejects(
    inspectStagingAdmin({ email: "invalid", authClient: {}, firestoreClient: {} }),
    /valid email/
  );
});
