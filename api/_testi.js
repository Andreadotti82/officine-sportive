// Testi caricati una volta (es. il codice della prima nota dal suo artifact): si salvano nel database con una chiave usa e getta.
import { db, segreto } from './_jarvis-base.js';
export async function testoCarica(chiave, nome, testo) {
  const k = await segreto('upload-' + nome);
  if (!k || chiave !== k || typeof testo !== 'string' || testo.length < 1000) return { ok: false };
  const r = await db('/rest/v1/jarvis_testi?on_conflict=nome', 'POST', { nome, testo, aggiornato_il: new Date().toISOString() }, { Prefer: 'resolution=merge-duplicates' });
  if (!r.ok) throw new Error('salvataggio ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return { ok: true, lunghezza: testo.length };
}
