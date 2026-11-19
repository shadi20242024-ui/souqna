import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeAdmin } from "../assets/admin-metrics.js";

test("Dashboard uses only Firestore records and separates stars from revenue", () => {
  const now = 1763300000000;
  const source = {
    ads: [
      {status:"approved",featuredUntil:now+5000},
      {status:"approved",featuredUntil:now-1000},
      {status:"pending",featuredUntil:now+5000}
    ],
    stores: [
      {status:"approved",plan:"gold",planUntil:now+100000},
      {status:"approved",plan:"free",planUntil:now+100000},
      {status:"pending",plan:"gold",planUntil:now+100000}
    ],
    pend:[{status:"pending"},{status:"approved"}],
    pendStores:[{status:"pending"}],
    sorders:[{status:"new"},{status:"progress"},{status:"done"}],
    sp:[
      {active:true,from:now-10,to:now+30},
      {active:true,from:now-10,to:now-1},
      {active:true,from:now+30,to:now+40}
    ],
    orders:[{status:"pending"}],
    promos:[{status:"pending"},{status:"done"}],
    subs:[{status:"pending"}],
    pendingSponsorRequests:[{status:"pending"}],
    users:[{stars:12},{stars:4},{stars:0}],
    transactions:[
      {type:"credit",amount:20},
      {type:"credit",amount:5},
      {type:"debit",amount:-9},
      {type:"debit",amount:-1}
    ],
    isOwner:true
  };
  const stats=summarizeAdmin(source,now);
  assert.deepEqual(stats.publicStats,{
    publishedAds:2,publishedStores:2,featuredAds:1,activeStorePlans:1,activeSponsors:1
  });
  assert.deepEqual(stats.pending,{ads:1,stores:1,serviceOrders:2,finance:4});
  assert.deepEqual(stats.owner,{
    users:3,walletStars:16,creditedStars:25,debitedStars:10,ledgerEntries:4
  });
  assert.ok(!Object.hasOwn(stats,"revenue"),"Star credits must never imply verified USD revenue");
});

test("Staff summaries conceal sensitive owner-only wallet and account data", () => {
  const result=summarizeAdmin({
    ads:[],stores:[],pend:[],pendStores:[],sorders:[],sp:[],
    users:[{stars:999999}],transactions:[{amount:10}],
    orders:[{status:"pending"}],isOwner:false
  },Date.now());
  assert.equal(result.owner,null);
  assert.equal(result.pending.finance,null);
  assert.equal(result.publicStats.publishedAds,0);
});
