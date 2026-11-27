// Ponte Jarvis ↔ Google Script: le pagine e i pulsanti si aprono da Jarvis (niente banner né blocchi di Google),
// mentre dati, mail e orari automatici restano nel progetto Google finché non vengono spostati.
import { segreto } from './_jarvis-base.js';

export const PONTI = {
  hw: { url: 'https://script.google.com/macros/s/AKfycbwtbuFVdl-UKeM2bgT8ERJZkSA_0lNH1Q8wa484fSXNIgZenoKLw1lIveORtHDtYB3_/exec', percorso: '/hw' }
};

async function chiama(app, corpo) {
  const p = PONTI[app]; if (!p) return { ok: false, errore: 'App sconosciuta' };
  const k = await segreto('ponte');
  const r = await fetch(p.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k, ...corpo }), redirect: 'follow' });
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { console.error('[PONTE]', app, r.status, t.slice(0, 200)); return { ok: false, errore: 'Il servizio non risponde: riprova tra poco.' }; }
}

// google.script.run dalle pagine
export async function ponteRun(app, fn, args) {
  if (!/^[A-Za-z][A-Za-z0-9_]*[A-Za-z0-9]$/.test(String(fn || ''))) return { ok: false, errore: 'Funzione non valida.' };
  return chiama(app, { mode: 'run', fn, args: Array.isArray(args) ? args : [] });
}

// Al posto di google.script.run / google.script.url dentro le pagine di Google
function shim(app, base) {
  return `<script>(function(){var A=${JSON.stringify(app)};function mk(ok,ko,uo){return new Proxy({},{get:function(_,n){
if(n==='withSuccessHandler')return function(f){return mk(f,ko,uo)};if(n==='withFailureHandler')return function(f){return mk(ok,f,uo)};if(n==='withUserObject')return function(o){return mk(ok,ko,o)};
return function(){var a=[].slice.call(arguments);fetch('/api/jarvis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:'ponteRun',args:[A,n,a]})})
.then(function(r){return r.json()}).then(function(r){var x=r&&r.data;if(!r.ok||!x)throw new Error('Connessione assente: riprova.');if(!x.ok)throw new Error(x.errore||'Errore');ok&&ok(x.data,uo)})
.catch(function(e){if(ko)ko(e,uo);else alert(e.message)})}}})}
window.google=window.google||{};google.script={run:mk(),host:{close:function(){},setHeight:function(){},setWidth:function(){},editor:{focus:function(){}}},
url:{getLocation:function(cb){var q={},qs={};new URLSearchParams(location.search).forEach(function(v,k){q[k]=v;(qs[k]=qs[k]||[]).push(v)});cb({hash:location.hash.slice(1),parameter:q,parameters:qs})}},
history:{push:function(){},replace:function(){},setChangeHandler:function(){}}};})();</script>`;
}

// La pagina: come doGet di Google, servita da Jarvis
export async function pontePagina(app, query) {
  const p = PONTI[app]; if (!p) throw new Error('App sconosciuta');
  const params = {}; Object.keys(query || {}).forEach(k => { if (k !== 'ponte') params[k] = String(query[k]); });
  const r = await chiama(app, { mode: 'get', params });
  if (!r.ok) throw new Error(r.errore || 'errore');
  let html = String(r.html || '');
  html = html.split(p.url).join(p.percorso);   // i link interni restano su Jarvis
  const testa = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' + (r.title ? '<title>' + r.title.replace(/</g, '&lt;') + '</title>' : '') + shim(app);
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, m => m + testa);
  else html = '<!doctype html><html><head>' + testa + '</head><body>' + html + '</body></html>';
  return html;
}
