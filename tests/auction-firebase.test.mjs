import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import {
  getFirestore,
  connectFirestoreEmulator,
  getDoc,
  doc,
  setDoc,
} from "firebase/firestore";
const require = createRequire(
  new URL("../functions/index.js", import.meta.url),
);
test("auction transactions and rules on Auth, Firestore and Functions emulators", async (t) => {
  const projectId = "demo-souqna-rules";
  assert.match(
    process.env.FIRESTORE_EMULATOR_HOST || "",
    /127.0.0.1|localhost/,
  );
  const adminApp = require("firebase-admin/app").initializeApp({ projectId });
  const adb = require("firebase-admin/firestore").getFirestore(adminApp),
    aa = require("firebase-admin/auth").getAuth(adminApp),
    apps = [];
  t.after(async () => {
    await Promise.all(apps.map(deleteApp));
    await require("firebase-admin/app").deleteApp(adminApp);
  });
  async function client(role, verified = true) {
    const email = randomUUID() + "@example.test",
      password = "auction-test-only",
      u = await aa.createUser({ email, password, emailVerified: verified });
    await adb.doc("users/" + u.uid).set({ role, stars: 17 });
    const app = initializeApp({ apiKey: "demo-key", projectId }, u.uid);
    apps.push(app);
    const auth = getAuth(app);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    await signInWithEmailAndPassword(auth, email, password);
    const db = getFirestore(app);
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    const fn = getFunctions(app);
    connectFunctionsEmulator(fn, "127.0.0.1", 5001);
    const callable = require("./auctions")(adb, {}).souqnaAuctionTest;
    return {
      uid: u.uid,
      db,
      call: async (d) => {
        const data = { requestId: randomUUID(), ...d };
        if (!process.env.AUCTION_DIRECT_TEST)
          return (await httpsCallable(fn, "souqnaAuctionTest")(data)).data;
        const token = await aa.verifyIdToken(
          await auth.currentUser.getIdToken(),
        );
        return callable.run({ auth: { uid: token.uid, token }, data });
      },
    };
  }
  const [boss, seller, buyer, rival, unverified] = await Promise.all([
    client("admin"),
    client("user"),
    client("user"),
    client("user"),
    client("user", false),
  ]);
  const id = "qa-" + randomUUID(),
    lot = {
      title: "سيارة",
      description: "اختبار",
      seller: seller.uid,
      currency: "USD",
      category: "سيارات",
      start: Date.now() - 60000,
      end: Date.now() + 180000,
      opening: 100,
      step: 10,
      reserve: 110,
      deposit: 20,
      fee: 2,
      commission: 5,
      photos: [],
      videos: [],
    };
  await assert.rejects(unverified.call({ action: "enroll", id }));
  await Promise.all(
    [seller, buyer, rival].map((c) => c.call({ action: "enroll", id })),
  );
  await assert.rejects(buyer.call({ id, action: "save", lot }));
  await boss.call({ id, action: "save", lot });
  await assert.rejects(getDoc(doc(buyer.db, "auctionTestLots", id)));
  await boss.call({ id, action: "publish" });
  await assert.rejects(
    seller.call({ id, action: "bid", mode: "manual", amount: 120 }),
  );
  const request = {
    id,
    action: "bid",
    amount: 200,
    mode: "auto",
    requestId: randomUUID(),
  };
  await Promise.all([buyer.call(request), buyer.call(request)]);
  await rival.call({ id, action: "bid", amount: 150, mode: "manual" });
  const publicLot = (
    await getDoc(doc(buyer.db, "auctionTestPublic", id))
  ).data();
  assert.equal(publicLot.price, 160);
  assert.equal(publicLot.count, 2);
  assert.equal(publicLot.entries, undefined);
  await assert.rejects(
    setDoc(doc(buyer.db, "auctionTestPublic", id), { price: 1 }),
  );
  await assert.rejects(getDoc(doc(buyer.db, "auctionTestWallets", rival.uid)));
  await assert.rejects(buyer.call({ id, action: "close" }));
  // Advance the fixture deadline. Run the same scheduled handler deployed in staging.
  await Promise.all(
    ["Lots", "Public"].map((c) =>
      adb
        .doc("auctionTest" + c + "/" + id)
        .update(
          c === "Public"
            ? { end: Date.now() - 1, closesAt: Date.now() - 1 }
            : { end: Date.now() - 1 },
        ),
    ),
  );
  process.env.GCLOUD_PROJECT = projectId;
  process.env.FUNCTIONS_EMULATOR = "true";
  const scheduled = require("./auctions")(adb, {}).souqnaAuctionTestClose;
  await scheduled.run({});
  await scheduled.run({});
  assert.equal(
    (await adb.doc("auctionTestWallets/" + rival.uid).get()).get(
      "USD.available",
    ),
    25000,
  );
  await buyer.call({ id, action: "dispute", text: "مراجعة حالة السلعة" });
  await assert.rejects(buyer.call({ id, action: "confirm" }));
  await boss.call({
    id,
    action: "resolve",
    target: buyer.uid,
    text: "تمت المعاينة",
  });
  await buyer.call({ id, action: "confirm" });
  await seller.call({ id, action: "confirm" });
  assert.equal(
    (await adb.doc("auctionTestPublic/" + id).get()).get("status"),
    "completed",
  );
  assert.equal(
    (await adb.doc("auctionTestWallets/" + buyer.uid).get()).get(
      "USD.available",
    ),
    24840,
  );
  assert.equal((await adb.doc("users/" + buyer.uid).get()).get("stars"), 17);
});
