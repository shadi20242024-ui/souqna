import assert from "node:assert/strict";
import test from "node:test";
import C from "../functions/auction-core.js";
const base = {
  title: "مزاد",
  description: "اختبار",
  seller: "seller",
  currency: "USD",
  category: C.categories[0],
  start: 1000,
  end: 100000,
  opening: 100,
  step: 10,
  reserve: 150,
  deposit: 20,
  fee: 0,
  commission: 5,
  photos: [],
  videos: [],
  stream: "",
  pdf: "",
};
const actor = (uid) => ({ uid, verified: true });
function opened(d = {}) {
  const a = C.init(C.draft({ ...base, ...d }, C.categories));
  C.apply(a, { uid: "staff", staff: true }, { action: "publish" }, 1);
  return a;
}
const bid = (a, id, amount, mode, now = 2000) =>
  C.apply(a, actor(id), { action: "bid", amount, mode }, now);
test("proxy tie, reserve, one hold, extension, refund and two-party settlement", () => {
  const a = opened(),
    w = Object.fromEntries(["a", "b", "seller"].map((k) => [k, C.funds()]));
  const post = ({ movements }) =>
    movements.forEach((m) => (w[m.uid] = C.wallet(w[m.uid], m)));
  post(bid(a, "a", 200, "auto"));
  assert.equal(a.price, 150);
  post(bid(a, "b", 180, "manual", 70000));
  assert.equal(a.end, 160000);
  assert.equal(a.price, 190);
  post(bid(a, "b", 200, "auto", 73000));
  assert.equal(a.leader, "a");
  assert.equal(a.price, 200);
  assert.equal(w.b.USD.held, 20);
  for (const k of ["entries", "leader", "seller", "reserve"])
    assert.equal(k in C.view(a), false);
  post(
    C.apply(a, { uid: "scheduler", system: true }, { action: "close" }, 160000),
  );
  assert.equal(w.b.USD.available, 25000);
  post(C.apply(a, actor("seller"), { action: "confirm" }, 160001));
  assert.equal(a.status, "awarded");
  assert.throws(() =>
    C.apply(a, actor("seller"), { action: "confirm" }, 160002),
  );
  post(C.apply(a, actor("a"), { action: "confirm" }, 160003));
  assert.equal(a.status, "completed");
  assert.equal(w.a.USD.available, 24800);
  assert.equal(w.a.USD.held, 0);
  assert.equal(w.seller.USD.available, 25190);
});
test("server clock, seller, staff, verification, insufficient funds, reserve and limits", () => {
  const a = opened();
  for (const t of [999, 100000])
    assert.throws(() => bid(a, "a", 100, "manual", t));
  for (const u of [
    actor("seller"),
    { uid: "a" },
    { ...actor("a"), staff: true },
  ])
    assert.throws(() =>
      C.apply(a, u, { action: "bid", mode: "manual", amount: 100 }, 2000),
    );
  bid(a, "b", 110, "manual");
  assert.throws(() => bid(a, "a", 119, "manual"));
  const r = C.apply(
    a,
    { uid: "scheduler", system: true },
    { action: "close" },
    100000,
  );
  assert.equal(a.status, "unsold");
  assert.equal(r.movements[0].available, 20);
  assert.throws(() =>
    C.wallet({}, { currency: "USD", available: -20, held: 20 }),
  );
  for (const override of [
    { photos: Array(31).fill("x") },
    { videos: Array(6).fill("https://example.com") },
    { videos: ["javascript:void(0)"] },
    { start: 100001 },
  ])
    assert.throws(() => C.draft({ ...base, ...override }, C.categories));
});
