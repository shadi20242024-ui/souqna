"use strict";

const GRAPH_ORIGIN="https://graph.facebook.com";
const OBJECT_ID=/^[0-9_]{1,128}$/;
const VERSION=/^v[0-9]{1,2}\.[0-9]{1,2}$/;
const MAX_MESSAGE=1800;
const MAX_ERROR=160;

function safeObjectId(value,label){
  if(typeof value!=="string"||!OBJECT_ID.test(value))
    throw new Error("Invalid Meta "+label);
  return value;
}

function socialCaption(job){
  const title=String(job?.title||"").replace(/[\r\n\u0000-\u001f]+/g," ").trim().slice(0,150);
  if(!title)throw new Error("A featured listing needs a title");
  const area=String(job?.area||"").replace(/[\r\n\u0000-\u001f]+/g," ").trim().slice(0,100);
  const currency=String(job?.currency||"").replace(/[\r\n\u0000-\u001f]+/g," ").slice(0,10);
  const price=typeof job?.price==="number"&&Number.isFinite(job.price)&&job.price>=0
    ?String(job.price)+" "+currency:"";
  return [
    "⭐ إعلان مميز على سوقنا | SOUQNA",
    title,
    area?"📍 "+area:"",
    price?"💰 "+price:"",
    "سوقنا — سوق السويداء"
  ].filter(Boolean).join("\n").slice(0,MAX_MESSAGE);
}

function createMetaSocialClient({
  enabled=false,
  graphVersion="v27.0",
  pageId="",
  pageAccessToken="",
  instagramUserId="",
  instagramAccessToken="",
  fetchImpl=globalThis.fetch
}={}){
  if(!VERSION.test(graphVersion))throw new Error("Invalid Meta Graph API version");
  if(typeof fetchImpl!=="function")throw new Error("A fetch implementation is required");
  const live=enabled===true;
  const facebook=live&&OBJECT_ID.test(pageId)&&typeof pageAccessToken==="string"&&pageAccessToken.length>=20;
  const instagram=live&&OBJECT_ID.test(instagramUserId)&&
    typeof instagramAccessToken==="string"&&instagramAccessToken.length>=20;
  const available={facebook,instagram};

  async function send(method,resource,token,fields={}){
    const url=new URL(GRAPH_ORIGIN+"/"+graphVersion+"/"+resource);
    const options={
      method,
      redirect:"error",
      headers:{
        Authorization:"Bearer "+token,
        Accept:"application/json"
      },
      signal:AbortSignal.timeout(15000)
    };
    if(method==="POST"){
      options.headers["Content-Type"]="application/x-www-form-urlencoded";
      options.body=new URLSearchParams(fields).toString();
    }
    let response;
    try{response=await fetchImpl(url.href,options);}
    catch{throw new Error("Meta request outcome uncertain");}
    let data={};
    try{data=await response.json();}
    catch{throw new Error("Meta response could not be verified");}
    if(!response.ok||data?.error){
      const code=Number(data?.error?.code)||response.status;
      const err=new Error("Meta API denied operation (code "+String(code).slice(0,10)+")");
      err.code="meta_api_error";
      err.httpStatus=response.status;
      throw err;
    }
    return data;
  }

  function requireConnected(platform){
    if(!available[platform])throw new Error("Meta "+platform+" is not connected or not enabled");
  }

  async function publish(platform,job){
    requireConnected(platform);
    const caption=socialCaption(job);
    if(platform==="facebook"){
      if(job.imageUrl){
        const photo=await send("POST",safeObjectId(pageId,"Page ID")+"/photos",
          pageAccessToken,{url:job.imageUrl,caption,published:"true"});
        return {postId:safeObjectId(photo.post_id||photo.id,"Facebook photo/post ID")};
      }
      const post=await send("POST",safeObjectId(pageId,"Page ID")+"/feed",
        pageAccessToken,{message:caption});
      return {postId:safeObjectId(post.id,"Facebook post ID")};
    }
    if(platform==="instagram"){
      const image=String(job?.imageUrl||"");
      const match=image.match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/([^?#]+)\?alt=media(?:&.*)?$/);
      if(!match||!/\.(jpg|jpeg)$/i.test(decodeURIComponent(match[1])))
        throw new Error("Instagram requires a publicly accessible JPEG image");
      const container=await send("POST",safeObjectId(instagramUserId,"Instagram account ID")+"/media",
        instagramAccessToken,{image_url:image,caption});
      const creationId=safeObjectId(container.id,"Instagram container ID");
      const published=await send("POST",safeObjectId(instagramUserId,"Instagram account ID")+"/media_publish",
        instagramAccessToken,{creation_id:creationId});
      return {postId:safeObjectId(published.id,"Instagram media ID")};
    }
    throw new Error("Unsupported social platform");
  }

  async function remove(platform,postId){
    requireConnected(platform);
    safeObjectId(postId,"published content ID");
    const token=platform==="facebook"?pageAccessToken:instagramAccessToken;
    const result=await send("DELETE",postId,token);
    if(result.success!==true&&result.success!=="true")
      throw new Error("Meta did not confirm post removal");
    return {removed:true};
  }

  return Object.freeze({
    isConnected:platform=>available[platform]===true,
    publish,remove
  });
}

module.exports={createMetaSocialClient,socialCaption};
