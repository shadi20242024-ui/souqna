const CACHE="souqna-v13";
const STATIC=["./","index.html","assets/responsive.css","assets/admin-metrics.js","assets/souqna-local-services.mjs","assets/souqna-services-ui.mjs","assets/souqna-staff-ui.mjs","assets/souqna-community-ui.mjs","logo.png","icon-192.png","icon-512.png","manifest.webmanifest"];
const ALLOWED=new Set(STATIC.filter(path=>path!=="./").map(path=>new URL(path,self.registration.scope).pathname));
const OFFLINE=new URL("index.html",self.registration.scope).pathname;

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(async cache=>{
    for(const path of STATIC){
      try{
        const response=await fetch(new URL(path,self.registration.scope),{cache:"reload"});
        if(response.ok&&response.type==="basic")await cache.put(new URL(path,self.registration.scope),response);
      }catch(error){console.warn("SOUQNA precache skipped",path,error);}
    }
  }));
  self.skipWaiting();
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith("souqna-")&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET")return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(request.mode==="navigate"){
    event.respondWith(fetch(request).then(response=>{
      if(response.ok&&response.type==="basic"){
        const clone=response.clone();
        event.waitUntil(caches.open(CACHE).then(cache=>cache.put(new URL(OFFLINE,self.registration.scope),clone)));
      }
      return response;
    }).catch(async()=>{
      const cache=await caches.open(CACHE);
      return (await cache.match(new URL(OFFLINE,self.registration.scope)))||
        new Response("SOUQNA offline. Please reconnect.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}});
    }));
    return;
  }
  // Only cache versioned, public application assets. Never cache arbitrary paths,
  // authenticated responses, API endpoints, or private documents.
  if(!ALLOWED.has(url.pathname)||url.search)return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(request);
    const refresh=fetch(request).then(async response=>{
      if(response.ok&&response.type==="basic"&&!response.headers.has("set-cookie"))
        await cache.put(request,response.clone());
      return response;
    });
    if(cached){event.waitUntil(refresh.catch(()=>{}));return cached;}
    return refresh.catch(()=>new Response("Offline",{status:503}));
  }));
});
