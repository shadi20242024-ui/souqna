import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";

export const STAGING_ID = "souqna-staging";
export const CHECKS = Object.freeze([
  { key:"hosting", label:"Published Firebase Hosting", command:"check-staging-hosting.mjs" },
  { key:"functions", label:"Cloud Functions", command:"check-staging-services.mjs" },
  { key:"legal", label:"Published Firestore legal consent rules", command:"check-staging-legal.mjs" },
  { key:"admin", label:"Administrator profile", command:"diagnose-staging-admin.mjs", optionalEnv:"SOUQNA_ADMIN_EMAIL" },
  { key:"categories", label:"Ten approved marketplace categories", command:"check-staging-categories.mjs" }
]);

export function formatStatus(check, code) {
  return { key:check.key, label:check.label, status:code===0?"PASS":code===null?"NOT_VERIFIED":"BLOCKED" };
}

export function buildReadiness(checks) {
  const ready=checks.length===CHECKS.length && checks.every(x=>x.status==="PASS");
  return { project:STAGING_ID, ready, checks, next:ready?"Ready for staging acceptance testing":"Do not deploy production or declare staging ready" };
}

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
function main(){
  if(process.argv.length!==2)throw new Error("No project arguments allowed.");
  if(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST)
    throw new Error("Unset emulator variables before inspecting real staging.");

  const checks=[];
  for(const task of CHECKS){
    if(task.optionalEnv && !process.env[task.optionalEnv]){
      checks.push(formatStatus(task,null));
      console.log(task.key+": NOT_VERIFIED (set "+task.optionalEnv+" locally; never send passwords)");
      continue;
    }
    const child=spawnSync(process.execPath,[resolve(root,"scripts",task.command)],{
      cwd:root, env:process.env, encoding:"utf8",timeout:90000,maxBuffer:256*1024
    });
    if(child.error)console.error(task.key+": "+(child.error.code||"execution-failed"));
    if(child.stdout)process.stdout.write(child.stdout);
    if(child.stderr)process.stderr.write(child.stderr);
    checks.push(formatStatus(task,child.status===0?0:1));
  }
  const output=buildReadiness(checks);
  console.log("\nSOUQNA STAGING READINESS: "+(output.ready?"READY":"NOT VERIFIED"));
  for(const c of output.checks)console.log(c.key+": "+c.status);
  console.log(output.next);
  if(process.env.SOUQNA_READINESS_REPORT==="1"){
    const directory=resolve(root,"artifacts");
    mkdirSync(directory,{recursive:true});
    writeFileSync(resolve(directory,"staging-readiness.json"),JSON.stringify(output,null,2)+"\n");
    console.log("Saved local report: artifacts/staging-readiness.json");
  }
  if(!output.ready)process.exitCode=2;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{main()}catch(error){console.error("STAGING READINESS ERROR: "+error.message);process.exitCode=1;}
}
