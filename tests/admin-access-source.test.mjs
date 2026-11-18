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
  assert.ok(rules.includes('allow update: if (isAdmin() && changedOnly(["name", "role", "specialties"])'));
});

test("production credentials are not required for source validation", () => {
  assert.ok(!html.includes('serviceAccountKey'));
  assert.ok(!html.includes('GOOGLE_APPLICATION_CREDENTIALS'));
});

test("administrator directory supports bounded search and safe rendering", () => {
  assert.ok(html.includes("function adminUserRows()"));
  assert.ok(html.includes('if(!isAdm())return'));
  assert.ok(html.includes("filtered.slice(0,100)"));
  assert.ok(html.includes("esc(u.email||"));
  assert.ok(html.includes('id="admin-user-search"'));
  assert.ok(html.includes('e.target.id==="admin-user-search"&&isAdm()'));
});

test("sign-out clears privileged user collections", () => {
  assert.ok(html.includes("allUsers=[];allTx=[];moderationHistory=[];pendStores=[]"));
  assert.ok(html.includes('adminUserQuery="";'));
});

test("moderation queue is searchable, filtered, and bounded", () => {
  assert.ok(html.includes("function adminReviewQueue()"));
  assert.ok(html.includes("if(!canModerate())return"));
  assert.ok(html.includes('adminReviewType==="ads"?[]'));
  assert.ok(html.includes('adminReviewType==="stores"?[]'));
  assert.ok(html.includes("pendingStores.slice(0,50)"));
  assert.ok(html.includes("pendingAds.slice(0,50)"));
  assert.ok(html.includes('id="admin-review-search"'));
  assert.ok(html.includes('id="admin-review-type"'));
  assert.ok(html.includes('e.target.id==="admin-review-search"&&canModerate()'));
  assert.ok(html.includes('e.target.id!=="admin-review-type"||!canModerate()'));
});

test("moderation search is cleared on logout", () => {
  assert.ok(html.includes('adminReviewQuery="";adminReviewType="all";'));
});

test("moderation history is admin-only and limited to fifty entries", () => {
  assert.ok(html.includes("function adminAuditRows()"));
  assert.ok(html.includes('moderationHistory=await read("سجل مراجعة المحتوى"'));
  assert.ok(html.includes('orderBy("createdAt","desc"),limit(50)'));
  assert.ok(html.includes('if(!isAdm())return ""'));
  assert.ok(html.includes("moderationHistory=[];pendStores=[]"));
});

test("only reviewer roles can invoke moderation from the interface", () => {
  assert.ok(html.includes('const canModerate=()=>me&&(["admin","moderator","editor"].includes(me.role)'));
  assert.ok(html.includes('else if(a=="ok"||a=="no"){if(!canModerate())'));
  assert.ok(html.includes('else if(a=="stok"||a=="stno"){if(!canModerate())'));
  assert.ok(html.includes('${canModerate()?'));
});

test("privileged data is reset before any new authentication session is loaded", () => {
  const callback = html.slice(html.indexOf("onAuthStateChanged(auth,async u=>"));
  assert.ok(callback.startsWith("onAuthStateChanged(auth,async u=>"));
  const resetIndex = callback.indexOf("allUsers=[];allTx=[];moderationHistory=[];pendStores=[]");
  const readIndex = callback.indexOf('const s=await getDoc(doc(db,"users",u.uid))');
  assert.ok(resetIndex > 0 && readIndex > resetIndex, "Previous administrator data must be cleared before fetching a new account");
  assert.ok(callback.indexOf("adminLoadWarnings=[]") < readIndex);
});

test("obsolete asynchronous account reads cannot restore prior administrator data", () => {
  assert.ok(html.includes("let sessionVersion=0;"));
  assert.ok(html.includes('throw new Error("souqna/session-changed")'));
  assert.ok(html.includes('const expectedVersion=++sessionVersion'));
  assert.ok(html.includes('if(expectedVersion!==sessionVersion)return;'));
  assert.ok(html.includes("ensureSession(expectedVersion,expectedUid);return result"));
  assert.ok(html.includes("ensureSession(expectedVersion,expectedUid);if(u.exists())"));
});
