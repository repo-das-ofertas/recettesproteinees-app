import {CONFIG} from './config.js';
const isProduction=()=>CONFIG.production===true;
import {accessConfigured, hashEmail, sessionMatches, verifyAccess, RECHECK_MS} from './access.js';
let restoredBuyer = null, authChecking = false, authGeneration = 0, bonusDownload = null;
let accessMessage = '';
const hasBuyerAccess = () => !authChecking && sessionMatches(state.session);
const hasCatalogAccess = () => hasBuyerAccess() || (!isProduction() && state.session?.mode === 'demo');

const ICONS = {
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  heart:'<path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.9l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z"/>',
  basket:'<path d="m5 9 3 11h8l3-11M3 9h18M8 9l4-7 4 7M10 12v5m4-5v5"/>',
  book:'<path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  filter:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user:'<circle cx="12" cy="8" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
  plus:'<path d="M12 4v16M4 12h16"/>',
  check:'<path d="m5 12 4 4 10-10"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  plate:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="5"/><path d="M2 4v16M22 4v16"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  trash:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>'
};
const dishAlt = r => (r.photo?.alt || r.titre);
const icon = (n,size=22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ICONS.book}</svg>`;
const clean = s => String(s ?? '').replaceAll(String.fromCharCode(8212), ',');
const fr = s => clean(s).replace(/ ([?!;])/g, '\u202f$1').replace(/ :/g, '\u00a0:').replace(/« /g, '«\u202f').replace(/ »/g, '\u202f»');
const esc = s => fr(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = (n,digits=1) => new Intl.NumberFormat('fr-FR',{maximumFractionDigits:digits}).format(n);
const euros = n => new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n);
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr-FR').replace(/œ/g,'oe');
const app = document.querySelector('#app');
let storageOK = true;
let state = {session:null, favorites:[], shopping:{}, ui:{query:'',category:'',minProtein:0,maxCost:null,maxTime:null,difficulty:''}, favoriteUI:{query:'',category:'',minProtein:0,maxCost:null,maxTime:null,difficulty:''}, heroOpen:false};
const LEGACY_STORAGE_KEYS = Object.freeze(['proteicas-fr-v1','proteicas-fr-local-v1']);
function clearLegacyStorage(){
  for(const key of LEGACY_STORAGE_KEYS){
    try{localStorage.removeItem(key);}catch{/* ignore */}
  }
}
function readPersistedState(){
  clearLegacyStorage();
  try{
    const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey) || 'null');
    if(!saved || typeof saved !== 'object') return;
    const demoSession = saved.session?.mode === 'demo';
    // Production never restores a demo session (legacy or current key).
    if(demoSession && !isProduction()) state.session = {mode:'demo'};
    else if(sessionMatches(saved.session)){
      if(navigator.onLine) restoredBuyer = saved.session;
      else state.session = saved.session;
    }else state.session = null;
    state.favorites = Array.isArray(saved.favorites) ? saved.favorites.filter(x => typeof x === 'string') : [];
    state.shopping = saved.shopping && typeof saved.shopping === 'object' && !Array.isArray(saved.shopping) ? saved.shopping : {};
    if(saved.ui && typeof saved.ui === 'object') state.ui = {...state.ui, ...saved.ui};
    if(saved.favoriteUI && typeof saved.favoriteUI === 'object') state.favoriteUI = {...state.favoriteUI,...saved.favoriteUI};
    state.heroOpen = saved.heroOpen === true;
    // Drop any persisted demo flag from the current key when production.
    if(isProduction() && demoSession){
      try{localStorage.setItem(CONFIG.storageKey, JSON.stringify({...saved, session:null}));}catch{/* ignore */}
    }
  }catch{ storageOK = false; }
}
readPersistedState();
function save(){
  try {localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));}
  catch {storageOK = false; toast('Stockage indisponible. Vos changements restent dans cette session.');}
}
let recipes = [], dictionary = {}, thumbnails = {}, categories = [], maxCost = 4, maxTime = 65, minCost = 0;
let currentRoute = '', installPrompt = null, offlineReady = false, toastTimer;
const ui = () => currentRoute==='favoris' ? state.favoriteUI : state.ui;
const resetUI = () => {const cleanUI={query:'',category:'',minProtein:0,maxCost:null,maxTime:null,difficulty:''};if(currentRoute==='favoris')state.favoriteUI=cleanUI;else state.ui=cleanUI;};
const ingredientCount = n => `${n} ingrédient${n===1?'':'s'}`;
const find = id => recipes.find(r => String(r.id) === String(id));
const ingredientName = key => dictionary[key]?.nom || key;
const isFav = id => state.favorites.includes(String(id));
const shoppingEntries = () => Object.entries(state.shopping).filter(([,v]) => v && typeof v.grams === 'number' && Number.isFinite(v.grams) && v.grams > 0);
function toast(text){const el=document.querySelector('#toast');if(!el)return;el.textContent=fr(text);el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>{const current=document.querySelector('#toast');if(current){current.classList.remove('show');current.textContent='';}},2400);}
function macro(r,key,precision=1){
  const displayKey={proteines:'proteines_g',kcal:'kcal',glucides:'glucides_g',lipides:'lipides_g'}[key];
  if(typeof r.affichage?.[displayKey]==='string')return fr(r.affichage[displayKey]);
  const m=r.par_portion[key];
  if (Math.abs(m.haut-m.bas) < 1e-8) return number(m.bas,precision);
  const p=10**precision;
  return `${number(Math.floor((m.bas+1e-10)*p)/p,precision)} à ${number(Math.ceil((m.haut-1e-10)*p)/p,precision)}`;
}
function photo(r,variant='detail'){
  const source=r.photo;
  if(!source || source.visuel!==true || typeof source.fichier!=='string' || !/^images\/[0-9]+\.webp$/.test(source.fichier))return null;
  const thumb=thumbnails[String(r.id)];
  if(variant==='card' && typeof thumb==='string' && /^\.\/assets\/product-thumbs\/[0-9]+\.webp$/.test(thumb))return thumb;
  return './data/'+source.fichier;
}
function chapterArt(r,size=40){
  const paths={
    1:'<path d="M3 10h18c0 7-4 10-9 10s-9-3-9-10Zm4-5v2m5-4v4m5-2v2"/>',
    2:'<path d="m7 3 1 18h8l1-18H7Zm1 5h8m-4 0V3l4-2"/>',
    3:'<path d="M4 6h16v13H4zM4 10h16m-11 4h6"/>',
    4:'<path d="M4 9h16l-2 12H6L4 9Zm1 0a4 4 0 0 1 7-3 4 4 0 0 1 7 3M8 13v4m4-4v4m4-4v4"/>',
    5:'<path d="M7 16c-6-3-3-11 3-11 7-1 11 5 7 9-3 3-7 5-10 2Zm9-2 4 4m-1 3 3-3"/>',
    6:'<path d="M19 14c0 5-3 8-7 8s-7-3-7-8S9 2 12 2s7 7 7 12Z"/>',
    7:'<path d="M3 12c5-8 12-8 17 0-5 8-12 8-17 0Zm1 0-3-4v8l3-4m11-2h.1"/>',
    8:'<path d="M5 20C2 9 8 3 20 3c0 12-6 17-15 17Zm0 0L16 7M9 13h5"/>',
    9:'<path d="M4 8h16l-2 13H6L4 8Zm2-4h12v4M9 12v5m6-5v5"/>',
    10:'<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V3h8v4M3 12h18m-9 0v9"/>',
    11:'<path d="M4 9h16v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V9Zm-2 0h20M8 5h8m-4-3v3"/>',
    12:'<path d="M4 8h16v10H4zM2 21h20M8 4l2 2m4-2 2 2"/>',
    13:'<path d="M3 10h14c0 7-14 7-14 0Zm14 1h6M7 5v2m6-3v3"/>',
    14:'<path d="M5 7h14l2 14H3L5 7Zm3 0V3h8v4M8 12h8m-8 4h8"/>',
    15:'<path d="M3 11h18c0 7-4 10-9 10s-9-3-9-10Zm4-7 1 3m4-4v4m5-3-1 3"/>'
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[r.chapitre]||ICONS.book}</svg>`;
}
function brand(){return `<div class="brand"><img src="./assets/icon.svg" width="38" height="38" alt=""><div><strong>Recettes protéinées</strong><div class="eyebrow">Le carnet de cuisine</div></div></div>`;}
function nav(active){return `<nav class="nav" aria-label="Navigation principale">${[['recettes','book','Recettes'],['favoris','heart','Favoris'],['courses','basket','Courses'],...(hasBuyerAccess()?[['bonus','download','Bonus']]:[])].map(([path,i,label]) => `<a href="#${path}" aria-label="${label}" ${active===path?'aria-current="page"':''}>${icon(i)}<span>${label}</span>${path==='courses' && shoppingEntries().length?`<span class="badge" aria-label="${ingredientCount(shoppingEntries().length)}">${shoppingEntries().length}</span>`:''}</a>`).join('')}</nav>`;}
function shell(content,active){return fr(`<div class="shell"><header class="topbar">${brand()}<button class="icon-btn" data-action="info" aria-label="À propos et installation">${icon('info',20)}</button></header><div id="toast" role="status" aria-live="polite"></div>${!storageOK?'<p class="storage-warning">Stockage indisponible : la sauvegarde après fermeture n’est pas garantie.</p>':''}<main id="main" class="main fade">${content}</main>${nav(active)}</div>`);}
function status(){return !navigator.onLine?'Hors ligne':offlineReady?'Disponible hors ligne':'Préparation hors ligne…';}
function footer(){return `<footer class="footnote"><div class="network ${!navigator.onLine?'offline':''}"><i></i><span data-network>${status()}</span></div><p>Votre carnet sur cet appareil<br>Macros théoriques et coûts estimés, pas de prix garanti.</p><button data-action="info">Sources, limites et installation</button></footer>`;}
function heart(r,detail=false){return `<button class="heart ${detail?'favorite-top':''}" data-action="favorite" data-id="${esc(r.id)}" aria-pressed="${isFav(r.id)}" aria-label="${isFav(r.id)?'Retirer des favoris':'Ajouter aux favoris'} : ${esc(r.titre)}">${icon('heart',21)}</button>`;}
function card(r){const img=photo(r,'card');return `<article class="recipe-card" data-recipe-id="${esc(r.id)}"><a class="card-open" href="#recette/${encodeURIComponent(r.id)}"><div class="card-art">${img?`<img src="${esc(img)}" alt="${esc(dishAlt(r))}" loading="lazy" decoding="async" width="400" height="300">`:`<div class="chapter-fallback chapter-${r.chapitre}">${chapterArt(r,46)}<span>Recette ${String(r.id).padStart(3,'0')}</span></div>`}</div><div class="card-content"><p class="eyebrow">Chapitre ${String(r.chapitre).padStart(2,'0')}</p><h3>${esc(r.titre)}</h3><span class="protein">${macro(r,'proteines')} g de protéines</span><div class="card-meta"><span>${icon('clock',12)} ${number(r.temps_indicatif_min,0)} min</span><span>≈ ${euros(r.cout_portion_eur)}</span></div></div></a>${heart(r)}</article>`;}
const DIFFICULTY_LABELS = Object.freeze({facile:'Facile',moyen:'Moyenne',difficile:'Difficile'});
function activeFilters(){return [ui().difficulty?`Difficulté : ${DIFFICULTY_LABELS[ui().difficulty].toLocaleLowerCase('fr-FR')}`:null,ui().minProtein>0?`≥ ${number(ui().minProtein,0)} g de protéines`:null,ui().maxCost!==null?`≤ ${euros(ui().maxCost)}`:null,ui().maxTime!==null?`≤ ${number(ui().maxTime,0)} min`:null].filter(Boolean);}
function filterRecipes(favorites=false){
 const words=norm(ui().query.trim()).split(/\s+/).filter(Boolean);
 return recipes.filter(r => (!favorites || isFav(r.id)) && (!ui().difficulty || r.difficulte===ui().difficulty) && (!ui().category || r.categorie===ui().category) && words.every(word=>norm([r.titre,r.categorie,...Object.keys(r.ingredients_g).map(ingredientName)].join(' ')).includes(word)) && r.par_portion.proteines.bas >= ui().minProtein && (ui().maxCost===null || r.cout_portion_eur<=ui().maxCost) && (ui().maxTime===null || r.temps_indicatif_min<=ui().maxTime));
}
function catalog(favorites=false){
 const emptyFavorites = favorites && !state.favorites.length;
 return shell(`<section class="intro"><div><p class="eyebrow">${favorites?'Votre sélection':'Le plaisir de bien cuisiner'}</p><h1>${favorites?'Vos favoris':'À table, simplement.'}</h1></div>${!favorites?(isProduction()?`<span class="demo-tag" data-mode>${navigator.onLine?'En ligne':'Hors ligne'}</span>`:`<span class="demo-tag" data-mode>${navigator.onLine?'Démo':'Hors ligne'}</span>`):''}</section>${!favorites?`<details class="collection-hero" id="collection-hero" ${state.heroOpen?'open':''}><summary><span>${icon('book',16)} La collection · ${recipes.length} recettes</span><span class="expand-sign" aria-hidden="true">+</span></summary><div class="hero"><div><p class="eyebrow">Votre carnet, au quotidien</p><h2>Une idée pour<br>chaque envie.</h2><p>Protéines, temps et budget par portion.</p></div><div class="hero-mark">${icon('plate',90)}</div></div></details>`:'<p class="list-intro">Les recettes que vous aimez retrouver.</p>'}${emptyFavorites?empty('heart','Un peu d’inspiration ?','Touchez le cœur d’une recette pour la garder ici.','Explorer les recettes'):searchControls()}${emptyFavorites?'':'<div id="catalog-results"></div>'}${footer()}`,favorites?'favoris':'recettes');
}
function collapseHero(){state.heroOpen=false;const hero=document.querySelector('#collection-hero');if(hero)hero.open=false;}
function searchControls(){return `<div class="search-row"><div class="search-wrap"><label class="sr-only" for="search">Rechercher une recette ou un ingrédient</label>${icon('search',19)}<input id="search" type="search" placeholder="Une recette, un ingrédient…" autocomplete="off" value="${esc(ui().query)}"><button class="clear-search" type="button" data-action="clear-search" aria-label="Effacer la recherche" ${ui().query?'':'hidden'}>${icon('close',16)}</button></div><button class="filter-btn" data-action="filters" aria-label="Filtrer les recettes" aria-haspopup="dialog">${icon('filter',22)}${activeFilters().length?`<span class="filter-dot">${activeFilters().length}</span>`:''}</button></div><div class="tabs" role="group" aria-label="Catégories de recettes"><button class="tab" data-category="" aria-pressed="${!ui().category}">Tout</button>${categories.map(c=>`<button class="tab" data-category="${esc(c)}" aria-pressed="${ui().category===c}">${esc(c)}</button>`).join('')}</div>`;}
function empty(i,title,text,cta){return `<section class="empty"><div class="empty-icon">${icon(i,29)}</div><h2>${title}</h2><p>${text}</p><a class="btn" href="#recettes">${cta} ${icon('arrow',16)}</a></section>`;}
function updateResults(){
 const target=document.querySelector('#catalog-results');if(!target)return;
 const list=filterRecipes(currentRoute==='favoris');
 const filters=activeFilters();
 target.innerHTML=fr(`${filters.length?`<div class="filter-active">${filters.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}<div class="section-head"><h2>${ui().query?'Votre recherche':currentRoute==='favoris'?'À retrouver':'Les recettes'}</h2><span class="count" role="status">${list.length} résultat${list.length===1?'':'s'}</span></div>${list.length?`<div class="grid">${list.map(card).join('')}</div>`:`<section class="empty"><div class="empty-icon">${icon('search',28)}</div><h2>Aucune recette trouvée</h2><p>Essayez un autre ingrédient ou élargissez vos filtres.</p><button class="btn secondary" data-action="reset-search">Tout réinitialiser</button></section>`}`);
}
function detail(r){
 if(!r)return shell(empty('book','Recette introuvable','Cette fiche ne fait pas partie de la collection chargée.','Revenir aux recettes'),'recettes');
 const img=photo(r);
 return shell(`<article class="detail"><div class="back-row"><a href="#${state.lastList==='favoris'?'favoris':'recettes'}">${icon('back',19)} Retour aux recettes</a>${heart(r,true)}</div><p class="eyebrow">Fiche ${String(r.id).padStart(2,'0')} · ${esc(r.categorie)}</p><h1 tabindex="-1">${esc(r.titre)}</h1><div class="detail-summary"><span class="difficulty-pill">Difficulté : ${esc(DIFFICULTY_LABELS[r.difficulte] || r.difficulte)}</span><span>${icon('clock',16)} Temps indicatif : ${number(r.temps_indicatif_min,0)} min</span><span>≈ ${euros(r.cout_portion_eur)} / portion</span></div><div class="recipe-cover">${img?`<figure><img src="${esc(img)}" alt="${esc(dishAlt(r))}" width="400" height="300" fetchpriority="high"></figure>`:`<div><div class="big">${macro(r,'proteines')}<span style="font-size:23px;letter-spacing:0"> g</span></div><p class="small">de protéines par portion</p></div><div class="recipe-no">${chapterArt(r,65)}<span>Chapitre ${String(r.chapitre).padStart(2,'0')}</span></div>`}</div><section class="metrics" aria-label="Valeurs théoriques par portion">${[['kcal','kcal',0],['proteines','Protéines (g)',1],['glucides','Glucides (g)',1],['lipides','Lipides (g)',1]].map(([key,label,precision])=>`<div class="metric"><strong>${macro(r,key,precision)}</strong><span>${label}</span></div>`).join('')}</section><p class="estimate">Par portion. Calculs théoriques à partir d’ANSES CIQUAL 2025. Les intervalles reflètent les limites des données sources.</p><section><div class="subhead"><h2>Ingrédients</h2><span class="portion">${number(r.portions,0)} portion${r.portions>1?'s':''}</span></div><p class="small muted">Quantités pour la recette entière.</p><ul class="ingredients">${Object.entries(r.ingredients_g).map(([key,grams])=>`<li><span>${esc(ingredientName(key))}</span><strong>${number(grams)} g</strong></li>`).join('')}${r.eau?`<li><span>Eau</span><strong>${esc(r.eau)}</strong></li>`:''}</ul><button class="btn" data-action="add-shopping" data-id="${esc(r.id)}">${icon('plus',19)} Ajouter aux courses</button><p class="small muted" style="margin-top:9px">Le lot entier est ajouté. L’eau n’est pas ajoutée aux courses.</p></section><section class="preparation"><h2>La préparation</h2><ol class="steps">${r.etapes.map(step=>`<li><span>${esc(step)}</span></li>`).join('')}</ol></section>${r.materiel?`<div class="notice"><strong>Matériel</strong>${esc(Array.isArray(r.materiel)?r.materiel.join(', '):r.materiel)}</div>`:''}${r.note?`<div class="notice recipe-note"><strong>À garder en tête</strong>${esc(r.note)}</div>`:''}<section class="notice conservation"><h2>Conservation</h2><p class="conservation-text">${esc(r.conservation)}</p></section>${/bonus/i.test(r.note||'')?(hasBuyerAccess()?'<a class="bonus-link" href="#bonus">Retrouver le guide dans Bonus ↗</a>':''):''}<div class="notice allergens"><strong>Allergènes indiqués</strong>${r.allergenes?.length?esc(r.allergenes.join(', ')):'Aucun allergène renseigné dans cette fiche.'}<p style="margin-top:7px">Vérifiez toujours les étiquettes et les traces éventuelles.</p></div><p class="estimate detail-end">Coût estimé : ${euros(r.cout_portion_eur)} par portion, selon les quantités utilisées. Le montant du panier peut être différent. Eau, énergie et équipement non compris. Ce carnet n’est pas un régime personnalisé.</p>${hasBuyerAccess()?'<a class="btn outline pdf-link" href="#bonus">Retrouver le guide PDF dans Bonus ↗</a>':''}${footer()}</article>`,'recettes');
}
function courses(){
 const entries=shoppingEntries(),done=entries.filter(([,v])=>v.checked).length;
 return shell(`<section class="shopping-panel"><div class="intro"><div><p class="eyebrow">Pour la prochaine fois</p><h1>Votre liste de courses</h1></div></div><p class="list-intro">Les ingrédients de vos recettes, réunis au même endroit.</p>${entries.length?`<div class="progress-card"><div class="top"><strong>${done} sur ${entries.length}</strong><small>${done===1?'ingrédient coché':'ingrédients cochés'}</small></div><div class="progress-track" role="progressbar" aria-label="Courses terminées" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${entries.length}"><div style="width:${done/entries.length*100}%"></div></div></div><ul class="shopping-items">${entries.sort(([a],[b])=>ingredientName(a).localeCompare(ingredientName(b),'fr')).map(([key,item])=>`<li class="${item.checked?'done':''}"><label><input type="checkbox" data-shopping="${esc(key)}" ${item.checked?'checked':''}><span>${esc(ingredientName(key))}<span class="weight">${number(item.grams)} g au total</span></span></label><button class="remove" data-action="remove-item" data-key="${esc(key)}" aria-label="Retirer ${esc(ingredientName(key))}">${icon('close',17)}</button></li>`).join('')}</ul><div class="shopping-actions"><button class="btn secondary" data-action="clear-checked">${icon('check',16)} Retirer les ingrédients cochés</button><button class="btn outline" data-action="clear-list">${icon('trash',16)} Vider la liste</button></div><p class="footnote">Poids nets additionnés pour les lots entiers ajoutés. Ce n’est pas une liste d’emballages à acheter. Ajouter deux fois une recette double ses ingrédients.</p>`:empty('basket','Prêt pour les courses ?','Ouvrez une recette et ajoutez ses ingrédients. Ils seront regroupés ici.','Choisir une recette')}${footer()}</section>`,'courses');
}
function closeAccessDialogs(){
 document.querySelectorAll('dialog[open]').forEach(d=>d.close());
 bonusDownload?.abort();
}
async function checkBuyer(h){
 const generation=++authGeneration;
 authChecking=true;accessMessage='Vérification de votre accès…';
 closeAccessDialogs();render();
 try{
  const session=await verifyAccess(h);
  if(generation!==authGeneration)return false;
  state.session=session;restoredBuyer=null;accessMessage='';save();
  return true;
 }catch(error){
  if(generation!==authGeneration)return false;
  state.session=null;restoredBuyer=null;save();
  accessMessage=error.denied
   ?'Nous ne pouvons pas confirmer un accès actif pour cet e-mail. Vérifiez l’adresse utilisée lors de l’achat.'
   :'Impossible de vérifier votre accès. Vérifiez votre connexion, puis réessayez. Le carnet reste fermé.';
  return false;
 }finally{
  if(generation===authGeneration){authChecking=false;render();}
 }
}
async function revalidateBuyer(){
 if(!isProduction() || authChecking || !navigator.onLine)return false;
 const session=state.session||restoredBuyer;
 if(!sessionMatches(session))return false;
 return checkBuyer(session.h);
}
function bonus(){
 return shell(`<section class="bonus-panel"><p class="eyebrow">Votre carnet, à emporter</p><h1>Votre bonus</h1><p>Le guide complet v0.3.6, à garder avec vos recettes.</p><p class="small muted">Une connexion Internet est nécessaire pour télécharger le guide.</p><button class="btn" data-action="download-bonus">${icon('download',20)} Télécharger le guide PDF</button><p id="bonus-status" role="status" aria-live="polite"></p>${footer()}</section>`,'bonus');
}
async function downloadBonus(){
 if(!hasBuyerAccess())return;
 if(navigator.onLine && !await revalidateBuyer())return;
 if(!hasBuyerAccess())return;
 const generation=authGeneration;
 const controller=new AbortController();bonusDownload=controller;
 const button=document.querySelector('[data-action="download-bonus"]');
 if(button)button.disabled=true;
 try{
  if(!CONFIG.bonusAsset)throw Error('missing');
  const response=await fetch(CONFIG.bonusAsset,{cache:'no-store',credentials:'omit',signal:controller.signal});
  if(!response.ok || !response.headers.get('content-type')?.includes('application/pdf'))throw Error('pdf');
  const blob=await response.blob();
  if(!hasBuyerAccess() || generation!==authGeneration)return;
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='guide-recettes-proteinees-v0.3.6.pdf';
  link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  const status=document.querySelector('#bonus-status');
  if(status)status.textContent='Votre téléchargement est prêt.';
 }catch{
  const status=document.querySelector('#bonus-status');
  if(status)status.textContent='Le guide n’a pas pu être téléchargé. Vérifiez votre connexion, puis réessayez.';
 }finally{
  if(bonusDownload===controller)bonusDownload=null;
  const current=document.querySelector('[data-action="download-bonus"]');if(current)current.disabled=false;
 }
}
function login(){
 if(isProduction()){
  const configured=accessConfigured();
  app.innerHTML=fr(`<div class="login"><header class="login-top">${brand()}</header><main id="main" class="login-main fade"><div class="login-hero"><img src="./assets/icon.svg" width="122" height="122" alt=""></div><p class="eyebrow" style="color:var(--rust)">Bienvenue</p><h1>La cuisine commence ici.</h1>${configured?`<p class="login-description">Saisissez l’e-mail utilisé lors de votre achat pour ouvrir votre carnet.</p><form id="login-form"><label class="field-label" for="access">Votre e-mail d’achat</label><input id="access" name="access" type="email" required autocomplete="email" autocapitalize="none" spellcheck="false" aria-describedby="login-error" ${authChecking?'disabled':''}><p id="login-error" class="login-error" role="alert">${esc(accessMessage)}</p><button type="submit" class="btn" ${authChecking?'disabled':''}>${authChecking?'Vérification…':'Ouvrir mon carnet'} ${icon('arrow',17)}</button></form>`:'<p class="login-description" role="status">L’accès à ce carnet n’est pas encore disponible. Réessayez plus tard.</p>'}</main><footer class="login-note">Favoris et courses restent sur cet appareil après ouverture.</footer></div>`);
  return;
 }
 const demoCode=(CONFIG.demoCodes&&CONFIG.demoCodes[0])||'';
 const demoEmail=(CONFIG.demoEmails&&CONFIG.demoEmails[0])||'';
 app.innerHTML=fr(`<div class="login"><header class="login-top">${brand()}<span class="demo-tag">Démo locale</span></header><main id="main" class="login-main fade"><div class="login-hero"><img src="./assets/icon.svg" width="122" height="122" alt=""></div><p class="eyebrow" style="color:var(--rust)">Bienvenue dans votre carnet</p><h1>La cuisine commence ici.</h1><p class="login-description">Retrouvez vos recettes, gardez vos favoris et préparez vos courses.</p><form id="login-form"><label class="field-label" for="access">E-mail de démonstration ou code d’accès</label><input id="access" name="access" type="text" required autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${esc(demoCode)}" aria-describedby="demo-help login-error"><p id="login-error" class="login-error" role="alert"></p><button type="submit" class="btn">Ouvrir mon carnet ${icon('arrow',17)}</button></form><p id="demo-help" class="demo-info">Préversion de démonstration locale uniquement. Utilisez <code>${esc(demoCode)}</code> ou <code>${esc(demoEmail)}</code>.<br>Aucun achat n’est vérifié. N’entrez pas votre véritable e-mail d’achat.</p></main><footer class="login-note">Aucune donnée envoyée. Vos favoris et vos courses restent sur cet appareil.</footer></div>`);
}
function render(){
 if(!hasCatalogAccess()){login();return;}
 const hash=location.hash.slice(1), parts=hash.split('/');
 currentRoute=['favoris','courses',...(hasBuyerAccess()?['bonus']:[])].includes(parts[0])?parts[0]:parts[0]==='recette'?'detail':'recettes';
 if(currentRoute==='recettes'||currentRoute==='favoris'){state.lastList=currentRoute;app.innerHTML=catalog(currentRoute==='favoris');updateResults();}
 else if(currentRoute==='courses')app.innerHTML=courses();
 else if(currentRoute==='bonus')app.innerHTML=bonus();
 else app.innerHTML=detail(find(decodeURIComponent(parts[1]||'')));
}
function openFilters(){
 const d=document.querySelector('#filters');
 d.innerHTML=fr(`<form id="filter-form"><div class="dialog-head"><h2 id="filter-title">À votre goût</h2><button class="icon-btn" type="button" data-close="filters" aria-label="Fermer les filtres">${icon('close',19)}</button></div><p class="dialog-copy">Affinez votre recherche. Les critères se combinent, par portion.</p><label class="filter-field"><span class="field-top"><span>Minimum de protéines</span><output id="protein-output">${number(ui().minProtein,0)} g</output></span><input aria-label="Minimum de protéines" name="minProtein" type="range" min="0" max="50" step="1" value="${ui().minProtein}"></label><label class="filter-field"><span class="field-top"><span>Budget maximum par portion</span><output id="cost-output">${euros(ui().maxCost ?? maxCost)}</output></span><input aria-label="Budget maximum par portion" name="maxCost" type="range" min="${minCost}" max="${maxCost}" step="0.05" value="${ui().maxCost ?? maxCost}"></label><label class="filter-field"><span class="field-top"><span>Temps indicatif maximum</span><output id="time-output">${number(ui().maxTime ?? maxTime,0)} min</output></span><input aria-label="Temps indicatif maximum" name="maxTime" type="range" min="5" max="${maxTime}" step="5" value="${ui().maxTime ?? maxTime}"></label><label class="difficulty-field"><span class="field-label">Difficulté</span><select name="difficulty" aria-label="Difficulté"><option value="">Toutes les difficultés</option>${Object.entries(DIFFICULTY_LABELS).map(([value,label])=>`<option value="${value}" ${ui().difficulty===value?'selected':''}>${label}</option>`).join('')}</select></label><p class="dialog-copy" style="margin-bottom:22px">La difficulté et les temps sont indicatifs. Le minimum de protéines utilise la borne basse. Les coûts sont estimés.</p><button class="btn" type="submit">Afficher les recettes ${icon('arrow',17)}</button><button class="filter-reset" data-action="reset-filters" type="button">Réinitialiser les filtres</button></form>`);
 d.showModal();
}
function info(){
 const d=document.querySelector('#info');
 const accessBlock=isProduction()
  ?`<details class="info-details"><summary>Vos données et l’accès</summary><p>Favoris et courses restent dans ce navigateur, sans synchronisation. Effacer les données du navigateur les supprime. L’empreinte de votre e-mail et la dernière confirmation d’accès sont enregistrées sur cet appareil. L’adresse saisie n’y est pas conservée en clair.</p><p>L’accès est revérifié à l’ouverture et au retour de la connexion. Sans vérification possible en ligne, le carnet reste fermé.</p></details>`
  :`<details class="info-details"><summary>Vos données et l’accès</summary><p>Favoris et courses restent dans ce navigateur, sans synchronisation. Effacer les données du navigateur les supprime. Aucun e-mail, code saisi ou détail d’achat n’est enregistré.</p><p>Cet accès de démonstration locale ne vérifie aucun achat et ne constitue pas un accès client.</p></details>`;
 const contact=isProduction()?'':`<p class="small muted">Contacter l'assistance : <!-- CONTATO NAO VERIFICADO --><a href="mailto:support@recettesproteinees.fr">support@recettesproteinees.fr</a></p>`;
 const logoutLabel=isProduction()?'Fermer la session':'Fermer la session locale';
 d.innerHTML=fr(`<div class="dialog-head"><h2 id="info-title">Votre carnet</h2><button class="icon-btn" data-close="info" aria-label="Fermer les informations">${icon('close',19)}</button></div><div class="info-body"><section class="info-block"><h3>Emportez-le en cuisine</h3><p>Après le téléchargement complet, les recettes restent disponibles hors ligne si votre navigateur autorise le stockage local.</p><p>${offlineReady?'Votre carnet est prêt pour une utilisation hors ligne.':'Gardez cette page ouverte le temps du téléchargement.'}</p><p>Sur iPhone : Safari, Partager, puis « Sur l’écran d’accueil ». Sur Android : menu du navigateur, puis « Installer l’application », si proposé.</p>${installPrompt?'<button class="btn secondary" data-action="install">Installer le carnet</button>':''}</section><details class="info-details"><summary>Sources et repères</summary><p>Macros théoriques calculées à partir des données de la table Ciqual 2025 de l’Anses. Certaines correspondances sont des approximations documentées dans le guide. Source : ANSES, Licence Ouverte 2.0.</p><p>Coûts estimés selon les quantités utilisées, sans garantie de prix ou de stock. Eau, énergie et équipement exclus. Temps indicatifs et difficulté éditoriale. Ces recettes n’ont pas été testées en cuisine.</p><p>Vérifiez les étiquettes, allergènes, consignes de conservation et cuisson complète. Ce carnet ne remplace pas un conseil médical ou nutritionnel.</p></details>${accessBlock}${contact}${hasBuyerAccess()?'<a class="bonus-link" href="#bonus">Retrouver votre guide dans Bonus ↗</a>':''}</div><button class="btn outline" data-action="logout">${logoutLabel}</button>`);d.showModal();
}
function confirmClear(){const d=document.querySelector('#confirmation');d.innerHTML=fr(`<div class="dialog-head"><h2 id="confirm-title">Vider la liste de courses ?</h2></div><p class="dialog-copy" style="margin-bottom:22px">Tous les ingrédients seront retirés. Vos recettes favorites seront conservées.</p><div class="info-actions"><button class="btn" data-action="confirm-clear">Oui, vider la liste</button><button class="btn outline" data-close="confirmation">Garder ma liste</button></div>`);d.showModal();}

document.addEventListener('submit',async e=>{
 if(e.target.id==='login-form'){
  e.preventDefault();
  if(isProduction()){
   if(!accessConfigured()||authChecking)return;
   const email=e.target.elements.access.value;
   try{await checkBuyer(await hashEmail(email));}
   catch{accessMessage='Impossible de vérifier votre accès. Vérifiez votre connexion, puis réessayez. Le carnet reste fermé.';state.session=null;save();render();}
   return;
  }
  const value=e.target.elements.access.value.trim();
  // Explicit local allowlist only. This is NOT authentication or proof of purchase.
  const codes=CONFIG.demoCodes||[]; const emails=CONFIG.demoEmails||[];
  if(codes.includes(value)||emails.includes(value.toLowerCase())){
   state.session={mode:'demo'};save();e.target.reset();if(location.hash==='#recettes')render();else location.hash='recettes';
  }else{document.querySelector('#login-error').textContent='Accès démo locale uniquement. Aucun achat n’est vérifié.';}
 }
 if(e.target.id==='filter-form'){
  e.preventDefault();const f=e.target.elements;
  ui().minProtein=Number(f.minProtein.value);ui().maxCost=Number(f.maxCost.value)>=maxCost?null:Number(f.maxCost.value);ui().maxTime=Number(f.maxTime.value)>=maxTime?null:Number(f.maxTime.value);ui().difficulty=f.difficulty.value;collapseHero();save();document.querySelector('#filters').close();render();
 }
});
document.addEventListener('input',e=>{
 if(e.target.id==='search'){
  ui().query=e.target.value;collapseHero();save();updateResults();const b=document.querySelector('.clear-search');if(b)b.hidden=!ui().query;
 }
 const out={minProtein:['protein-output',v=>`${number(v,0)} g`],maxCost:['cost-output',euros],maxTime:['time-output',v=>`${number(v,0)} min`]};
 if(e.target.closest('#filter-form') && out[e.target.name]){const [id,format]=out[e.target.name];document.getElementById(id).textContent=format(Number(e.target.value));}
});
document.addEventListener('change',e=>{
 if(e.target.matches('[data-shopping]')){const item=state.shopping[e.target.dataset.shopping];if(item){item.checked=e.target.checked;save();const selectedKey=e.target.dataset.shopping;render();document.querySelector(`[data-shopping="${CSS.escape(selectedKey)}"]`)?.focus({preventScroll:true});}}
});
document.addEventListener('click',async e=>{
 const category=e.target.closest('[data-category]');
 if(category){ui().category=category.dataset.category;collapseHero();save();document.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.category===ui().category));updateResults();return;}
 const close=e.target.closest('[data-close]');if(close){document.getElementById(close.dataset.close)?.close();return;}
 const b=e.target.closest('[data-action]');if(!b)return;
 if(!hasCatalogAccess())return;
 switch(b.dataset.action){
 case 'download-bonus':await downloadBonus();break;
 case 'info': info();break;
 case 'filters':collapseHero();openFilters();break;
 case 'favorite': {
  const id=String(b.dataset.id);if(!find(id))break;
  const added=!isFav(id);state.favorites=added?[...state.favorites,id]:state.favorites.filter(x=>x!==id);save();
  if(currentRoute==='favoris'){render();}else{b.setAttribute('aria-pressed',added);b.setAttribute('aria-label',fr(`${added?'Retirer des favoris':'Ajouter aux favoris'} : ${clean(find(id).titre)}`));}
  toast(added?'Recette ajoutée aux favoris.':'Recette retirée des favoris.');break;
 }
 case 'add-shopping': {
  const r=find(b.dataset.id);if(!r)break;
  for(const [key,grams] of Object.entries(r.ingredients_g)){
   const previous=state.shopping[key];state.shopping[key]={grams:(previous?.grams||0)+grams,checked:false};
  }save();
  const link=document.querySelector('.nav a[href="#courses"]');if(link){const old=link.querySelector('.badge');if(old)old.remove();link.insertAdjacentHTML('beforeend',`<span class="badge" aria-label="${ingredientCount(shoppingEntries().length)}">${shoppingEntries().length}</span>`);}
  toast('Ingrédients ajoutés à votre liste de courses.');break;
 }
 case 'remove-item': delete state.shopping[b.dataset.key];save();render();break;
 case 'clear-list':confirmClear();break;
 case 'confirm-clear':state.shopping={};save();document.querySelector('#confirmation').close();render();toast('Liste de courses vidée.');break;
 case 'clear-checked':for(const [key,v] of shoppingEntries())if(v.checked)delete state.shopping[key];save();render();toast('Ingrédients cochés retirés.');break;
 case 'reset-filters':ui().minProtein=0;ui().maxCost=null;ui().maxTime=null;ui().difficulty='';save();document.querySelector('#filters').close();render();break;
 case 'reset-search':resetUI();save();render();break;
 case 'clear-search':ui().query='';save();document.querySelector('#search').value='';b.hidden=true;updateResults();document.querySelector('#search').focus();break;
 case 'logout':++authGeneration;authChecking=false;restoredBuyer=null;accessMessage='';state.session=null;save();closeAccessDialogs();render();break;
 case 'install':if(installPrompt){await installPrompt.prompt();installPrompt=null;document.querySelector('#info').close();}break;
 }
});
window.addEventListener('hashchange',()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());render();window.scrollTo({top:0,behavior:'instant'});const heading=document.querySelector('#main h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}});
function updateNetwork(){document.querySelectorAll('[data-mode]').forEach(el=>el.textContent=navigator.onLine?(isProduction()?'En ligne':'Démo'):'Hors ligne');document.querySelectorAll('[data-network]').forEach(el=>{el.textContent=status();el.parentElement.classList.toggle('offline',!navigator.onLine);});}
window.addEventListener('online',()=>{updateNetwork();void revalidateBuyer();});window.addEventListener('offline',updateNetwork);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void revalidateBuyer();});
window.addEventListener('focus',()=>{void revalidateBuyer();});
setInterval(()=>{if(document.visibilityState==='visible')void revalidateBuyer();},RECHECK_MS);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
async function load(){
 try{
  const responses=await Promise.all([fetch(CONFIG.dataUrl),fetch(CONFIG.ingredientUrl),fetch('./data/thumbnails.json')]);
  if(responses.some(r=>!r.ok))throw Error('Données indisponibles.');
  const [raw,nutrition,media]=await Promise.all(responses.map(r=>r.json()));
  if(!Array.isArray(raw)||raw.length===0)throw Error('Collection vide ou format incorrect.');
  const ids=new Set();
  for(const r of raw){
   if((typeof r.id!=='string'&&typeof r.id!=='number')||ids.has(String(r.id))||!r.titre||!r.categorie||!Number.isInteger(r.portions)||r.portions<1||!Number.isFinite(r.temps_indicatif_min)||r.temps_indicatif_min<0||!Number.isFinite(r.cout_portion_eur)||r.cout_portion_eur<0||!r.ingredients_g||!Object.keys(r.ingredients_g).length||!Array.isArray(r.etapes)||r.etapes.length===0||!r.etapes.every(x=>typeof x==='string')||Object.values(r.ingredients_g).some(g=>!Number.isFinite(g)||g<=0))throw Error('Fiche incomplète ou identifiant dupliqué.');
   if(typeof r.conservation!=='string'||!r.conservation.trim())throw Error('Conservation manquante.');
   if(!['facile','moyen','difficile'].includes(r.difficulte))throw Error('Difficulté manquante.');
   for(const key of ['kcal','proteines','glucides','lipides']){const m=r.par_portion?.[key];if(!m||!Number.isFinite(m.bas)||!Number.isFinite(m.haut)||m.bas<0||m.haut<m.bas)throw Error('Valeurs nutritionnelles manquantes.');}
   ids.add(String(r.id));
  }
  dictionary=nutrition;thumbnails=media;recipes=raw;categories=[...new Set(recipes.map(r=>r.categorie))];maxCost=Math.ceil(Math.max(...raw.map(r=>r.cout_portion_eur))*2)/2;maxTime=Math.ceil(Math.max(...raw.map(r=>r.temps_indicatif_min))/5)*5;
  state.favorites=state.favorites.filter(id=>ids.has(id));
  for(const filters of [state.ui,state.favoriteUI]){
  filters.query=typeof filters.query==='string'?filters.query:'';
  if(!categories.includes(filters.category))filters.category='';
  filters.minProtein=Number.isFinite(filters.minProtein)?Math.max(0,Math.min(50,filters.minProtein)):0;
  filters.maxCost=Number.isFinite(filters.maxCost)?Math.max(0,Math.min(maxCost,filters.maxCost)):null;
  filters.maxTime=Number.isFinite(filters.maxTime)?Math.max(5,Math.min(maxTime,filters.maxTime)):null;
  filters.difficulty=['facile','moyen','difficile'].includes(filters.difficulty)?filters.difficulty:'';
  }
  if(restoredBuyer && navigator.onLine)await revalidateBuyer();else render();
 }catch(error){app.innerHTML=fr(`<main id="main" class="loading"><h1>Le carnet ne s’ouvre pas.</h1><p>Impossible de charger les recettes. Vérifiez la connexion, puis réessayez.</p><button class="btn" style="max-width:220px" id="retry">Réessayer</button></main>`);document.querySelector('#retry').onclick=()=>location.reload();}
}
document.addEventListener('toggle',e=>{if(e.target.id==='collection-hero'){state.heroOpen=e.target.open;save();}},true);
load();
if('serviceWorker' in navigator){
 navigator.serviceWorker.register('./sw.js').then(()=>navigator.serviceWorker.ready).then(()=>{offlineReady=true;updateNetwork();}).catch(()=>{offlineReady=false;updateNetwork();});
}
