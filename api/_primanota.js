// Prima nota su Jarvis: archivio a documenti (come quello dell'artifact di Claude) nella tabella pn_docs.
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
  const lista = paths.filter(p => /^[\w-]+\/[\w.-]+$/.test(p)).map(p => '"' + p + '"').join(',');
  let q = '/rest/v1/pn_docs?path=in.(' + enc(lista) + ')&select=path,data,aggiornato_il';
  if (dopo) q += '&aggiornato_il=gt.' + enc(dopo);
  const r = await db(q);
  return { ok: true, docs: await r.json(), ora: new Date().toISOString() };
}
