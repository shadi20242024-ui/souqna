const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { logger } = require("firebase-functions");

initializeApp();
const db = getFirestore();
const OPTIONS = { region: "us-central1", maxInstances: 3, timeoutSeconds: 30, memory: "256MiB" };
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const REQUEST_PATHS = Object.freeze({
  rejectTopup: "starOrders",
  rejectSubscription: "subs",
  rejectPromotion: "promos",
  rejectSponsor: "sponsorRequests"
});

function deny(message) {
  throw new HttpsError("failed-precondition", message);
}
function validId(value, label = "معرف الطلب") {
  if (typeof value !== "string" || !ID_RE.test(value)) {
    throw new HttpsError("invalid-argument", label + " غير صالح");
  }
  return value;
}
function numberInRange(value, minimum, maximum, label) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < minimum || n > maximum) {
    deny(label + " غير صالح");
  }
  return n;
}
function validBalance(value) {
  return numberInRange(value, 0, Number.MAX_SAFE_INTEGER, "رصيد المستخدم");
}
function reference(path, id) {
  return db.collection(path).doc(validId(id));
}

async function getAll(tx, ...refs) {
  return Promise.all(refs.map(ref => tx.get(ref)));
}
function pending(snapshot, description) {
  if (!snapshot.exists || snapshot.data().status !== "pending") {
    deny(description + " غير موجود أو عولج مسبقاً");
  }
  return snapshot.data();
}
function ledger(tx, id, details) {
  tx.create(reference("transactions", id), details);
}
function debitUser(tx, ref, balance, amount) {
  if (balance < amount) deny("رصيد النجوم لا يكفي");
  tx.update(ref, { stars: FieldValue.increment(-amount) });
}

async function approveTopup(tx, id, actor, now) {
  const orderRef = reference("starOrders", id);
  const orderSnap = await tx.get(orderRef);
  const order = pending(orderSnap, "طلب شحن النجوم");
  const amount = numberInRange(order.stars, 1, 100000, "عدد النجوم");
  const userRef = reference("users", order.userId);
  const userSnap = await tx.get(userRef);
  if (!userSnap.exists) deny("حساب المستخدم غير موجود");
  const balance = validBalance(userSnap.data().stars || 0);
  if (!Number.isSafeInteger(balance + amount)) deny("الرصيد الناتج أكبر من الحد المسموح");
  tx.update(userRef, { stars: FieldValue.increment(amount) });
  ledger(tx, "topup_" + id, {
    userId: order.userId, type: "credit", amount,
    note: "شحن نجوم بعد التحقق اليدوي من الدفع", requestId: id, approvedBy: actor, createdAt: now
  });
  tx.update(orderRef, { status: "done", approvedAt: now, approvedBy: actor, creditedStars: amount });
  return { message: "تم اعتماد الشحن", userId: order.userId, notification: "أُضيف " + amount + " نجمة إلى رصيدك" };
}

async function approveSubscription(tx, id, actor, now) {
  const subRef = reference("subs", id);
  const subSnap = await tx.get(subRef);
  const sub = pending(subSnap, "طلب الاشتراك");
  const userRef = reference("users", sub.userId);
  const storeRef = reference("stores", sub.storeId);
  const planRef = reference("plans", sub.planId);
  const [userSnap, storeSnap, planSnap] = await getAll(tx, userRef, storeRef, planRef);
  if (!userSnap.exists || !storeSnap.exists || !planSnap.exists) deny("بيانات الاشتراك غير مكتملة");
  const store = storeSnap.data(), plan = planSnap.data();
  if (store.ownerId !== sub.userId || store.status !== "approved") {
    deny("المتجر غير منشور أو لا يتبع للمستخدم");
  }
  if (plan.active === false) deny("الباقة معطّلة");
  const amount = numberInRange(plan.stars, 0, 100000, "سعر الباقة");
  const days = numberInRange(plan.days, 1, 365, "مدة الباقة");
  const balance = validBalance(userSnap.data().stars || 0);
  const base = store.plan === sub.planId ? Math.max(now, Number(store.planUntil || 0)) : now;
  debitUser(tx, userRef, balance, amount);
  tx.update(storeRef, { plan: sub.planId, planUntil: base + days * 86400000 });
  ledger(tx, "sub_" + id, {
    userId: sub.userId, type: "debit", amount: -amount,
    note: "اشتراك " + String(plan.name || sub.planId).slice(0, 80) + " - " + String(store.name || "").slice(0, 80),
    requestId: id, approvedBy: actor, createdAt: now
  });
  tx.update(subRef, { status: "done", approvedAt: now, approvedBy: actor, chargedStars: amount, actualDays: days });
  return { message: "تم تفعيل الاشتراك", userId: sub.userId,
    notification: "تم تفعيل اشتراك متجر " + String(store.name || "").slice(0, 80) };
}

async function approvePromotion(tx, id, actor, now) {
  const promoRef = reference("promos", id);
  const promoSnap = await tx.get(promoRef);
  const promo = pending(promoSnap, "طلب التمييز");
  const userRef = reference("users", promo.userId);
  const adRef = reference("ads", promo.adId);
  const packRef = reference("packages", promo.pkgId);
  const [userSnap, adSnap, packSnap] = await getAll(tx, userRef, adRef, packRef);
  if (!userSnap.exists || !adSnap.exists || !packSnap.exists) deny("بيانات التمييز غير مكتملة");
  const ad = adSnap.data(), pack = packSnap.data();
  if (ad.ownerId !== promo.userId || ad.status !== "approved") deny("الإعلان غير منشور أو لا يتبع للمستخدم");
  if (pack.active === false) deny("الباقة معطّلة");
  const amount = numberInRange(pack.stars, 1, 100000, "سعر التمييز");
  const days = numberInRange(pack.days, 1, 365, "مدة التمييز");
  const balance = validBalance(userSnap.data().stars || 0);
  debitUser(tx, userRef, balance, amount);
  tx.update(adRef, { featuredUntil: Math.max(now, Number(ad.featuredUntil || 0)) + days * 86400000 });
  ledger(tx, "promo_" + id, {
    userId: promo.userId, type: "debit", amount: -amount,
    note: "تمييز إعلان: " + String(ad.title || "").slice(0, 120),
    requestId: id, approvedBy: actor, createdAt: now
  });
  tx.update(promoRef, { status: "done", approvedAt: now, approvedBy: actor, chargedStars: amount, actualDays: days });
  return { message: "تم تمييز الإعلان", userId: promo.userId,
    notification: "تم تمييز إعلانك: " + String(ad.title || "").slice(0, 100) };
}

async function approveSponsor(tx, id, actor, now) {
  const requestRef = reference("sponsorRequests", id);
  const snapshot = await tx.get(requestRef);
  const request = pending(snapshot, "طلب البنر");
  const days = numberInRange(request.days, 1, 90, "مدة البنر");
  if (typeof request.company !== "string" || !request.company.trim() ||
      typeof request.title !== "string" || !request.title.trim()) {
    deny("اسم الشركة أو عنوان البنر ناقص");
  }
  const sponsorRef = reference("sponsors", "booking_" + id);
  const sponsorSnapshot = await tx.get(sponsorRef);
  if (sponsorSnapshot.exists) deny("تم إنشاء البنر من قبل");
  tx.create(sponsorRef, {
    company: request.company.slice(0, 100),
    title: request.title.slice(0, 120),
    desc: String(request.desc || "").slice(0, 500),
    phone: String(request.phone || "").slice(0, 30),
    img: typeof request.img === "string" ? request.img : "",
    from: now, to: now + days * 86400000,
    active: true, requestId: id, approvedBy: actor
  });
  tx.update(requestRef, { status: "approved", sponsorId: sponsorRef.id, approvedAt: now, approvedBy: actor });
  return { message: "تم تفعيل البنر", userId: request.userId,
    notification: "تمت الموافقة على بنرك الإعلاني: " + request.title.slice(0, 120) };
}

async function rejectRequest(tx, action, id, actor, now) {
  const collectionName = REQUEST_PATHS[action];
  const reqRef = reference(collectionName, id);
  const snapshot = await tx.get(reqRef);
  const request = pending(snapshot, "الطلب");
  tx.update(reqRef, { status: "rejected", reviewedAt: now, reviewedBy: actor });
  return { message: "تم رفض الطلب", userId: request.userId,
    notification: "تم رفض طلبك (" + collectionName + "). يمكنك التواصل مع الإدارة للاستفسار" };
}

async function adjustBalance(tx, data, actor, now) {
  const userId = validId(data.userId, "معرف المستخدم");
  const delta = numberInRange(data.delta, -100000, 100000, "تعديل النجوم");
  if (delta === 0) deny("مبلغ التعديل صفر");
  const note = typeof data.note === "string" ? data.note.trim().slice(0, 200) : "";
  if (note.length < 5) deny("اذكر سبب تعديل الرصيد (خمسة أحرف على الأقل)");
  const operationId = validId(data.operationId, "معرف عملية التعديل");
  const userRef = reference("users", userId);
  const ledgerRef = reference("transactions", "manual_" + operationId);
  const [userSnap, ledgerSnap] = await getAll(tx, userRef, ledgerRef);
  if (!userSnap.exists) deny("المستخدم غير موجود");
  if (ledgerSnap.exists) deny("عملية تعديل الرصيد تمت مسبقاً");
  const balance = validBalance(userSnap.data().stars || 0);
  if (balance + delta < 0 || !Number.isSafeInteger(balance + delta)) deny("الرصيد الناتج غير صالح");
  tx.update(userRef, { stars: FieldValue.increment(delta) });
  tx.create(ledgerRef, {
    userId, type: delta > 0 ? "credit" : "debit", amount: delta,
    note, approvedBy: actor, createdAt: now, manual: true, operationId
  });
  return { message: "حُفظ تعديل الرصيد", userId,
    notification: (delta > 0 ? "أُضيف " : "خُصم ") + Math.abs(delta) + " نجمة: " + note };
}

exports.souqnaFinance = onCall(OPTIONS, async request => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "سجّل الدخول أولاً");
  const data = request.data || {};
  const action = data.action;
  const supported = [
    "approveTopup", "approveSubscription", "approvePromotion", "approveSponsor",
    "rejectTopup", "rejectSubscription", "rejectPromotion", "rejectSponsor", "adjustBalance"
  ];
  if (!supported.includes(action)) throw new HttpsError("invalid-argument", "عملية غير مدعومة");
  const id = action === "adjustBalance" ? null : validId(data.id);
  const actor = request.auth.uid;
  const now = Date.now();
  const result = await db.runTransaction(async tx => {
    // Check role inside the transaction so role changes invalidate a pending commit.
    const adminSnap = await tx.get(reference("users", actor));
    if (!adminSnap.exists || adminSnap.data().role !== "admin") {
      throw new HttpsError("permission-denied", "صلاحيات مدير سوقنا مطلوبة");
    }
    switch (action) {
      case "approveTopup": return approveTopup(tx, id, actor, now);
      case "approveSubscription": return approveSubscription(tx, id, actor, now);
      case "approvePromotion": return approvePromotion(tx, id, actor, now);
      case "approveSponsor": return approveSponsor(tx, id, actor, now);
      case "adjustBalance": return adjustBalance(tx, data, actor, now);
      default: return rejectRequest(tx, action, id, actor, now);
    }
  });
  if (result.userId && result.notification) {
    try {
      await db.collection("notifs").add({
        userId: result.userId, text: result.notification, read: false,
        createdAt: now, origin: "souqnaFinance", approvedBy: actor
      });
    } catch(error) {
      logger.warn("Optional finance notification failed", error);
    }
  }
  logger.info("SOUQNA finance operation", { action, requestId: id, adminUid: actor });
  return { ok: true, message: result.message };
});
