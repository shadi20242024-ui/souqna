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
