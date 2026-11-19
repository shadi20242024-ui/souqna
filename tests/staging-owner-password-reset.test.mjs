import assert from "node:assert/strict";
import {test} from "node:test";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const path=new URL("../functions/reset-staging-owner-password.cjs",import.meta.url);
const source=readFileSync(path,"utf8");
const run=(args=[],input="",extra={})=>spawnSync(process.execPath,[fileURLToPath(path),...args],{
  encoding:"utf8",input,timeout:12000,env:{...process.env,...extra}
});
test("staging owner password reset is safe by default and never uses production",()=>{
  assert.match(source,/const PROJECT="souqna-staging"/);
  assert.match(source,/const ACCOUNT_EMAIL="shadi20242024@gmail.com"/);
  assert.match(source,/auth\.getUserByEmail\(ACCOUNT_EMAIL\)/);
  assert.match(source,/auth\.updateUser\(user.uid,\{password\}\)/);
  assert.doesNotMatch(source,/deleteUser\(|createUser\(|setCustomUserClaims\(/);
  assert.ok(source.includes("process.stdin"));
  assert.ok(!source.includes("souqna-sweida.firebaseapp.com"));
  const dry=run();
  assert.equal(dry.status,0,dry.stderr);
  assert.match(dry.stdout,/DRY RUN/);
  assert.match(dry.stdout,/No connection to Firebase/);
});
test("staging owner reset refuses missing approval, emulator and weak secrets",()=>{
  const wrong=run(["--execute","--confirm","OTHER-APPROVAL"],"superStrongPassword123\n");
  assert.notEqual(wrong.status,0);
  const emu=run([],undefined,{FIREBASE_AUTH_EMULATOR_HOST:"localhost:9099"});
  assert.notEqual(emu.status,0);
  const bad=run(["--execute","--confirm","RESET-OWNER-PASSWORD:souqna-staging"],"weak\n");
  assert.notEqual(bad.status,0);
  assert.doesNotMatch(bad.stderr,/weak/);
});
