const CACHE_NAME='security-patrol-v7';
self.addEventListener('install',event=>{
 event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return;
 event.respondWith((async()=>{
  try{
   const response=await fetch(req);
   if(response&&response.ok){const cache=await caches.open(CACHE_NAME);cache.put(req,response.clone()).catch(()=>{});}
   return response;
  }catch(error){
   const cached=await caches.match(req);
   if(cached)return cached;
   if(req.mode==='navigate'){const fallback=await caches.match(new URL('./index.html',self.registration.scope).toString());if(fallback)return fallback;}
   return Response.error();
  }
 })());
});