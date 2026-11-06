// Cache version tracks data/PDF releases. Bump VERSION when assets change.
const VERSION='proteicas-fr-0.2.7-data-v0.3.5';
const ASSETS=['./','./index.html','./styles.css','./app.js','./config.js','./manifest.webmanifest','./data/recettes.json','./data/nutrition.json','./data/thumbnails.json','./assets/guide-v0.3.5.pdf','./assets/icon.svg','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-maskable.png'];
const ROOT=new URL('./',self.location).href;
const allowed=url=>{
  if(url.origin!==new URL(ROOT).origin||!url.href.startsWith(ROOT))return false;
  const relative=url.href.slice(ROOT.length);
  return ASSETS.some(x=>new URL(x,ROOT).href===url.href)||/^data\/images\/[0-9]+\.webp$/.test(relative)||/^assets\/product-thumbs\/[0-9]+\.webp$/.test(relative);
};
self.addEventListener('install',e=>e.waitUntil((async()=>{
  const c=await caches.open(VERSION);await c.addAll(ASSETS);
  const recipes=await(await c.match(new URL('./data/recettes.json',ROOT))).json();
  const thumbnails=await(await c.match(new URL('./data/thumbnails.json',ROOT))).json();
  const images=recipes.filter(r=>r.photo?.illustrative===true&&/^images\/[0-9]+\.webp$/.test(r.photo.fichier||'')).map(r=>'./data/'+r.photo.fichier);
  const thumbs=Object.values(thumbnails).filter(p=>/^\.\/assets\/product-thumbs\/[0-9]+\.webp$/.test(p));
  await c.addAll([...new Set([...images,...thumbs])]);await self.skipWaiting();
})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('proteicas-fr-')&&k!==VERSION).map(k=>caches.delete(k)));await self.clients.claim();
})()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);url.search='';url.hash='';if(!allowed(url))return;
  e.respondWith((async()=>{
    const c=await caches.open(VERSION);
    try{const r=await fetch(e.request);if(!r.ok)throw Error('HTTP');await c.put(url.href,r.clone());return r;}
    catch{return await c.match(url.href)||new Response('Ressource hors ligne indisponible.',{status:503});}
  })());
});
