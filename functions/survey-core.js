"use strict";
const {createHmac}=require("node:crypto");
function canonicalPhone(value){
  if(typeof value!=="string")throw new Error("Invalid phone");
  const s=value.trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[\s()-]/g,"").replace(/^00/,"+");
  if(!/^\+[1-9]\d{7,14}$/.test(s))throw new Error("Use international E.164 phone");
  return s;
}

function cleanText(v,min,max){
  if(typeof v!=="string")throw new Error("Invalid text");
  const s=v.trim().normalize("NFC");
  if(s.length<min||s.length>max||/[\u0000-\u001f\u007f]/.test(s))throw new Error("Invalid text length or characters");
  return s;
}

function profile(data){
  if(data.consent!==true)throw new Error("Consent required");
  return {name:cleanText(data.name,2,100),residence:cleanText(data.residence,2,150)};
}

function questions(raw){
  if(!Array.isArray(raw)||raw.length<1||raw.length>30)throw new Error("1–30 questions required");
  return raw.map((q,i)=>{
    if(!q||typeof q!=="object")throw new Error("Invalid question");
    const base={id:"q"+(i+1),label:cleanText(q.label,3,300),required:q.required!==false};
    if(q.type==="rating")return {...base,type:"rating"};
    if(q.type==="text")return {...base,type:"text"};
    if(q.type==="choice"&&Array.isArray(q.options)&&q.options.length>=2&&q.options.length<=12){
      const options=q.options.map((x,j)=>({id:"o"+(j+1),label:cleanText(x,1,150)}));
      if(new Set(options.map(x=>x.label.toLowerCase())).size!==options.length)throw new Error("Duplicate choices");
      return {...base,type:"choice",options};
    }
    throw new Error("Invalid question type");
  });
}

function answers(qs,raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||Object.keys(raw).some(k=>!qs.some(q=>q.id===k)))throw new Error("Unexpected answers");
  const out={};
  for(const q of qs){
    const v=raw[q.id];
    if(v===undefined||v===null||v===""){if(q.required)throw new Error("Required: "+q.id);continue;}
    if(q.type==="rating"){if(!Number.isInteger(v)||v<1||v>5)throw new Error("Invalid rating");out[q.id]=v;}
    else if(q.type==="choice"){if(!q.options.some(o=>o.id===v))throw new Error("Invalid choice");out[q.id]=v;}
    else if(q.type==="text")out[q.id]=cleanText(v,1,1000);
    else throw new Error("Unknown question");
  }
  return out;
}
function participationKey(secret,storeId,phone){
  if(typeof secret!=="string"||secret.length<32)throw new Error("Survey HMAC secret missing");
  if(typeof storeId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(storeId))throw new Error("Invalid store");
  return createHmac("sha256",secret).update(JSON.stringify(["survey-store-v1",storeId,canonicalPhone(phone)])).digest("hex");
}
module.exports={canonicalPhone,cleanText,profile,questions,answers,participationKey};
