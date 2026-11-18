import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = readFileSync(new URL("../functions/moderation.js", import.meta.url), "utf8");
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const client = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const require = createRequire(import.meta.url);

class HttpsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function loadModeration() {
  const exported = { exports: {} };
  const fakeRequire = name => {
    if (name === "firebase-functions/v2/https") {
      return { onCall: (_options, handler) => handler, HttpsError };
    }
    if (name === "firebase-admin/firestore") return {};
    throw new Error("Unexpected module: " + name);
  };
  runInNewContext(source, { module: exported, exports: exported.exports, require: fakeRequire, Date });
  assert.equal(typeof exported.exports, "function");
  return exported.exports;
}

function mockDb({ role = "moderator", status = "pending", ownerId = "owner-1", missing = false } = {}) {
  const calls = [];
  const refs = [];
  const db = {
    collection(name) {
      return {
        doc(id) {
          const ref = { name, id: id ?? name + "-new-" + refs.length };
          refs.push(ref);
          return ref;
        }
      };
    },
    async runTransaction(callback) {
      const changes = [];
      const tx = {
        async get(ref) {
          calls.push(["read", ref.name]);
          if (ref.name === "users") return { exists: true, data: () => ({ role }) };
          return { exists: !missing, data: () => ({ status, ownerId, name: "متجر تجريبي", title: "إعلان تجريبي" }) };
        },
        update(ref, fields) { changes.push(["update", ref.name, fields]); },
        create(ref, fields) { changes.push(["create", ref.name, fields]); }
      };
      const output = await callback(tx);
      calls.push(...changes);
      return output;
    }
  };
  return { db, calls };
}

test("moderation requires authentication", async () => {
  const { db } = mockDb();
  await assert.rejects(loadModeration()(db, {})({ data: { type: "ad", id: "sample", action: "approve" } }), error => error.code === "unauthenticated");
});

test("moderation rejects untrusted roles", async () => {
  const { db, calls } = mockDb({ role: "user" });
  await assert.rejects(loadModeration()(db, {})({ auth: { uid: "user-1" }, data: { type: "store", id: "sample", action: "reject" } }), error => error.code === "permission-denied");
  assert.ok(!calls.some(call => call[0] === "update" || call[0] === "create"));
});

test("moderation rejects invalid target ids", async () => {
  const { db } = mockDb();
  await assert.rejects(loadModeration()(db, {})({ auth: { uid: "moderator-1" }, data: { type: "ad", id: "../other", action: "approve" } }), error => error.code === "invalid-argument");
});

test("moderation rejects non-pending targets without writes", async () => {
  const { db, calls } = mockDb({ status: "approved" });
  await assert.rejects(loadModeration()(db, {})({ auth: { uid: "moderator-1" }, data: { type: "ad", id: "sample", action: "reject" } }), error => error.code === "failed-precondition");
  assert.ok(!calls.some(call => call[0] === "update" || call[0] === "create"));
});

test("approving an ad creates status, audit and notification in one transaction", async () => {
  const { db, calls } = mockDb();
  const result = await loadModeration()(db, {})({ auth: { uid: "moderator-1" }, data: { type: "ad", id: "ad-1", action: "approve" } });
  assert.equal(result.ok, true);
  assert.equal(result.status, "approved");
  assert.deepEqual(calls.filter(call => call[0] === "update").map(call => call[1]), ["ads"]);
  assert.deepEqual(calls.filter(call => call[0] === "create").map(call => call[1]), ["moderationAudit", "notifs"]);
  assert.equal(calls.find(call => call[0] === "create" && call[1] === "moderationAudit")[2].actorId, "moderator-1");
});

test("rejecting a store produces a server-authored rejection record", async () => {
  const { db, calls } = mockDb({ role: "editor" });
  const result = await loadModeration()(db, {})({ auth: { uid: "editor-1" }, data: { type: "store", id: "store-1", action: "reject" } });
  assert.equal(result.status, "rejected");
  assert.equal(calls.find(call => call[0] === "update")[1], "stores");
  assert.equal(calls.find(call => call[0] === "create" && call[1] === "moderationAudit")[2].toStatus, "rejected");
});

test("client writes to moderation audit are prohibited by rules", () => {
  assert.match(rules, /match \/moderationAudit\/\{id\} \{\s*allow read: if isAdmin\(\);\s*allow create, update, delete: if false;/);
  assert.match(rules, /hasAny\(\["featuredUntil", "status", "ownerId", "createdAt"\]\)/);
  assert.match(rules, /hasAny\(\["plan", "planUntil", "status", "ownerId", "createdAt"\]\)/);
});

test("client uses trusted moderation endpoint", () => {
  assert.ok(client.includes('httpsCallable(functions,"souqnaModeration")'));
  assert.ok(client.includes('await reviewDecision("ad",id,action)'));
  assert.ok(client.includes('await reviewDecision("store",id,action)'));
});

test("missing moderation target rejects without writing an audit", async () => {
  const { db, calls } = mockDb({ missing: true });
  await assert.rejects(
    loadModeration()(db, {})({
      auth: { uid: "moderator-1" },
      data: { type: "ad", id: "missing-ad", action: "approve" }
    }),
    error => error.code === "not-found"
  );
  assert.ok(!calls.some(call => call[0] === "update" || call[0] === "create"));
});

test("missing owner identifier rejects without side effects", async () => {
  const { db, calls } = mockDb({ ownerId: "" });
  await assert.rejects(
    loadModeration()(db, {})({
      auth: { uid: "moderator-1" },
      data: { type: "store", id: "store-without-owner", action: "reject" }
    }),
    error => error.code === "failed-precondition"
  );
  assert.ok(!calls.some(call => call[0] === "update" || call[0] === "create"));
});

test("moderation decision UI prevents duplicate submissions and refreshes stale requests", () => {
  assert.ok(client.includes("const moderationInFlight=new Set()"));
  assert.ok(client.includes("if(moderationInFlight.has(key))return"));
  assert.ok(client.includes("if(moderationInFlight.size>0)return"));
  assert.ok(client.includes("moderationInFlight.add(key)"));
  assert.ok(client.includes("moderationInFlight.delete(key)"));
  assert.ok(client.includes('"functions/failed-precondition","functions/not-found"'));
  assert.ok(client.includes('await reviewDecision("ad",id,action)'));
  assert.ok(client.includes('await reviewDecision("store",id,action)'));
});
