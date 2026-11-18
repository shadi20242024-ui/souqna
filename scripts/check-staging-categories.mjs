import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_CATEGORIES, STAGING } from "./upgrade-staging-categories.mjs";

export function evaluateCategories(rawDocuments) {
  assert.ok(Array.isArray(rawDocuments), "Firestore category documents must be an array.");
  const found=new Map();
  for(const entry of rawDocuments) {
    const path=String(entry?.name||"");
    const id=path.substring(path.lastIndexOf("/")+1);
    if(!/^[a-z0-9_]{1,60}$/.test(id)||found.has(id))continue;
    const fields=entry.fields||{};
    found.set(id,{
      name_ar:String(fields.name_ar?.stringValue||""),
      active:fields.active?.booleanValue===true,
      order:Number(fields.order?.integerValue||0)
    });
  }
  const categories=REQUIRED_CATEGORIES.map(([id,name_ar,order])=>{
    const actual=found.get(id);
    return {id,name_ar,order,status:!actual?"MISSING":actual.active?"ACTIVE":"INACTIVE"};
  });
  return {
    project:STAGING,
    active:categories.filter(c=>c.status==="ACTIVE").length,
    expected:REQUIRED_CATEGORIES.length,
    categories,
    ready:categories.every(c=>c.status==="ACTIVE"),
    extra:[...found.keys()].filter(id=>!categories.some(c=>c.id===id))
  };
}

export async function fetchCategories(config,fetcher=fetch) {
  assert.ok(config&&typeof config==="object", "Missing Firebase web app config.");
  assert.equal(config.projectId,STAGING,"Only the souqna-staging project is allowed.");
  assert.equal(config.authDomain,STAGING+".firebaseapp.com","Wrong Firebase Authentication domain.");
  assert.ok(typeof config.apiKey==="string"&&/^[\w-]{20,160}$/.test(config.apiKey),
    "Staging Firebase public Web API key is missing or invalid.");
  const endpoint="https://firestore.googleapis.com/v1/projects/"+STAGING+"/databases/(default)/documents/categories";
  let nextPageToken="",documents=[];
  for(let page=0;page<10;page++){
    const url=new URL(endpoint);
    url.searchParams.set("pageSize","100");
    url.searchParams.set("key",config.apiKey);
    if(nextPageToken)url.searchParams.set("pageToken",nextPageToken);
    let response;
    try { response=await fetcher(url.toString(),{method:"GET",headers:{Accept:"application/json"},signal:AbortSignal.timeout(20000)}); }
    catch { throw new Error("Could not reach Firestore Staging. No data was changed."); }
    if(!response.ok) {
      throw new Error("Read-only Firestore Staging query failed (HTTP "+response.status+"). Verify public category read permission and Staging configuration.");
    }
    let payload;
    try { payload=await response.json(); }
    catch { throw new Error("Firestore Staging response is not valid JSON."); }
    if(payload.documents!==undefined&&!Array.isArray(payload.documents))
      throw new Error("Unexpected Firestore category list response.");
    documents.push(...(payload.documents||[]));
    assert.ok(documents.length<=1000,"Unexpected category list size.");
    nextPageToken=String(payload.nextPageToken||"");
    if(!nextPageToken)return evaluateCategories(documents);
  }
  throw new Error("Firestore category pagination exceeds verification limit.");
}

async function main() {
  assert.equal(process.argv.length,2,"Category verification accepts no project overrides.");
  const path=resolve("firebase.staging.json");
  let config;
  try {config=JSON.parse(readFileSync(path,"utf8"));}
  catch {throw new Error("Missing valid firebase.staging.json. Use npm run setup:staging:auto first.");}
  const report=await fetchCategories(config);
  for(const c of report.categories)console.log(c.id+" | "+c.name_ar+" | "+c.status);
  if(report.extra.length)console.log("Additional custom categories:",report.extra.join(", "));
  console.log("SOUQNA STAGING CATEGORIES: "+report.active+"/"+report.expected+" active.");
  console.log("Read-only check; no Cloud Functions, deployment or Firestore writes.");
  if(!report.ready)process.exitCode=2;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  main().catch(e=>{console.error("STAGING CATEGORY CHECK BLOCKED:",e.message);process.exitCode=1;});
}
