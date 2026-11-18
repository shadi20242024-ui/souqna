const { onCall, HttpsError } = require("firebase-functions/v2/https");

const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const TARGETS = Object.freeze({ ad: "ads", store: "stores" });
const DECISIONS = Object.freeze({ approve: "approved", reject: "rejected" });
const REVIEW_ROLES = new Set(["admin", "moderator", "editor", "specialist"]);

function validReview(data) {
  const type = data?.type;
  const action = data?.action;
  const id = data?.id;
  if (!Object.hasOwn(TARGETS, type) || !Object.hasOwn(DECISIONS, action) ||
      typeof id !== "string" || !ID_PATTERN.test(id)) {
    throw new HttpsError("invalid-argument", "طلب مراجعة غير صالح");
  }
  return { type, action, id, status: DECISIONS[action] };
}

module.exports = function createModeration(db, options) {
  return onCall(options, async request => {
    const actor = request.auth?.uid;
    if (!actor) throw new HttpsError("unauthenticated", "يجب تسجيل الدخول أولاً");
    const { type, action, id, status } = validReview(request.data);
    const targetRef = db.collection(TARGETS[type]).doc(id);
    const actorRef = db.collection("users").doc(actor);
    const auditRef = db.collection("moderationAudit").doc();
    const notificationRef = db.collection("notifs").doc();
    const now = Date.now();
    const result = await db.runTransaction(async tx => {
      const [userSnap, targetSnap] = await Promise.all([tx.get(actorRef), tx.get(targetRef)]);
      if (!userSnap.exists || !REVIEW_ROLES.has(userSnap.data().role)) {
        throw new HttpsError("permission-denied", "ليست لديك صلاحية مراجعة الطلبات");
      }
      if (!targetSnap.exists) throw new HttpsError("not-found", "لم يعد الطلب موجوداً");
      const item = targetSnap.data();
      if (userSnap.data().role === "specialist" &&
          !(type === "ad" && item.cat === "jobs" && Array.isArray(userSnap.data().specialties) &&
            userSnap.data().specialties.includes("jobs"))) {
        throw new HttpsError("permission-denied", "هذا المشرف مخول بمراجعة إعلانات الوظائف فقط");
      }
      if (item.status !== "pending") {
        throw new HttpsError("failed-precondition", "سبق التعامل مع هذا الطلب؛ حدّث القائمة");
      }
      const ownerId = item.ownerId;
      if (typeof ownerId !== "string" || !ID_PATTERN.test(ownerId)) {
        throw new HttpsError("failed-precondition", "الطلب لا يحتوي على صاحب حساب صالح");
      }
      const subject = String(type === "ad" ? item.title || "" : item.name || "").slice(0,150);
      tx.update(targetRef, { status });
      tx.create(auditRef, {
        type, targetId: id, action, fromStatus: "pending", toStatus: status,
        actorId: actor, ownerId, createdAt: now
      });
      tx.create(notificationRef, {
        userId: ownerId,
        text: (status === "approved" ? "تمت الموافقة على " : "تم رفض ") +
          (type === "ad" ? "إعلانك: " : "متجرك: ") + subject,
        read: false,
        createdAt: now,
        origin: "souqnaModeration"
      });
      return { action, type, status };
    });
    return { ok: true, ...result };
  });
};
