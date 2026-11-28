// Contratti firmati negli ultimi 60 giorni (App Contratti su Jarvis): servono al gradimento dei nuovi iscritti della casella info.
import { db, segreto } from './_jarvis-base.js';
export async function contrattiRecenti(chiave) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  const da = new Date(Date.now() - 60 * 864e5).toISOString();
  const r = await db('/rest/v1/contratti?firmato=eq.true&annullato=eq.false&prova=eq.false&tipo=neq.upgrade&firmato_il=gt.' + encodeURIComponent(da) + '&select=numero,nome,cognome,email,firmato_il,categoria,abbonamento_nome');
  return { ok: true, contratti: r.ok ? await r.json() : [] };
}
