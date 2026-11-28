// Voci padel della Prima nota prese da Playtomic (prima lo faceva un compito di Claude sull'artifact; dal 28/11 la Prima nota è su Jarvis).
// Legge il foglio «Jarvis · Playtomic» (aggiornato dal progetto playtomic sul motore) e scrive pn_docs «cassa/playtomic».
// Regole di Andrea: rimborsi di altri giorni di servizio non si tolgono (21/11), K padel con le correzioni di Luca, campi = prenotazioni non annullate.
import { db, segreto } from './_jarvis-base.js';

const FOGLIO = '1LRHt3BDd_J6m8VDQ4KO7ux1wp64kRD5tUqPozbdoIz4';
const giorno = v => { if (v && typeof v === 'object' && v.$d) return new Date(v.$d).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }); const m = String(v || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + '-' + m[2] + '-' + m[1] : String(v || '').slice(0, 10); };
const num = v => typeof v === 'number' ? v : (parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')) || 0);
const r2 = x => Math.round(x * 100) / 100;
const KP = /k[\s-]?padel/i;

async function scheda(nome) {
  const x = await (await db('/rest/v1/gas_fogli?foglio=eq.' + FOGLIO + '&scheda=eq.' + encodeURIComponent(nome) + '&select=valori')).json();
  const v = (x[0] && x[0].valori) || [];
  const h = v[0] || [];
  return v.slice(1).map(r => { const o = {}; h.forEach((k, i) => { o[k] = r[i]; }); return o; });
}

export function calcolaGiorno(G, pag, pren, corr) {
  const out = { gp: 0, pc: 0, po: 0, campi: 0, padelCampi: 0, torneo: 0, prodotti: 0, lezioniP: 0, partite: 0, unlimited: 0, kpadel: 0, rimborsi: 0, rimborsiAltriGiorni: 0, notaRimborsi: '' };
  const kBook = new Set(pren.filter(b => giorno(b['Giorno']) === G && KP.test(String(b['Giocatori (nomi)'] || ''))).map(b => String(b['Inizio'])));
  const note = [];
  pag.filter(p => giorno(p['Giorno pagamento']) === G).forEach(p => {
    const tot = num(p['Totale €']), stato = String(p['Stato'] || ''), prod = String(p['Prodotto'] || ''), club = String(p['Prodotto del club'] || '');
    if (!tot) return;
    if (/REFUNDED/i.test(stato) && tot > 0) return;
    if (tot < 0) {
      const gs = giorno(p['Giorno servizio']);
      // il pagamento rimborsato era di un altro giorno? (caso del 20/11: lezione pagata il 10/11, rimborsata il 20/11)
      const orig = pag.find(q => num(q['Totale €']) === -tot && String(q['Prodotto']) === prod && giorno(q['Giorno servizio']) === gs && String(q['Ora servizio']) === String(p['Ora servizio']));
      const altro = (gs && gs !== G) || (orig && giorno(orig['Giorno pagamento']) !== G);
      if (altro) { out.rimborsiAltriGiorni += tot; note.push('Rimborso di ' + Math.abs(tot) + ' € (' + prod + ', servizio ' + gs.split('-').reverse().join('/') + (orig ? ', pagato il ' + giorno(orig['Giorno pagamento']).split('-').reverse().join('/') : '') + '): non si toglie dall\'incasso del giorno'); return; }
      out.rimborsi += tot;
    }
    out.gp += tot;
    if (String(p['Metodo']) === 'ONSITE' && /CASH/i.test(String(p['Pagato in cassa'] || ''))) out.pc += tot;
    const kpad = (giorno(p['Giorno servizio']) === G && kBook.has(String(p['Ora servizio']))) || (prod === 'CLUB_PRODUCT' && KP.test(club));
    if (kpad) out.kpadel += tot;
    else if (prod === 'TOURNAMENT_REGISTRATION') out.torneo += tot;
    else if (prod === 'ACADEMY_CLASS_REGISTRATION' || (prod === 'CLUB_PRODUCT' && /lezion/i.test(club))) out.lezioniP += tot;
    else if (prod === 'CLUB_PRODUCT' && /unlimited|unilimited|unilpa/i.test(club)) out.unlimited += tot;
    else if (prod === 'CLUB_PRODUCT') out.prodotti += tot;
    else out.padelCampi += tot;
  });
  const c = corr.filter(x => giorno(x['Giorno']) === G && String(x['K padel giusto (€)'] || '').trim() !== '').pop();
  if (c) { const giusto = num(c['K padel giusto (€)']); out.padelCampi += out.kpadel - giusto; out.kpadel = giusto; }
  out.campi = pren.filter(b => giorno(b['Giorno']) === G && String(b['Tipo']) !== 'TOURNAMENT' && !/CANCEL/i.test(String(b['Stato'] || '')) && !String(b['Annullata'] || '').trim()).length;
  Object.keys(out).forEach(k => { if (typeof out[k] === 'number') out[k] = r2(out[k]); });
  out.po = r2(out.gp - out.pc);
  const somma = r2(out.padelCampi + out.kpadel + out.torneo + out.lezioniP + out.unlimited + out.prodotti);
  if (Math.abs(somma - out.gp) > 0.01) out.padelCampi = r2(out.padelCampi + out.gp - somma);
  out.notaRimborsi = note.join(' · ');
  return out;
}

export async function pnPlaytomic(chiave, provaGiorni) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  const [pag, pren, corr] = await Promise.all([scheda('Pagamenti'), scheda('Prenotazioni'), scheda('Correzioni K')]);
  if (Array.isArray(provaGiorni)) { const o = {}; provaGiorni.forEach(G => { o[G] = calcolaGiorno(G, pag, pren, corr); }); return { ok: true, prova: o }; }   // solo calcolo, niente scritture
  const raw = (await (await db('/rest/v1/gas_fogli?foglio=eq.' + FOGLIO + '&scheda=eq.Info&select=valori')).json())[0];
  const rigaAgg = ((raw && raw.valori) || []).find(r => /ultimo aggiornamento/i.test(String(r[0])));
  const b2 = rigaAgg && rigaAgg[1];
  const quando = b2 && b2.$d ? new Date(b2.$d) : null;
  if (!quando || Date.now() - quando.getTime() > 2 * 3600e3) return { ok: true, scritto: false, motivo: 'dati Playtomic vecchi o mancanti' };
  const ora = quando.toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const ieri = new Date(Date.now() - 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const doc = (await (await db('/rest/v1/pn_docs?path=eq.cassa/playtomic&select=data,versione')).json())[0] || { data: {}, versione: 0 };
  const data = doc.data || {}, giorni = data.giorni || {};
  const limite = new Date(Date.now() - 14 * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  Object.keys(giorni).forEach(g => { if (g < limite) delete giorni[g]; });
  for (const G of [ieri, oggi]) giorni[G] = { ...calcolaGiorno(G, pag, pren, corr), ora };
  const nuovo = { ...data, aggiornato: ora, fonte: 'Jarvis · API Playtomic', giorni };
  const w = await db('/rest/v1/pn_docs?path=eq.cassa/playtomic', 'PATCH', { data: nuovo, versione: (doc.versione || 0) + 1, aggiornato_il: new Date().toISOString() }, { Prefer: 'return=minimal' });
  return { ok: w.ok, scritto: w.ok, oggi: giorni[oggi], ieri: giorni[ieri] };
}
