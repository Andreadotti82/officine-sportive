// Ingresso su Jarvis per le app nate su Google: pagine (doGet), pulsanti (google.script.run), giri automatici.
import { db, segreto } from '../_jarvis-base.js';
import { esegui } from './runtime.js';
import { app as caricaApp, APPS } from './app.js';

const SIMULAZIONE = 'andreadotti@officinesportive.it';

async function attiva(nome) {
  const r = await db('/rest/v1/jarvis_stato?chiave=eq.gas-' + encodeURIComponent(nome) + '&select=valore');
  const x = await r.json();
  return !!(Array.isArray(x) && x[0] && x[0].valore && x[0].valore.attivo);
}
async function prepara(nome) {
  const k = await segreto('codici');
  return { a: caricaApp(nome, k, (await attiva(nome)) ? null : SIMULAZIONE), k };
}
const normale = v => (v && typeof v === 'object' && typeof v.getContent === 'function') ? v.getContent() : v;

// google.script.run dalle pagine: come su Google, solo le funzioni "pubbliche" (senza _ finale)
export async function gasRun(nome, fn, args) {
  if (!APPS[nome]) return { ok: false, errore: 'App sconosciuta' };
  if (!/^[A-Za-z][A-Za-z0-9_]*[A-Za-z0-9]$/.test(String(fn || '')) || ['doGet', 'doPost'].includes(fn)) return { ok: false, errore: 'Funzione non valida.' };
  try { const { a, k } = await prepara(nome); return { ok: true, data: normale(await esegui(a, k, fn, Array.isArray(args) ? args : [])) }; }
  catch (e) { console.error('[GAS ' + nome + '] ' + fn, e); return { ok: false, errore: String(e && e.message || e) }; }
}

// Giri automatici (orari) e prove: solo con la chiave
export async function gasEsegui(chiave, nome, fn, args) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  const { a, k } = await prepara(nome);
  try { return { ok: true, data: normale(await esegui(a, k, fn, args || [])) }; }
  catch (e) { console.error('gasEsegui', nome, fn, e); return { ok: false, errore: String(e && e.stack || e).slice(0, 1500) }; }
}

function shim(nome) {
  return `<script>(function(){var A=${JSON.stringify(nome)};function mk(ok,ko,uo){return new Proxy({},{get:function(_,n){
if(n==='withSuccessHandler')return function(f){return mk(f,ko,uo)};if(n==='withFailureHandler')return function(f){return mk(ok,f,uo)};if(n==='withUserObject')return function(o){return mk(ok,ko,o)};
return function(){var a=[].slice.call(arguments);fetch('https://officine-sportive.vercel.app/api/jarvis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:'gasRun',args:[A,n,a]})})
.then(function(r){return r.json()}).then(function(r){var x=r&&r.data;if(!r.ok||!x)throw new Error('Connessione assente: riprova.');if(!x.ok)throw new Error(x.errore||'Errore');ok&&ok(x.data,uo)})
.catch(function(e){if(ko)ko(e,uo);else alert(e.message)})}}})}
window.google=window.google||{};google.script={run:mk(),host:{close:function(){},setHeight:function(){},setWidth:function(){},editor:{focus:function(){}}},
url:{getLocation:function(cb){var q={},qs={};new URLSearchParams(location.search).forEach(function(v,k){q[k]=v;(qs[k]=qs[k]||[]).push(v)});cb({hash:location.hash.slice(1),parameter:q,parameters:qs})}},
history:{push:function(){},replace:function(){},setChangeHandler:function(){}}};})();</script>`;
}

// La pagina (doGet di Google) servita da Jarvis
export async function gasPagina(nome, query) {
  const { a, k } = await prepara(nome);
  const p = {}, ps = {};
  Object.keys(query || {}).forEach(x => { if (x !== 'gas') { p[x] = String(query[x]); ps[x] = [String(query[x])]; } });
  const out = await esegui(a, k, 'doGet', [{ parameter: p, parameters: ps, queryString: new URLSearchParams(p).toString(), contextPath: '', contentLength: -1 }]);
  let html = out && out.getContent ? out.getContent() : String(out || '');
  const titolo = out && out.getTitle ? out.getTitle() : '';
  const testa = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' + (titolo ? '<title>' + titolo.replace(/</g, '&lt;') + '</title>' : '') + shim(nome);
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, m => m + testa);
  else html = '<!doctype html><html><head>' + testa + '</head><body>' + html + '</body></html>';
  return html;
}

// Chiamate da altri sistemi (doPost di Google), es. il Good Morning che manda le segnalazioni all'action plan
export async function gasPost(nome, corpo) {
  const { a, k } = await prepara(nome);
  const e = { postData: { contents: typeof corpo === 'string' ? corpo : JSON.stringify(corpo), type: 'application/json', length: 0 }, parameter: {}, parameters: {} };
  const out = await esegui(a, k, 'doPost', [e]);
  return out && out.getContent ? out.getContent() : String(out || '');
}
