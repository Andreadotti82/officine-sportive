// Copia una volta i dati da Google a Jarvis (fogli e proprietà), usando i ponti già attivi.
import { db, segreto } from '../_jarvis-base.js';

const URL_GM = 'https://script.google.com/macros/s/AKfycbxom9ST_8sRTWmx_Pp18hJpntQAv4rtMcgo8j48vVpgfYvzot1sAcgzpgvYI8OVu3Sn/exec';
const URL_AP = 'https://script.google.com/macros/s/AKfycbw8elh5LTFxELcgKHa7nQum8NPAIafVhn1y6sc1mwfNCs_mCF-DTB9SKiViH5tAaW1_Aw/exec';

async function ponte(url, chiave, fn, args) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: chiave, fn, args }), redirect: 'follow' });
  const t = await r.text(); let j;
  try { j = JSON.parse(t); } catch (e) { throw new Error('Risposta non valida da Google: ' + t.slice(0, 120)); }
  if (!j.ok) throw new Error(j.errore || 'errore');
  return JSON.parse(j.data);
}

export async function gasImporta(chiave, tipo, arg, app) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  if (tipo === 'foglio') {
    const x = await ponte(URL_GM, await segreto('gm'), 'esportaFoglio', [arg]);
    const righe = x.schede.map((s, i) => ({ foglio: arg, scheda: s.nome, ordine: i, bloccate: s.bloccate || 0, nascosta: !!s.nascosta, valori: s.valori, aggiornato_il: new Date().toISOString() }));
    await db('/rest/v1/gas_fogli?foglio=eq.' + encodeURIComponent(arg), 'DELETE', null, { Prefer: 'return=minimal' });
    for (let i = 0; i < righe.length; i += 5) {
      const r = await db('/rest/v1/gas_fogli', 'POST', righe.slice(i, i + 5), { Prefer: 'return=minimal' });
      if (!r.ok) throw new Error('Salvataggio non riuscito: ' + (await r.text()).slice(0, 200));
    }
    return { ok: true, nome: x.nome, schede: righe.map(r => r.scheda + ' (' + r.valori.length + ')') };
  }
  if (tipo === 'proprieta') {
    const fonte = arg === 'gm' ? [URL_GM, await segreto('gm')] : [URL_AP, await segreto('actionplan')];
    const p = await ponte(fonte[0], fonte[1], 'esportaProprieta', []);
    const righe = Object.keys(p).map(k => ({ app, chiave: k, valore: p[k] }));
    await db('/rest/v1/gas_proprieta?app=eq.' + encodeURIComponent(app), 'DELETE', null, { Prefer: 'return=minimal' });
    if (righe.length) await db('/rest/v1/gas_proprieta', 'POST', righe, { Prefer: 'return=minimal' });
    return { ok: true, proprieta: righe.length };
  }
  return { ok: false, errore: 'tipo?' };
}
