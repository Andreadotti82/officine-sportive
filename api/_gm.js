// Good Morning & Good Night: la pagina sta su Jarvis; dati, mail e controlli automatici per ora restano sul Google Script.
import { segreto, escHtml } from './_jarvis-base.js';
import { PAGINA_GM } from './_gm-pagina.js';

const URL_GAS = 'https://script.google.com/macros/s/AKfycbxom9ST_8sRTWmx_Pp18hJpntQAv4rtMcgo8j48vVpgfYvzot1sAcgzpgvYI8OVu3Sn/exec';
const AMMESSE = ['getAvvio', 'getExtra', 'getRounds', 'saveRound', 'scanQr', 'uploadPhoto', 'deleteRound', 'finishRound', 'getAuto', 'saveAuto',
  'createCarLink', 'getCarLinks', 'getCarLink', 'useCarLink', 'versioneApp', 'caricaExport', 'primaNotaChiusa'];

async function chiamaGas(fn, args) {
  const k = await segreto('gm');
  const r = await fetch(URL_GAS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k, fn, args: Array.isArray(args) ? args : [] }), redirect: 'follow' });
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { console.error('[GM] risposta non valida', fn, r.status, t.slice(0, 200)); return { ok: false, errore: 'Il Good Morning non risponde: riprova tra poco.' }; }
}

export async function gmRun(fn, args) {
  if (!AMMESSE.includes(fn)) return { ok: false, errore: 'Funzione non valida.' };
  return chiamaGas(fn, args);
}

// Come il doGet di Google: la pagina con le impostazioni già dentro
export async function gmPagina(q) {
  const qr = /^qr-[a-z]+$/.test(String(q.qr || '')) ? q.qr : '';
  const tok = /^[a-f0-9-]{36}$/.test(String(q.t || '')) ? q.t : '';
  const r = await chiamaGas('cfgJarvis', [String(q.prova || ''), String(q.page || ''), String(q.k || '')]);
  if (!r.ok) throw new Error(r.errore || 'Good Morning non raggiungibile');
  const x = JSON.parse(r.data);
  return PAGINA_GM.replace('__QR__', escHtml(qr)).replace('__PAGE__', escHtml(x.page || '')).replace('__TOK__', escHtml(tok))
    .replace('__CFG__', escHtml(JSON.stringify(x.cfg || {})));
}
