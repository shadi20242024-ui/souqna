import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const script=resolve("scripts/seed-staging.mjs");
const run=(...args)=>spawnSync(process.execPath,[script,...args],{
  encoding:"utf8",env:{...process.env,GOOGLE_APPLICATION_CREDENTIALS:"",FIRESTORE_EMULATOR_HOST:""}
});

test("Staging bootstrap defaults to dry run and never allows production",()=>{
  const dry=run("--project","souqna-staging");
  assert.equal(dry.status,0,dry.stderr);
  assert.ok(dry.stdout.includes("DRY RUN ONLY"));
  assert.ok(dry.stdout.includes("24"));
  assert.ok(!dry.stdout.includes("SEED COMPLETED"));
  assert.notEqual(run("--project","souqna-sweida").status,0);
  assert.notEqual(run("--project","souqna-staging-example").status,0,"Incorrect staging project must be refused even in dry run");
  assert.notEqual(run("--project","souqna-sweida","--execute",
    "--confirm","SEED:souqna-sweida").status,0);
  assert.notEqual(run("--project","souqna-staging","--execute",
    "--confirm","SEED:wrong-project").status,0);
  assert.notEqual(run("--project","souqna-staging","--execute",
    "--confirm","SEED:souqna-staging").status,0,
    "Execution with no explicit application credentials must fail");
});

test("Initial staging administrator provisioning is dry-run only by default",()=>{
  const admin=resolve("functions/bootstrap-staging-admin.cjs");
  const attempt=(...args)=>spawnSync(process.execPath,[admin,...args],{
    encoding:"utf8",env:{...process.env,GOOGLE_APPLICATION_CREDENTIALS:"",FIRESTORE_EMULATOR_HOST:""}
  });
  const dry=attempt("--project","souqna-staging-example","--email","owner@example.test");
  assert.equal(dry.status,0,dry.stderr);
  assert.ok(dry.stdout.includes("DRY RUN ONLY"));
  assert.notEqual(attempt("--project","souqna-sweida","--email","owner@example.test").status,0);
  assert.notEqual(attempt("--project","souqna-staging-example","--email","owner@example.test",
    "--execute","--confirm","ADMIN:wrong-project:owner@example.test").status,0);
  assert.notEqual(attempt("--project","souqna-staging-example","--email","owner@example.test",
    "--execute","--confirm","ADMIN:souqna-staging-example:owner@example.test").status,0,
    "Missing staging credentials must not grant administrator access");
});

test("Manual staging admin UID bootstrap requires explicit owner verification and project match",()=>{
  const admin=resolve("functions/bootstrap-staging-admin.cjs");
  const runAdmin=(...args)=>spawnSync(process.execPath,[admin,...args],{
    encoding:"utf8",env:{...process.env,GOOGLE_APPLICATION_CREDENTIALS:"",FIRESTORE_EMULATOR_HOST:""}
  });
  const base=["--project","souqna-staging","--email","owner@example.test","--uid","firebaseExampleUID_123456"];
  const dry=runAdmin(...base);
  assert.equal(dry.status,0,dry.stderr);
  assert.match(dry.stdout,/Verify UID and email/);
  assert.match(dry.stdout,/DRY RUN ONLY/);
  assert.notEqual(runAdmin(...base,"--execute","--confirm",
    "ADMIN:souqna-staging:owner@example.test:firebaseExampleUID_123456").status,0,
    "Manual UID bootstrap requires an explicit console verification flag");
  assert.notEqual(runAdmin(...base,"--execute","--verified-in-console","--confirm",
    "ADMIN:souqna-staging:owner@example.test:wrongUID").status,0,
    "Manual UID bootstrap requires an exact project/email/UID confirmation");
  assert.notEqual(runAdmin("--project","souqna-sweida","--email","owner@example.test",
    "--uid","firebaseExampleUID_123456").status,0,
    "Manual UID mode must never allow production");
  assert.notEqual(runAdmin("--project","souqna-other-project","--email","owner@example.test",
    "--uid","firebaseExampleUID_123456").status,0,
    "Manual UID mode must be restricted to SOUQNA staging");
  assert.notEqual(runAdmin("--project","souqna-staging","--email","owner@example.test",
    "--uid","bad").status,0,"Short/invalid UIDs must be rejected");
  assert.notEqual(runAdmin(...base,"--execute","--verified-in-console","--confirm",
    "ADMIN:souqna-staging:owner@example.test:firebaseExampleUID_123456").status,0,
    "Manual UID mode still requires explicit credentials");
});
