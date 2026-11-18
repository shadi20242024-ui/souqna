import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECKS, STAGING_ID, buildReadiness, formatStatus } from "../scripts/staging-readiness.mjs";

test("release gate requires all three staging checks",()=>{
  assert.equal(STAGING_ID,"souqna-staging");
  assert.deepEqual(CHECKS.map(x=>x.key),["hosting","functions","admin"]);
  assert.equal(buildReadiness(CHECKS.map(x=>formatStatus(x,0))).ready,true);
  assert.equal(buildReadiness([formatStatus(CHECKS[0],0)]).ready,false);
});
test("missing admin email can never count as staging ready",()=>{
  const statuses=[formatStatus(CHECKS[0],0),formatStatus(CHECKS[1],0),formatStatus(CHECKS[2],null)];
  assert.equal(statuses[2].status,"NOT_VERIFIED");
  assert.equal(buildReadiness(statuses).ready,false);
});
test("failed cloud check blocks ready status without attempting writes",()=>{
  const statuses=[formatStatus(CHECKS[0],0),formatStatus(CHECKS[1],1),formatStatus(CHECKS[2],0)];
  assert.equal(statuses[1].status,"BLOCKED");
  assert.equal(buildReadiness(statuses).ready,false);
  assert.ok(CHECKS.every(x=>x.command.endsWith(".mjs")));
});
