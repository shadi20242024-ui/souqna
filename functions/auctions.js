"use strict";
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getAuth } = require("firebase-admin/auth");
const { createHash } = require("node:crypto");
const C = require("./auction-core");
module.exports = function auctions(db, options) {
  const permitted = () =>
    process.env.GCLOUD_PROJECT === "souqna-staging" ||
    (process.env.FUNCTIONS_EMULATOR === "true" &&
      /^demo-/.test(process.env.GCLOUD_PROJECT || ""));
  const col = (name) => db.collection("auctionTest" + name);
  const ref = (name, id) => col(name).doc(C.safeId(id));
  const hash = (...parts) =>
    createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  const settings = ref("Settings", "catalog");
  const error = (m) => new HttpsError("failed-precondition", m);
  async function run(actor, d) {
    const id = C.safeId(d.id),
      lot = ref("Lots", id),
      key = hash(actor.uid, C.safeId(d.requestId));
    const audit = ref("Audit", key);
    return db.runTransaction(async (tx) => {
      const now = Date.now();
      const [prior, item, user, assignment, catalog] = await Promise.all([
        tx.get(audit),
        tx.get(lot),
        tx.get(db.collection("users").doc(actor.uid)),
        tx.get(ref("Staff", actor.uid)),
        tx.get(settings),
      ]);
      if (prior.exists) {
        C.check(prior.get("signature") === hash(d), "تعارض معرف الطلب");
        return { ok: true };
      }
      actor.admin = user.get("role") === "admin";
      actor.staff = actor.admin || assignment.get("enabled") === true;
      const cats = catalog.get("categories") || C.categories;
      let a = item.data(),
        movements = [],
        events = [];
      if (d.action === "assign") {
        C.check(actor.admin, "يتطلب صلاحية المدير العام");
        C.check(
          (await tx.get(db.collection("users").doc(C.safeId(d.target)))).exists,
          "الحساب غير موجود",
        );
        tx.set(ref("Staff", d.target), { enabled: d.enabled === true });
      } else if (d.action === "category") {
        C.check(actor.admin, "يتطلب صلاحية المدير العام");
        const name = C.label(d.name, 60);
        C.check(
          !cats.includes(name) && cats.length < 100,
          "تصنيف مكرر أو اكتمل العدد",
        );
        tx.set(settings, { categories: [...cats, name] });
      } else if (d.action === "enroll") {
        C.check(actor.verified && user.exists, "يجب توثيق حساب سوقنا");
        const w = ref("Wallets", actor.uid);
        C.check(!(await tx.get(w)).exists, "المحفظة التجريبية مفعلة");
        tx.create(w, C.funds());
        movements = Object.entries(C.funds()).map(([currency, b]) => ({
          currency,
          uid: actor.uid,
          ...b,
          type: "demo_credit",
        }));
      } else if (d.action === "save") {
        C.check(
          actor.staff && (!a || a.status === "draft"),
          "يقتصر التعديل على المسودات",
        );
        a = C.init(C.draft(d.lot, cats));
        C.check(
          (await tx.get(db.collection("users").doc(a.seller))).exists,
          "حساب البائع غير موجود",
        );
        const mediaIds = [...new Set([...a.photos, ...(a.pdf ? [a.pdf] : [])])];
        if (mediaIds.length) {
          const files = await tx.getAll(
            ...mediaIds.map((id) => lot.collection("media").doc(id)),
            { fieldMask: ["mime"] },
          );
          files.forEach((file) =>
            C.check(
              file.exists &&
                (file.id === a.pdf
                  ? file.get("mime") === "application/pdf"
                  : file.get("mime")?.startsWith("image/")),
              "مرفق غير موجود",
            ),
          );
        }
        tx.set(lot, a);
      } else if (d.action === "media") {
        C.check(
          actor.staff && (!a || a.status === "draft"),
          "المرفقات للمسودات فقط",
        );
        C.check(
          typeof d.bytes === "string" &&
            d.bytes.length <= 880000 &&
            /^[A-Za-z0-9+/]+=*$/.test(d.bytes),
          "حجم أو تنسيق غير صالح",
        );
        const b = Buffer.from(d.bytes, "base64");
        const magic = {
          "image/jpeg": b[0] === 255 && b[1] === 216,
          "image/png": b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
          "image/webp":
            b.toString("ascii", 0, 4) === "RIFF" &&
            b.toString("ascii", 8, 12) === "WEBP",
          "application/pdf": b.toString("ascii", 0, 5) === "%PDF-",
        };
        C.check(magic[d.mime] === true, "نوع الملف غير مدعوم");
        tx.set(lot.collection("media").doc(C.safeId(d.file)), {
          mime: d.mime,
          bytes: d.bytes,
        });
      } else if (d.action === "dispute" || d.action === "resolve") {
        C.check(a, "المزاد غير موجود");
        const issue = ref("Issues", hash(id, C.safeId(d.target || actor.uid)));
        if (d.action === "resolve") {
          C.check(
            actor.staff && (await tx.get(issue)).get("status") === "open",
            "شكوى غير مفتوحة",
          );
          tx.update(issue, {
            status: "resolved",
            resolution: C.label(d.text, 800),
          });
        } else {
          C.check(
            !d.target &&
              [a.seller, ...a.entries.map((e) => e.uid)].includes(actor.uid),
            "الشكوى لأطراف المزاد",
          );
          C.check(!(await tx.get(issue)).exists, "الشكوى مسجلة");
          tx.create(issue, {
            id,
            uid: actor.uid,
            text: C.label(d.text, 800),
            status: "open",
            time: now,
          });
        }
      } else {
        C.check(a, "المزاد غير موجود");
        if (d.action === "publish")
          C.check(
            (await tx.get(ref("Wallets", a.seller))).exists,
            "يجب أن يفعّل البائع محفظة الاختبار قبل النشر",
          );
        if (d.action === "confirm") {
          const issues = await Promise.all(
            [a.seller, a.leader].map((uid) =>
              tx.get(ref("Issues", hash(id, uid))),
            ),
          );
          C.check(
            !issues.some((x) => x.get("status") === "open"),
            "التسوية معلقة لحين حل النزاع",
          );
        }
        if (d.action === "bid") {
          C.check(user.exists, "حساب سوقنا مطلوب");
          const w = (await tx.get(ref("Wallets", actor.uid))).data()?.[
            a.currency
          ];
          const held = a.entries.some((e) => e.uid === actor.uid)
            ? a.deposit
            : 0;
          C.check(
            w && d.amount <= w.available + held,
            "المبلغ يتجاوز الرصيد الافتراضي",
          );
        }
        ({ movements, events } = C.apply(a, actor, d, now));
        const accounts = new Map();
        for (const m of movements) {
          const r = ref("Wallets", m.uid);
          if (!accounts.has(m.uid)) {
            const w = await tx.get(r);
            C.check(w.exists, "يجب تفعيل محفظة الاختبار");
            accounts.set(m.uid, w.data());
          }
          accounts.set(m.uid, C.wallet(accounts.get(m.uid), m));
        }
        for (const [uid, b] of accounts) tx.set(ref("Wallets", uid), b);
        tx.set(lot, a);
        tx.set(ref("Public", id), {
          ...C.view(a),
          id,
          ...(a.status === "published" ? { closesAt: a.end } : {}),
        });
        if (d.action === "bid")
          tx.create(ref("Public", id).collection("history").doc(key), {
            time: now,
            price: a.price,
            count: a.count,
          });
      }
      for (const [i, e] of events.entries()) {
        const message = {
          userId: e.uid,
          text: e.text + " · " + a.title,
          createdAt: now,
        };
        tx.create(db.collection("notifs").doc(key + "-" + i), {
          ...message,
          read: false,
        });
        tx.create(ref("WhatsAppOutbox", key + "-" + i), {
          ...message,
          lotId: id,
          status: "test_only",
          deliveryEnabled: false,
        });
      }
      tx.create(ref("Reports", key), {
        id,
        uid: actor.uid,
        time: now,
        action: d.action,
        movements,
        price: a?.price || 0,
      });
      tx.create(audit, {
        id,
        uid: actor.uid,
        action: d.action,
        time: now,
        signature: hash(d),
        movements,
        ...(d.action === "bid"
          ? { mode: d.mode, amount: d.amount, price: a.price }
          : {}),
        ...(d.action === "assign"
          ? { target: d.target, enabled: d.enabled === true }
          : {}),
      });
      return { ok: true };
    });
  }
  const call = onCall(options, async (req) => {
    if (!permitted())
      throw error("مزادات الاختبار متاحة في البيئة التجريبية فقط");
    if (!req.auth) throw new HttpsError("unauthenticated", "سجل الدخول");
    const uid = req.auth.uid,
      d = req.data || {};
    try {
      if (d.action === "position") {
        const a = (await ref("Lots", d.id).get()).data();
        return {
          party: !!a && [a.seller, a.leader].includes(uid),
          leading: a?.leader === uid,
          confirmed: a?.confirmations?.includes(uid) || false,
        };
      }
      if (d.action === "session") {
        const [u, s, w] = await Promise.all([
          db.collection("users").doc(uid).get(),
          ref("Staff", uid).get(),
          ref("Wallets", uid).get(),
        ]);
        return {
          uid,
          admin: u.get("role") === "admin",
          staff: u.get("role") === "admin" || s.get("enabled") === true,
          wallet: w.data() || null,
        };
      }
      const acc = await getAuth().getUser(uid);
      C.check(!acc.disabled, "الحساب معطل");
      const verified =
        acc.emailVerified ||
        !!(acc.phoneNumber && acc.phoneNumber === req.auth.token.phone_number);
      return await run({ uid, verified, system: false }, d);
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      throw error(e.code ? "تعذرت العملية، أعد المحاولة" : e.message);
    }
  });
  const close = onSchedule(
    { ...options, schedule: "every 1 minutes" },
    async () => {
      if (!permitted()) return;
      const due = await col("Public")
        .where("closesAt", "<=", Date.now())
        .limit(50)
        .get();
      const results = await Promise.allSettled(
        due.docs.map((x) =>
          run(
            { uid: "scheduler", system: true },
            { action: "close", id: x.id, requestId: hash("close", x.id) },
          ),
        ),
      );
      if (results.some((x) => x.status === "rejected"))
        throw Error("Auction close needs retry");
    },
  );
  return { souqnaAuctionTest: call, souqnaAuctionTestClose: close };
};
