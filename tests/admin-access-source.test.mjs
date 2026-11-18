import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];

test("Firebase application script parses", () => {
  assert.ok(script, "Application script is missing");
  assert.doesNotThrow(() => new Function(script.replace(/^import.*$/gm, "")));
});

test("administrator access requires an existing authorized profile", () => {
  assert.ok(html.includes('const isStaff=()=>me&&STAFF.includes(me.role)'));
  assert.ok(html.includes('isAdm=()=>me&&me.role=="admin"'));
  assert.ok(html.includes('accountProfileMissing=!s.exists()'));
  assert.ok(html.includes('صلاحية المدير غير مفعّلة'));
  assert.ok(html.includes('ملف المستخدم غير موجود في Firestore'));
  assert.ok(html.includes('accountProfileReadError=String(error?.code||"unknown")'));
  assert.ok(html.includes("تعذر التحقق من صلاحيات حسابك"));
});

test("registration cannot self-assign an administrator role", () => {
  assert.ok(html.includes('role:"user",stars:0'));
  assert.ok(rules.includes('request.resource.data.role == "user"'));
  assert.ok(rules.includes('allow update: if (isAdmin() && changedOnly(["name", "role"]))'));
});

test("production credentials are not required for source validation", () => {
  assert.ok(!html.includes('serviceAccountKey'));
  assert.ok(!html.includes('GOOGLE_APPLICATION_CREDENTIALS'));
});
