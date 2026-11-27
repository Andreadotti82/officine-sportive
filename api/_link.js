// Contenitore di link del circolo: si apre solo con la chiave, le chiavi delle app restano nel database.
import { readFileSync } from 'node:fs';
import { segreto } from './_jarvis-base.js';
const MODELLO = readFileSync(new URL('./_pagine/link.html', import.meta.url), 'utf8');
export async function linkPagina(q) {
  const k = await segreto('link');
  if (!k || String(q.k || '') !== k) return '<p style="font-family:Arial;padding:30px;text-align:center">Link non valido.</p>';
  const [hw, park, prova] = await Promise.all([segreto('link-hw'), segreto('link-park'), segreto('link-prova')]);
  return MODELLO.replaceAll('__HW__', hw).replaceAll('__PARK__', park).replaceAll('__PROVA__', prova);
}
