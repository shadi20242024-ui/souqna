// Retrieve the registered staging Web App configuration without clipboard/Notepad.
// READ-ONLY Firebase Management API calls. Never contacts the production project.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

export const STAGING_PROJECT = "souqna-staging";
export const WEB_APP_NAME = "SOUQNA Staging Web";
export const FIREBASE_FIELDS = Object.freeze([
  "apiKey","authDomain","projectId","storageBucket","messagingSenderId","appId"
]);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const localConfig = join(root,"firebase.staging.json");

export function chooseStagingWebApp(apps) {
  assert.ok(Array.isArray(apps),"Firebase Management API did not return a Web App list.");
  const live = apps.filter(a=>a && !["DELETED","DELETING"].includes(a.state) &&
    /^1:\d{6,20}:web:[a-zA-Z0-9]+$/.test(a.appId || ""));
  assert.ok(live.length,"No registered staging Web App was found; no app will be created.");
  const named = live.filter(a=>a.displayName === WEB_APP_NAME);
  if(named.length === 1)return named[0];
  if(!named.length && live.length === 1)return live[0];
  throw new Error("More than one staging Web App found. Identify the correct SOUQNA Staging Web app in Firebase Console; no config was changed.");
}

export function validateStagingWebConfig(value, expectedAppId) {
  assert.ok(value && typeof value==="object" && !Array.isArray(value),
    "Firebase Management API returned an invalid Web App config.");
  assert.equal(value.projectId,STAGING_PROJECT,"Wrong Firebase project: refusing to build.");
  assert.equal(value.appId,expectedAppId,"Web App ID differs from the registered staging app.");
  assert.equal(value.authDomain,STAGING_PROJECT+".firebaseapp.com",
    "The staging Authentication domain does not match.");
  assert.ok([STAGING_PROJECT+".firebasestorage.app",STAGING_PROJECT+".appspot.com"].includes(value.storageBucket),
    "The staging storage bucket is missing or does not match.");
  assert.match(String(value.apiKey||""),/^AIza[\w-]{25,}$/,"Missing/invalid registered staging API key.");
  assert.match(String(value.messagingSenderId||""),/^\d{6,20}$/,"Invalid staging messaging sender ID.");
  assert.match(String(value.appId||""),/^1:\d{6,20}:web:[a-zA-Z0-9]+$/);
  return Object.fromEntries(FIREBASE_FIELDS.map(field=>[field,value[field]]));
}

export async function fetchStagingWebConfig(request) {
  const prefix="https://firebase.googleapis.com/v1beta1/projects/"+STAGING_PROJECT+"/webApps";
  let pageToken="",pages=0;
  const apps=[];
  do{
    assert.ok(++pages<=20,"Too many app-list pages; refusing ambiguous selection.");
    const url=prefix+(pageToken?"?pageToken="+encodeURIComponent(pageToken):"");
    const page=await request(url);
    assert.ok(page && Array.isArray(page.apps),
      "Firebase response has no Web App list; check permissions.");
    apps.push(...page.apps);
    pageToken=page.nextPageToken||"";
  }while(pageToken);
  const app=chooseStagingWebApp(apps);
  const configuration=await request(prefix+"/"+encodeURIComponent(app.appId)+"/config");
  return validateStagingWebConfig(configuration,app.appId);
}

function runLocal(script,...args){
  const result=spawnSync(process.execPath,[join(root,script),...args],{
    cwd:root,encoding:"utf8",timeout:120_000
  });
  if(result.stdout)process.stdout.write(result.stdout);
  if(result.stderr)process.stderr.write(result.stderr);
  if(result.error)throw result.error;
  assert.equal(result.status,0,script+" failed. No deployment was performed.");
}

async function main(){
  assert.equal(process.argv.length,2,"No arguments allowed: this utility is pinned to souqna-staging.");
  assert.ok(!process.env.FIRESTORE_EMULATOR_HOST,
    "Unset FIRESTORE_EMULATOR_HOST before fetching live staging Web App settings.");
  // The user already signed in via 'gcloud auth application-default login'.
  // Locate the standard Windows ADC file without requiring manual PowerShell setup.
  if(!process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.APPDATA){
    const path=join(process.env.APPDATA,"gcloud","application_default_credentials.json");
    if(existsSync(path))process.env.GOOGLE_APPLICATION_CREDENTIALS=path;
  }
  const require=createRequire(new URL("../functions/index.js",import.meta.url));
  const {applicationDefault}=require("firebase-admin/app");
  console.log("SOUQNA automatic staging setup: retrieving registered Web App configuration.");
  let accessToken;
  try{
    const granted=await applicationDefault().getAccessToken();
    accessToken=granted.access_token;
    assert.ok(accessToken,"Google Cloud did not issue an access token.");
  }catch{
    throw new Error("Google Cloud login is unavailable. Run gcloud.cmd auth application-default login on your own computer; do not send credentials.");
  }
  const request=async url=>{
    const response=await fetch(url,{
      headers:{
        Authorization:"Bearer "+accessToken,
        "x-goog-user-project":STAGING_PROJECT,
        Accept:"application/json"
      },
      signal:AbortSignal.timeout(25_000)
    });
    if(!response.ok){
      // Do not echo raw HTTP error bodies, which may contain account details.
      throw new Error("Firebase Management API HTTP "+response.status+
        " for souqna-staging. Verify the signed-in Google account has project access. "+
        "If the error is 403, run gcloud.cmd auth application-default set-quota-project souqna-staging and retry.");
    }
    return response.json();
  };
  let config;
  try{config=await fetchStagingWebConfig(request);}
  finally{accessToken=undefined;}
  // The invalid/empty local JSON remains untouched until validated remote data exists.
  writeFileSync(localConfig,JSON.stringify(config,null,2)+"\n",{encoding:"utf8",mode:0o600});
  assert.deepEqual(JSON.parse(readFileSync(localConfig,"utf8")),config);
  console.log("Saved verified Firebase Web App config for: "+config.projectId);
  console.log("No keys, access tokens, or user credentials were printed.");
  runLocal("scripts/build-hosting.mjs","staging",localConfig);
  runLocal("scripts/preflight-staging.mjs",STAGING_PROJECT);
  console.log("SOUQNA STAGING AUTO SETUP SUCCESS. No deployment or paid service enabled.");
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  main().catch(error=>{
    console.error("STAGING AUTO SETUP FAILED:",error.message);
    process.exitCode=1;
  });
}
