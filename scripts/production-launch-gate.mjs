import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
export const OWNER_GATES=Object.freeze([
  {key:"legal",env:"SOUQNA_SIGNOFF_LEGAL",expected:"approved",description:"Legal/operator/contact/refund policy signed off"},
  {key:"billing",env:"SOUQNA_SIGNOFF_BILLING",expected:"approved",description:"Cloud Functions billing and operating limits approved"},
  {key:"backup",env:"SOUQNA_SIGNOFF_BACKUP",expected:"restored",description:"Firestore backup and isolated restore drill completed"},
  {key:"domain",env:"SOUQNA_SIGNOFF_DOMAIN",expected:"verified",description:"Production DNS/HTTPS/Auth authorized domains checked"},
  {key:"payments",env:"SOUQNA_SIGNOFF_PAYMENTS",expected:"verified",description:"Manual receipts, refunds and administrative reconciliation tested"},
  {key:"security",env:"SOUQNA_SIGNOFF_SECURITY",expected:"approved",description:"Security and abuse-reporting acceptance completed"},
  {key:"release",env:"SOUQNA_SIGNOFF_PRODUCTION",expected:"souqna-sweida",description:"Owner approved EXACT production project"}
]);

export function evaluateLaunch({branch,clean,build,staging,signoffs}){
  const checks=[
    {key:"branch",status:branch==="main"?"PASS":"BLOCKED"},
    {key:"clean",status:clean?"PASS":"BLOCKED"},
    {key:"production-build",status:build?"PASS":"BLOCKED"},
    {key:"live-staging",status:staging?"PASS":"BLOCKED"},
    ...OWNER_GATES.map(gate=>({
      key:"signoff-"+gate.key,
      status:signoffs?.[gate.env]===gate.expected?"OWNER_ATTESTED":"NOT_ATTESTED"
    }))
  ];
  const ready=checks.every(c=>c.status==="PASS"||c.status==="OWNER_ATTESTED");
  return {
    project:"souqna-sweida",
    ready_for_manual_release:ready,
    production_deployed:false,
    checks,
    message:ready?
      "All local checks and owner-reported gates are satisfied. Separate authenticated deployment and live verification are still required.":
      "BLOCKED: Do not deploy to souqna-sweida. Complete required checks and sign-offs."
  };
}

function run(program,args,timeout=180000){
  const p=spawnSync(program,args,{cwd:root,encoding:"utf8",timeout,maxBuffer:512*1024,env:process.env});
  if(p.error)return {ok:false,detail:p.error.code||"unavailable"};
  return {ok:p.status===0,detail:p.status===0?"PASS":"FAILED"};
}
function main(){
  if(process.argv.length!==2)throw new Error("No project or deployment arguments permitted.");
  const branch=run("git",["rev-parse","--abbrev-ref","HEAD"],15000);
  const branchName=branch.ok?spawnSync("git",["branch","--show-current"],{cwd:root,encoding:"utf8",timeout:15000}).stdout.trim():"UNVERIFIED";
  const clean=run("git",["status","--porcelain"],15000);
  const cleanliness=clean.ok?
    spawnSync("git",["status","--porcelain"],{cwd:root,encoding:"utf8",timeout:15000}).stdout.trim()==="":false;
  const build=run(process.execPath,[join(root,"scripts","preflight-production.mjs")],30000);
  const staging=branchName==="main"&&cleanliness&&build.ok?
    run(process.execPath,[join(root,"scripts","staging-readiness.mjs")],180000):{ok:false,detail:"NOT_ATTEMPTED"};
  const report=evaluateLaunch({branch:branchName,clean:cleanliness,build:build.ok,staging:staging.ok,signoffs:process.env});
  const artifacts=join(root,"artifacts");
  mkdirSync(artifacts,{recursive:true});
  const outfile=join(artifacts,"production-launch-readiness.json");
  writeFileSync(outfile,JSON.stringify({...report,checkedAt:new Date().toISOString()},null,2)+"\n","utf8");
  for(const check of report.checks)console.log(check.status+" "+check.key);
  console.log("SOUQNA PRODUCTION GO/NO-GO: "+(report.ready_for_manual_release?"MANUAL RELEASE ELIGIBLE":"BLOCKED"));
  console.log(report.message);
  console.log("Local, non-secret report: "+outfile);
  if(!report.ready_for_manual_release)process.exitCode=2;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{main()}catch(error){console.error("SOUQNA PRODUCTION GATE ERROR: "+error.message);process.exitCode=1;}
}
