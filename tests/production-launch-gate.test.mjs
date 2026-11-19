import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateLaunch, OWNER_GATES } from "../scripts/production-launch-gate.mjs";

const approved=Object.fromEntries(OWNER_GATES.map(gate=>[gate.env,gate.expected]));
const passed={branch:"main",clean:true,build:true,staging:true,uat:true,signoffs:approved};

test("launch gate cannot approve production without staging and separate owner sign-offs",()=>{
  const result=evaluateLaunch(passed);
  assert.equal(result.ready_for_manual_release,true);
  assert.equal(result.production_deployed,false);
  assert.equal(result.project,"souqna-sweida");
  assert.equal(result.checks.length,5+OWNER_GATES.length);
  assert.equal(result.checks.filter(x=>x.status==="OWNER_ATTESTED").length,OWNER_GATES.length+1);
});
test("release candidate and unsafe working trees are fail closed",()=>{
  for(const change of [
    {branch:"feature/legal-help-2026-11-19"},
    {clean:false},{build:false},{staging:false},{uat:false}
  ]){
    const result=evaluateLaunch({...passed,...change});
    assert.equal(result.ready_for_manual_release,false);
    assert.match(result.message,/BLOCKED/);
  }
});
test("production readiness must include separate 19-case staging UAT",()=>{
  const report=evaluateLaunch({...passed,uat:false});
  assert.equal(report.ready_for_manual_release,false);
  assert.ok(report.checks.some(x=>x.key==="operator-staging-uat"&&x.status==="NOT_ATTESTED"));
});
test("owner must confirm customer support inbox before release eligibility",()=>{
  const support=OWNER_GATES.find(gate=>gate.key==="support");
  assert.ok(support);
  assert.equal(support.env,"SOUQNA_SIGNOFF_SUPPORT");
  assert.equal(support.expected,"verified");
  const missing={...approved};
  delete missing.SOUQNA_SIGNOFF_SUPPORT;
  assert.equal(evaluateLaunch({...passed,signoffs:missing}).ready_for_manual_release,false);
});
test("every launch signoff is mandatory, and no signoff proves a deployment",()=>{
  for(const gate of OWNER_GATES){
    const altered={...approved,[gate.env]:""};
    const result=evaluateLaunch({...passed,signoffs:altered});
    assert.equal(result.ready_for_manual_release,false);
    assert.ok(result.checks.some(x=>x.key==="signoff-"+gate.key&&x.status==="NOT_ATTESTED"));
    assert.equal(result.production_deployed,false);
  }
});
