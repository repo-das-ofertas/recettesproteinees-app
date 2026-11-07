import {CONFIG} from './config.js';

// Contract source: lucronamao/app@e48a6389, ativacao.js:141-161.
// Deliberate difference: every error denies access; never grant provisional access.
// FR offer contract: catalog + Bonus only when p contains the product id 'base'.
export const RECHECK_MS = 60_000;
export function accessConfigured(){
  return CONFIG.production === true && typeof CONFIG.accessUrl === 'string' &&
    /^https?:\/\//.test(CONFIG.accessUrl) && typeof CONFIG.accessKey === 'string' &&
    CONFIG.accessKey.trim().length > 0;
}
export async function hashEmail(email){
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export function sessionMatches(session){
  return accessConfigured() && session?.mode === 'buyer' &&
    /^[a-f0-9]{64}$/.test(session.h || '') && Number.isFinite(session.checkedAt) &&
    session.checkedAt > 0 && session.endpoint === CONFIG.accessUrl &&
    session.key === CONFIG.accessKey.trim() && Array.isArray(session.products) &&
    session.products.includes('base');
}
export async function verifyAccess(h){
  if(!accessConfigured() || !/^[a-f0-9]{64}$/.test(h)) throw new Error('unconfigured');
  const url = new URL(CONFIG.accessUrl);
  url.searchParams.set('k', CONFIG.accessKey.trim());
  url.searchParams.set('e', h);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try{
    const response = await fetch(url, {cache:'no-store', credentials:'omit',
      referrerPolicy:'no-referrer', signal:controller.signal});
    if(!response.ok) throw new Error('verification');
    const data = await response.json();
    if(data?.s !== 'ok'){
      const error = new Error('denied');
      error.denied = data?.s === 'nao_achei' || data?.s === 'reembolsado';
      throw error;
    }
    // Tolerant/provisional grants are not purchase confirmation for this offer.
    if(data.prov || !Array.isArray(data.p) || !data.p.every(p => typeof p === 'string')){
      throw new Error('verification');
    }
    // s:'ok' without product 'base' (including p:[]) is not a purchase for this offer.
    if(!data.p.includes('base')){
      const error = new Error('denied');
      error.denied = true;
      throw error;
    }
    return {mode:'buyer', h, checkedAt:Date.now(), products:data.p,
      endpoint:CONFIG.accessUrl, key:CONFIG.accessKey.trim()};
  }finally{clearTimeout(timer);}
}
