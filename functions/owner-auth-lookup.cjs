"use strict";
const assert=require("node:assert/strict");

const PAGE_SIZE=1000;
const MAX_PAGES=10;
const normalizeEmail=value=>String(value||"").trim().toLowerCase();

function verifiedOwner(user, expectedEmail){
  assert.ok(user && typeof user.uid==="string" && user.uid.length>0,
    "Firebase returned no valid owner UID.");
  assert.ok(!user.disabled,"Existing owner account is disabled.");
  assert.equal(normalizeEmail(user.email),normalizeEmail(expectedEmail),
    "Firebase returned an account with an unexpected email; refusing a password change.");
  return user;
}

function diagnosticError(code, detail){
  const error=new Error(detail);
  error.code=code;
  return error;
}

async function resolveStagingOwner(auth, expectedEmail){
  assert.ok(auth && typeof auth.getUserByEmail==="function" && typeof auth.listUsers==="function",
    "Firebase Authentication Admin client is required.");
  assert.match(expectedEmail,/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  try{
    return verifiedOwner(await auth.getUserByEmail(expectedEmail),expectedEmail);
  }catch(error){
    if(error?.code!=="auth/user-not-found")throw error;
  }
  // No account is changed here: enumerate user records only to resolve
  // harmless email case differences, or distinguish absence from mismatch.
  let nextPageToken=undefined,scanned=0,pages=0;
  const matched=[];
  do{
    if(++pages>MAX_PAGES){
      throw diagnosticError("auth/owner-scan-limit",
        "Staging user inventory exceeded scan limit. No password was changed.");
    }
    const page=await auth.listUsers(PAGE_SIZE,nextPageToken);
    assert.ok(page && Array.isArray(page.users),"Firebase returned an invalid user inventory.");
    scanned+=page.users.length;
    for(const user of page.users){
      if(normalizeEmail(user.email)===normalizeEmail(expectedEmail)){
        matched.push(user);
      }
    }
    nextPageToken=page.pageToken||undefined;
  }while(nextPageToken);
  if(matched.length===1)return verifiedOwner(matched[0],expectedEmail);
  if(matched.length>1){
    throw diagnosticError("auth/ambiguous-owner",
      "Multiple staging accounts match the owner email. No password was changed.");
  }
  if(scanned===0){
    throw diagnosticError("auth/staging-user-inventory-empty",
      "Firebase Auth Admin sees zero accounts in souqna-staging. Verify the project/tenant selected in Firebase Console. No password was changed.");
  }
  throw diagnosticError("auth/owner-email-mismatch",
    "Firebase Auth Admin sees "+scanned+" staging account(s), but none has the exact owner email. Verify the full untruncated email in Firebase Console > souqna-staging > Authentication > Users. No password was changed.");
}

module.exports={resolveStagingOwner,normalizeEmail};
