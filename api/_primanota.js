// Prima nota su Jarvis: archivio a documenti (come quello dell'artifact di Claude) nella tabella pn_docs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, segreto } from './_jarvis-base.js';

const ok = async (k) => !!k && (k === await segreto('primanota') || k === await segreto('upload-primanota'));
const enc = encodeURIComponent;

// import una tantum dal vecchio artifact (chiave di caricamento) e salvataggi della pagina
export async function pnImporta(k, path, data) {
  if (!(await ok(k)) || typeof path !== 'string' || !/^[\w-]+\/[\w.-]+$/.test(path)) return { ok: false };
  const r = await db('/rest/v1/pn_docs?on_conflict=path', 'POST', { path, data, aggiornato_il: new Date().toISOString() }, { Prefer: 'resolution=merge-duplicates' });
  if (!r.ok) throw new Error('pn ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return { ok: true };
}
export async function pnGet(k, path) {
  if (!(await ok(k))) return { ok: false };
  const r = await db('/rest/v1/pn_docs?path=eq.' + enc(path) + '&select=data,aggiornato_il');
  const x = (await r.json())[0];
  return { ok: true, exists: !!x, data: x ? x.data : null, at: x ? x.aggiornato_il : null };
}
export async function pnSet(k, path, data) { return pnImporta(k, path, data); }
// tutti i documenti di una raccolta (es. movimenti)
export async function pnList(k, coll) {
  if (!(await ok(k)) || !/^[\w-]+$/.test(coll)) return { ok: false };
  const r = await db('/rest/v1/pn_docs?path=like.' + enc(coll + '/%') + '&select=path,data&order=path.desc&limit=1000');
  return { ok: true, docs: await r.json() };
}
// controllo dei cambiamenti: restituisce i documenti aggiornati dopo "dopo"
export async function pnPoll(k, paths, dopo) {
  if (!(await ok(k)) || !Array.isArray(paths)) return { ok: false };
  if (!paths.length) return { ok: true, docs: [], ora: new Date().toISOString() };
  const lista = paths.filter(p => /^[\w-]+\/[\w.-]+$/.test(p)).map(p => '"' + p + '"').join(',');
  let q = '/rest/v1/pn_docs?path=in.(' + enc(lista) + ')&select=path,data,aggiornato_il';
  if (dopo) q += '&aggiornato_il=gt.' + enc(dopo);
  const r = await db(q);
  return { ok: true, docs: await r.json(), ora: new Date().toISOString() };
}

// i turni pubblicati dell'app Turni, nel formato che la prima nota già usa (months + names)
const NOMI = { alept: 'Alessandro' };
export async function pnTurni(k) {
  if (!(await ok(k))) return { ok: false };
  const r = await db('/rest/v1/turni_docs?path=like.months/*&select=path,data');
  const months = {}, names = {};
  (await r.json()).forEach(x => {
    const m = x.data || {};
    if (m.status !== 'pubblicato' || !m.schedule) return;
    months[x.path.slice(7)] = m.schedule;
    Object.values(m.schedule).forEach(g => (g || []).forEach(t => { if (t && t.s && !names[t.s]) names[t.s] = NOMI[t.s] || (t.s.charAt(0).toUpperCase() + t.s.slice(1)); }));
  });
  return { ok: true, exists: true, data: { months, names, fonte: 'app Turni (Jarvis)' } };
}

// la pagina: codice originale della prima nota (cifrato nel repository) + archivio su Jarvis
let modello = null;
async function leggiModello() {
  if (modello) return modello;
  const chiave = await segreto('codici');
  const b = fs.readFileSync(path.join(process.cwd(), 'api', '_codici', 'primanota.enc'));
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(chiave, 'hex'), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28));
  modello = JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')).html;
  return modello;
}
export async function pnPagina(q) {
  const k = String(q.k || '');
  if (!k || k !== await segreto('primanota')) return '<p style="font-family:Arial;padding:30px;text-align:center">Link non valido.</p>';
  const m = await leggiModello();
  const st = await (await db("/rest/v1/jarvis_stato?chiave=eq.primanota&select=valore")).json();
  const gn = (st[0] && st[0].valore && st[0].valore.gn) || '';
  const testa = '<script>window.PN_K=' + JSON.stringify(k) + ';window.JARVIS_GN=' + JSON.stringify(gn) + '</script>' + m.shim;
  return m.pagina
    .replace('<!--JARVIS-SHIM-->', () => testa)
    .replace("const GN_URL='", () => "const GN_URL=window.JARVIS_GN||'")
    .replace("const APP_URL='https://claude.ai/artifact/W4m1TxPSMCugaYrCNEkvkB'", () => "const APP_URL=location.origin+'/primanota?k='+window.PN_K");
}
