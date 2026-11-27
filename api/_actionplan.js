// Action plan: la pagina sta su Jarvis; dati, promemoria e mail per ora restano nel Google Script dell'action plan.
import { segreto } from './_jarvis-base.js';

const URL_GAS = 'https://script.google.com/macros/s/AKfycbw8elh5LTFxELcgKHa7nQum8NPAIafVhn1y6sc1mwfNCs_mCF-DTB9SKiViH5tAaW1_Aw/exec';
const AMMESSE = ['getPlan', 'updateAction', 'nuovaAzione', 'assegnaAzione', 'bloccaAzione', 'eliminaAzione', 'config', 'importa'];

export async function apRun(fn, args) {
  if (!AMMESSE.includes(fn)) return { ok: false, errore: 'Funzione non valida.' };
  const k = await segreto('actionplan');
  const r = await fetch(URL_GAS, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k, fn, args: Array.isArray(args) ? args : [] }), redirect: 'follow' });
  const t = await r.text();
  try { return JSON.parse(t); } catch (e) { console.error('[AP] risposta non valida', r.status, t.slice(0, 200)); return { ok: false, errore: 'L’action plan non risponde: riprova tra poco.' }; }
}
