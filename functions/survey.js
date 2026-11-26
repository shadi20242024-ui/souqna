"use strict";
const {onCall,HttpsError}=require("firebase-functions/v2/https");
const {defineSecret}=require("firebase-functions/params");
const {getAuth}=require("firebase-admin/auth");
const {canonicalPhone,cleanText,profile,questions,answers,participationKey}=require("./survey-core");
const secret=defineSecret("SOUQNA_SURVEY_HMAC");
function fail(code,message){throw new HttpsError(code,message);}
function validate(fn){try{return fn();}catch{fail("invalid-argument","البيانات أو الإجابات غير صالحة");}}
function storeIdOf(value){if(typeof value!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(value))fail("invalid-argument","معرف المتجر غير صالح");return value;}
function open(s,now){if(!s||s.status!=="published"||now>=s.expiresAt||s.completed>=s.maxResponses)fail("failed-precondition","الاستبيان مغلق أو اكتمل العدد");}
module.exports=(db,options)=>onCall({...options,secrets:[secret]},async req=>{
  const uid=req.auth?.uid;
  if(!uid)fail("unauthenticated","يرجى تسجيل الدخول");
  const data=req.data||{},action=data.action,storeId=storeIdOf(data.storeId);
  const surveyRef=db.collection("rewardsSurveys").doc(storeId);
  const storeRef=db.collection("stores").doc(storeId);
  const userRef=db.collection("users").doc(uid);
  const now=Date.now();
  if(action==="publish"){
    const title=validate(()=>cleanText(data.title,3,150)),qs=validate(()=>questions(data.questions));
    if(!Number.isSafeInteger(data.expiresAt)||data.expiresAt<=now||data.expiresAt>now+366*86400000||!Number.isSafeInteger(data.maxResponses)||data.maxResponses<1||data.maxResponses>10000)fail("invalid-argument","المدة أو عدد المشاركين غير صالح");
    return db.runTransaction(async tx=>{
      const [u,st,s]=await Promise.all([tx.get(userRef),tx.get(storeRef),tx.get(surveyRef)]);
      if(!u.exists||u.data().role!=="admin")fail("permission-denied","الإدارة فقط");
      if(!st.exists||st.data().status!=="approved")fail("failed-precondition","المتجر غير معتمد");
      if(s.exists)fail("already-exists","يوجد استبيان لهذا المتجر");
      tx.create(surveyRef,{storeId,title,questions:qs,status:"published",createdAt:now,expiresAt:data.expiresAt,maxResponses:data.maxResponses,completed:0,rewardsEnabled:false,createdBy:uid});
      return {ok:true};
    });
  }
  if(!["start","submit","status"].includes(action))fail("invalid-argument","عملية غير مدعومة");
  const tokenPhone=req.auth.token?.phone_number;
  if(typeof tokenPhone!=="string")fail("failed-precondition","تحقق من رقم هاتفك أولاً");
  const account=await getAuth().getUser(uid);
  if(account.disabled||!account.phoneNumber||account.phoneNumber!==tokenPhone)fail("failed-precondition","أعد التحقق من رقم الهاتف");
  const phone=validate(()=>canonicalPhone(tokenPhone));
  const key=participationKey(secret.value(),storeId,phone);
  const entryRef=db.collection("rewardsSurveyParticipants").doc(key);
  const responseRef=db.collection("rewardsSurveyResponses").doc(key);
  const details=action==="start"?validate(()=>profile(data)):null;
  return db.runTransaction(async tx=>{
    const [st,s,e,r]=await Promise.all([tx.get(storeRef),tx.get(surveyRef),tx.get(entryRef),tx.get(responseRef)]);
    if(!st.exists||st.data().status!=="approved"||!s.exists)fail("not-found","الاستبيان غير متاح");
    if(st.data().ownerId===uid)fail("permission-denied","لا يمكن المشاركة في استبيان متجرك");
    const survey=s.data(),entry=e.exists?e.data():null;
    if(entry&&entry.uid!==uid)fail("already-exists","سبق تسجيل هذا الرقم لدى المتجر");
    if(r.exists||entry?.status==="completed"){
      if(action==="status"||action==="submit")return {status:"completed",message:"تمت المشاركة سابقاً"};
      fail("already-exists","تمت المشاركة سابقاً بهذا الرقم");
    }
    if(action==="status")return {status:entry?"started":"available"};
    open(survey,now);
    if(action==="start"){
      if(!entry)tx.create(entryRef,{uid,storeId,...details,consentVersion:1,startedAt:now,status:"started"});
      return {status:"started",title:survey.title,questions:survey.questions,expiresAt:survey.expiresAt};
    }
    if(!entry||entry.status!=="started")fail("failed-precondition","سجل بيانات المشاركة أولاً");
    const result=validate(()=>answers(survey.questions,data.answers));
    // Responses exclude name, raw phone and residence. Keep private under server-only access.
    tx.create(responseRef,{storeId,answers:result,submittedAt:now,durationMs:Math.max(0,now-entry.startedAt),reviewStatus:"pending",rewardStatus:"not_enabled"});
    tx.update(entryRef,{status:"completed",completedAt:now});
    tx.update(surveyRef,{completed:survey.completed+1});
    return {status:"completed",message:"تم حفظ إجاباتك بنجاح"};
  });
});
