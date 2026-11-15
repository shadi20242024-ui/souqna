"use strict";
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
initializeApp();
const db = getFirestore();

// Only a trusted operator should set the Firebase Auth custom claim admin=true.
// This callable is NOT enabled in the current web UI until deployed and tested.
exports.approveStarOrder = onCall({region:"europe-west1", enforceAppCheck:true}, async request => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Administrator authorization required");
  }
  const orderId = request.data && request.data.orderId;
  if (typeof orderId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(orderId)) {
    throw new HttpsError("invalid-argument", "Invalid order ID");
  }
  const orderRef = db.collection("starOrders").doc(orderId);
  const ledgerRef = db.collection("transactions").doc("star_credit_" + orderId);
  const notifRef = db.collection("notifs").doc("star_credit_" + orderId);
  return db.runTransaction(async tx => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new HttpsError("not-found", "Order not found");
    const order = orderSnap.data();
    if (order.status === "done") return {status:"already_processed"};
    if (order.status !== "pending") throw new HttpsError("failed-precondition", "Order is not pending");
    if (typeof order.userId !== "string" || !order.userId || !Number.isSafeInteger(order.stars) || order.stars < 1 || order.stars > 100000) {
      throw new HttpsError("failed-precondition", "Invalid order data");
    }
    const userRef = db.collection("users").doc(order.userId);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new HttpsError("failed-precondition", "User not found");
    const balance = userSnap.data().stars ?? 0;
    if (!Number.isSafeInteger(balance) || balance < 0 || !Number.isSafeInteger(balance + order.stars)) {
      throw new HttpsError("failed-precondition", "Invalid balance");
    }
    // All reads above precede all writes, as required by Firestore transactions.
    tx.update(userRef, {stars:balance + order.stars});
    tx.update(orderRef, {status:"done", approvedAt:FieldValue.serverTimestamp(), approvedBy:request.auth.uid});
    tx.create(ledgerRef, {userId:order.userId, type:"credit", amount:order.stars, note:"شحن نجوم", orderId, createdAt:Date.now()});
    tx.create(notifRef, {userId:order.userId, text:"أُضيف " + order.stars + " نجمة إلى رصيدك", read:false, createdAt:Date.now()});
    return {status:"done", stars:order.stars};
  });
});


const requireAdminAndId = request => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "Administrator authorization required");
  }
  const id = request.data && request.data.requestId;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new HttpsError("invalid-argument", "Invalid request ID");
  }
  return id;
};
const validPrice = n => Number.isSafeInteger(n) && n >= 0 && n <= 100000;
const validDays = n => Number.isSafeInteger(n) && n > 0 && n <= 365;
const safeUntil = (current, days) => {
  const base = Number.isSafeInteger(current) ? Math.max(Date.now(), current) : Date.now();
  const until = base + days * 86400000;
  if (!Number.isSafeInteger(until)) throw new HttpsError("failed-precondition", "Invalid expiry");
  return until;
};

// Price and duration are read from authoritative package documents, never from the request.
exports.approvePromotion = onCall({region:"europe-west1", enforceAppCheck:true}, async request => {
  const id = requireAdminAndId(request);
  const reqRef = db.collection("promos").doc(id);
  return db.runTransaction(async tx => {
    const snap = await tx.get(reqRef);
    if (!snap.exists) throw new HttpsError("not-found", "Promotion request not found");
    const p = snap.data();
    if (p.status === "done") return {status:"already_processed"};
    if (p.status !== "pending" || typeof p.userId !== "string" || typeof p.adId !== "string" || typeof p.pkgId !== "string") {
      throw new HttpsError("failed-precondition", "Invalid promotion request");
    }
    const userRef = db.collection("users").doc(p.userId);
    const adRef = db.collection("ads").doc(p.adId);
    const packageRef = db.collection("packages").doc(p.pkgId);
    const [userSnap, adSnap, packageSnap] = await Promise.all([tx.get(userRef),tx.get(adRef),tx.get(packageRef)]);
    if (!userSnap.exists || !adSnap.exists || !packageSnap.exists) throw new HttpsError("failed-precondition", "Related record missing");
    const pack = packageSnap.data(), ad = adSnap.data(), user = userSnap.data();
    if (pack.active === false || !validPrice(pack.stars) || !validDays(pack.days) ||
        ad.ownerId !== p.userId || ad.status !== "approved" ||
        p.stars !== pack.stars || p.days !== pack.days) {
      throw new HttpsError("failed-precondition", "Promotion details are invalid or outdated");
    }
    const balance = user.stars ?? 0;
    if (!Number.isSafeInteger(balance) || balance < pack.stars) throw new HttpsError("failed-precondition", "Insufficient balance");
    const until = safeUntil(ad.featuredUntil, pack.days);
    tx.update(userRef,{stars:balance-pack.stars});
    tx.update(adRef,{featuredUntil:until});
    tx.update(reqRef,{status:"done",approvedAt:FieldValue.serverTimestamp(),approvedBy:request.auth.uid});
    tx.create(db.collection("transactions").doc("promo_debit_"+id),{userId:p.userId,type:"debit",amount:-pack.stars,note:"تمييز إعلان",requestId:id,createdAt:Date.now()});
    tx.create(db.collection("notifs").doc("promo_done_"+id),{userId:p.userId,text:"تم تمييز إعلانك",read:false,createdAt:Date.now()});
    return {status:"done",featuredUntil:until};
  });
});

exports.approveSubscription = onCall({region:"europe-west1", enforceAppCheck:true}, async request => {
  const id = requireAdminAndId(request);
  const reqRef = db.collection("subs").doc(id);
  return db.runTransaction(async tx => {
    const snap = await tx.get(reqRef);
    if (!snap.exists) throw new HttpsError("not-found", "Subscription request not found");
    const s = snap.data();
    if (s.status === "done") return {status:"already_processed"};
    if (s.status !== "pending" || typeof s.userId !== "string" || typeof s.storeId !== "string" || typeof s.planId !== "string") {
      throw new HttpsError("failed-precondition", "Invalid subscription request");
    }
    const userRef=db.collection("users").doc(s.userId);
    const storeRef=db.collection("stores").doc(s.storeId);
    const planRef=db.collection("plans").doc(s.planId);
    const [userSnap,storeSnap,planSnap]=await Promise.all([tx.get(userRef),tx.get(storeRef),tx.get(planRef)]);
    if (!userSnap.exists || !storeSnap.exists || !planSnap.exists) throw new HttpsError("failed-precondition", "Related record missing");
    const plan=planSnap.data(), store=storeSnap.data(), user=userSnap.data();
    if (plan.active === false || !validPrice(plan.stars) || !validDays(plan.days) ||
        store.ownerId !== s.userId || store.status !== "approved" ||
        s.stars !== plan.stars || s.days !== plan.days) {
      throw new HttpsError("failed-precondition", "Subscription details are invalid or outdated");
    }
    const balance=user.stars ?? 0;
    if (!Number.isSafeInteger(balance) || balance < plan.stars) throw new HttpsError("failed-precondition", "Insufficient balance");
    const until=safeUntil(store.plan === s.planId ? store.planUntil : null,plan.days);
    tx.update(userRef,{stars:balance-plan.stars});
    tx.update(storeRef,{plan:s.planId,planUntil:until});
    tx.update(reqRef,{status:"done",approvedAt:FieldValue.serverTimestamp(),approvedBy:request.auth.uid});
    tx.create(db.collection("transactions").doc("sub_debit_"+id),{userId:s.userId,type:"debit",amount:-plan.stars,note:"اشتراك متجر",requestId:id,createdAt:Date.now()});
    tx.create(db.collection("notifs").doc("sub_done_"+id),{userId:s.userId,text:"تم تفعيل اشتراك متجرك",read:false,createdAt:Date.now()});
    return {status:"done",planUntil:until};
  });
});

// Rejecting a request never changes the user's star balance.
// Repeated rejection is idempotent; a completed request cannot be rejected.
function rejectionCallable(collectionName, label) {
  return onCall({region:"europe-west1", enforceAppCheck:true}, async request => {
    const id = requireAdminAndId(request);
    const ref = db.collection(collectionName).doc(id);
    return db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", label + " request not found");
      const data = snap.data();
      if (data.status === "rejected") return {status:"already_rejected"};
      if (data.status !== "pending") throw new HttpsError("failed-precondition", "Request is not pending");
      if (typeof data.userId !== "string" || !data.userId) throw new HttpsError("failed-precondition", "Invalid request owner");
      tx.update(ref,{status:"rejected",rejectedAt:FieldValue.serverTimestamp(),rejectedBy:request.auth.uid});
      tx.create(db.collection("notifs").doc("rejected_"+collectionName+"_"+id),{
        userId:data.userId,text:"تم رفض طلب "+label,read:false,createdAt:Date.now()
      });
      return {status:"rejected"};
    });
  });
}
exports.rejectStarOrder = rejectionCallable("starOrders","شحن النجوم");
exports.rejectPromotion = rejectionCallable("promos","تمييز الإعلان");
exports.rejectSubscription = rejectionCallable("subs","اشتراك المتجر");
