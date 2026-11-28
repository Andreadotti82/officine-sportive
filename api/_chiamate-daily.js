// 28/11/2026 · Ponte momentaneo: le chiamate per categoria (Sales / Administration / Customer service)
// le calcola ancora il compito del Call Score (8:13) e le scrive sul foglio Google del Daily.
// Jarvis le copia nel suo Daily (gas_fogli) poco dopo. Quando il Call Score girerà su Jarvis, si toglie.
import { db, segreto } from './_jarvis-base.js';

const URL_GM = 'https://script.google.com/macros/s/AKfycbxom9ST_8sRTWmx_Pp18hJpntQAv4rtMcgo8j48vVpgfYvzot1sAcgzpgvYI8OVu3Sn/exec';
const DAILY = '1yeXgJUzP2G2qcEbSj4qA3YiZaKCT9o9KcguBpOahjps';
const COLONNE = ['Sales call', 'Administration call', 'Customer service call'];

async function google(fn, args) {
  const r = await fetch(URL_GM, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: await segreto('gm'), fn, args }), redirect: 'follow' });
  const j = JSON.parse(await r.text());
  if (!j.ok) throw new Error(j.errore || 'errore Google');
  return JSON.parse(j.data);
}
const giorno = x => (x && typeof x === 'object' && x.$d) ? new Date(x.$d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }) : String(x || '').replace(/^'/, '').slice(0, 10);

export async function chiamateDaily(chiave, giorni) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  const g = (await google('esportaFoglio', [DAILY, ['Daily']])).schede[0];
  if (!g) return { ok: false, errore: 'Daily Google non letto' };
  const gh = g.valori[0], gi = gh.indexOf('Data');
  const dal = new Date(Date.now() - (giorni || 5) * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const daGoogle = {};
  g.valori.slice(1).forEach(r => {
    const d = giorno(r[gi]); if (d < dal) return;
    const x = {}; COLONNE.forEach(c => { const i = gh.indexOf(c); if (i >= 0 && r[i] !== '' && r[i] != null) x[c] = Number(r[i]) || 0; });
    if (Object.keys(x).length) daGoogle[d] = x;
  });
  const fg = (await (await db('/rest/v1/gas_fogli?foglio=eq.' + DAILY + '&scheda=eq.Daily&select=valori')).json())[0];
  if (!fg) return { ok: false, errore: 'Daily Jarvis non trovato' };
  const v = fg.valori, h = v[0], iD = h.indexOf('Data');
  COLONNE.forEach(c => { if (h.indexOf(c) < 0) h.push(c); });
  const cambiati = [];
  v.forEach((r, n) => {
    if (!n) return; const d = giorno(r[iD]), x = daGoogle[d]; if (!x) return;
    while (r.length < h.length) r.push('');
    let cambia = false;
    Object.keys(x).forEach(c => { const i = h.indexOf(c); if (String(r[i]) !== String(x[c])) { r[i] = x[c]; cambia = true; } });
    if (cambia) cambiati.push(d);
  });
  if (!cambiati.length) return { ok: true, cambiati, daGoogle };
  const up = await db('/rest/v1/gas_fogli?foglio=eq.' + DAILY + '&scheda=eq.Daily', 'PATCH', { valori: v, aggiornato_il: new Date().toISOString() }, { Prefer: 'return=minimal' });
  return { ok: up.ok, cambiati, daGoogle };
}
