import assert from "node:assert/strict";
import {test} from "node:test";
import { UAT_PROJECT,UAT_CASES,makeUatTemplate,evaluateUat } from "../scripts/staging-uat.mjs";

const now=new Date("2026-11-19T12:00:00Z");
const complete=()=>{
 const template=makeUatTemplate();
 return {...template,cases:template.cases.map(x=>({...x,status:"pass",testedAt:"2026-11-19T11:00:00.000Z",note:"Passed with isolated staging demo records"}))};
};

test("operator acceptance defaults to not tested and only targets staging",()=>{
 const draft=makeUatTemplate();
 assert.equal(draft.project,UAT_PROJECT);
 assert.equal(draft.project,"souqna-staging");
 assert.equal(draft.cases.length,UAT_CASES.length);
 assert.ok(draft.cases.every(c=>c.status==="not_tested"&&!c.note&&!c.testedAt));
 assert.equal(evaluateUat(draft,now).ready,false);
 assert.equal(evaluateUat({...draft,project:"souqna-sweida"},now).issue,"INVALID_UAT_REPORT");
});

test("all relevant workflows require recent non-secret operator evidence",()=>{
 const result=evaluateUat(complete(),now);
 assert.equal(result.ready,true);
 assert.equal(result.checks.length,UAT_CASES.length);
 assert.ok(result.checks.every(c=>c.status==="PASS"));
 for(const id of ["registration_failure","star_receipts","support_privacy","backup_restore","recovery","cloud_integrations"])
   assert.ok(UAT_CASES.some(c=>c.id===id));
});

test("incomplete or fake checklists block release",()=>{
 const valid=complete();
 for(const [patch,description] of [
   [x=>{x.cases[0].status="fail"},"failed"],
   [x=>{x.cases[0].status="not_tested"},"not tested"],
   [x=>{x.cases[0].testedAt="2025-01-01T12:00:00Z"},"stale"],
   [x=>{x.cases[0].testedAt="2027-01-01T12:00:00Z"},"future"],
   [x=>{x.cases[0].note="x"},"empty evidence"],
   [x=>{x.cases[0].note="password: secrettext"},"credentials"]
 ]){
   const candidate=structuredClone(valid);
   patch(candidate);
   assert.equal(evaluateUat(candidate,now).ready,false,description);
 }
});

test("duplicate, missing or extra acceptance cases fail closed",()=>{
 const source=complete();
 assert.equal(evaluateUat({...source,cases:source.cases.slice(1)},now).issue,"UAT_CASE_COUNT_MISMATCH");
 const duplicate=structuredClone(source);
 duplicate.cases[1].id=duplicate.cases[0].id;
 assert.equal(evaluateUat(duplicate,now).issue,"UNKNOWN_OR_DUPLICATE_CASE");
 const unknown=structuredClone(source);
 unknown.cases[0].id="production_smoke";
 assert.equal(evaluateUat(unknown,now).issue,"UNKNOWN_OR_DUPLICATE_CASE");
});
