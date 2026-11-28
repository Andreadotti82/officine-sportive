// Numeri di Wellness nel Daily della sera (prima li calcolava un compito di Claude alle 21:35 sui file del Drive Google).
// Regole di Andrea (21-23/11/2026): vedi STATO-JARVIS.md, «Numeri Wellness nel Daily».
import { db, segreto, inviaMail } from './_jarvis-base.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kyricrhlqlassvhxqjgf.supabase.co';
const K = process.env.SUPABASE_SERVICE_KEY || '';
const H = () => ({ apikey: K, ...(K.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + K }) });
const CARTELLA = '1grKl9i2yN9hNSI3JIOfAzOAaJ0SZ_-qr';
const DAILY = '1yeXgJUzP2G2qcEbSj4qA3YiZaKCT9o9KcguBpOahjps';

/* ---------- CSV di Wellness: separatore «;», valori ="testo" ---------- */
export function leggiCsv(testo) {
  const righe = [];
  let riga = [], campo = '', dentro = false;
  const t = String(testo || '').replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (dentro) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else dentro = false; }
      else campo += c;
    } else if (c === '"') dentro = true;
    else if (c === ';') { riga.push(campo); campo = ''; }
    else if (c === '\n') { riga.push(campo); righe.push(riga); riga = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || riga.length) { riga.push(campo); righe.push(riga); }
  return righe.map(r => r.map(v => String(v).replace(/^=/, '').trim()));
}
const num = v => { const x = parseFloat(String(v || '').replace(/\./g, '').replace(',', '.')); return isNaN(x) ? 0 : x; };
const data = v => { const m = String(v || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? m[3] + '-' + m[2] + '-' + m[1] : ''; };
const r2 = x => Math.round(x * 100) / 100;
function colonne(h) {
  return (re, n = 0) => { let c = 0; for (let i = 0; i < h.length; i++) if (re.test(h[i])) { if (c === n) return i; c++; } return -1; };
}

/* ---------- Calcolo (puro, provabile) ---------- */
export function calcola({ j1, j2, j3, j4 }, oggi, disdetteIeri) {
  const out = {}, nota = [];
  const meseOggi = oggi.slice(0, 7);
  const domani = new Date(oggi + 'T12:00:00Z'); domani.setUTCDate(domani.getUTCDate() + 1);
  const dom = domani.toISOString().slice(0, 10);
  const fineMese = new Date(Date.UTC(+oggi.slice(0, 4), +oggi.slice(5, 7), 0)).toISOString().slice(0, 10);
  const prossimo = new Date(Date.UTC(+oggi.slice(0, 4), +oggi.slice(5, 7), 1)).toISOString().slice(0, 7);
  const treMesi = new Date(Date.UTC(+oggi.slice(0, 4), +oggi.slice(5, 7) - 3, 1)).toISOString().slice(0, 10);
  const inizioMese = meseOggi + '-01';

  if (j3) {
    const h = j3[0], c = colonne(h), kD = c(/^Data registrazione vendita$/), kP = c(/^Prodotto$/);
    const oggiR = j3.slice(1).filter(r => data(r[kD]) === oggi);
    out['Totale vendite open'] = oggiR.filter(r => r[kP] === 'FITNESS - PER ABBONAMENTI').length;
    out['Vendite nuoto'] = oggiR.filter(r => /nuoto/i.test(r[kP])).length;
  } else nota.push('manca il Jarvis 3 di oggi');

  if (j4) {
    const h = j4[0], c = colonne(h);
    const kDett = c(/^Dettaglio vendita$/), kReg = c(/^Data registrazione vendita$/), kImp = c(/^Importo$/), kPag = c(/^Pagato il$/), kPrev = c(/^Data pagamento prevista$/), kCog = c(/^Cognome$/), kNom = c(/^Nome$/);
    const R = j4.slice(1).filter(r => r.length > kImp);
    const diOggi = R.filter(r => data(r[kReg]) === oggi);
    out['Totale prorata'] = r2(diOggi.filter(r => /^pro rata/i.test(r[kDett])).reduce((a, r) => a + num(r[kImp]), 0));
    out['Bracciali'] = diOggi.filter(r => /braccialett/i.test(r[kDett])).length;
    out['Ingressi giornalieri'] = diOggi.filter(r => /ingresso giornaliero/i.test(r[kDett])).length;
    out['Saune'] = diOggi.filter(r => /sauna/i.test(r[kDett])).length;
    out['Incassato centro estivo'] = r2(diOggi.filter(r => /centro estivo|campus/i.test(r[kDett])).reduce((a, r) => a + num(r[kImp]), 0));
    const nonPag = R.filter(r => !String(r[kPag] || '').trim());
    const ins = nonPag.filter(r => { const p = data(r[kPrev]); return p && p <= oggi && num(r[kImp]) > 0; });
    const nuoto = r => /nuoto/i.test(r[kDett]);
    const insMese = ins.filter(r => data(r[kPrev]) >= inizioMese);
    out['Totale insoluti mese in corso'] = r2(insMese.filter(r => !nuoto(r)).reduce((a, r) => a + num(r[kImp]), 0));
    out['Insoluti univoci mese in corso'] = new Set(insMese.filter(r => !nuoto(r)).map(r => (r[kCog] + '|' + r[kNom]).toLowerCase())).size;
    out['Totale insoluti ultimi 3 mesi'] = r2(ins.filter(r => data(r[kPrev]) >= treMesi && !nuoto(r)).reduce((a, r) => a + num(r[kImp]), 0));
    out['Insoluti nuoto mese in corso'] = r2(insMese.filter(nuoto).reduce((a, r) => a + num(r[kImp]), 0));
    const rid = nonPag.filter(r => !/pro rata|penale|ingresso|braccialett/i.test(r[kDett]));
    const succ = rid.filter(r => data(r[kPrev]).slice(0, 7) === prossimo);
    out['Totale RID ancora da incassare in questo mese'] = r2(rid.filter(r => { const p = data(r[kPrev]); return p >= dom && p <= fineMese && !nuoto(r); }).reduce((a, r) => a + num(r[kImp]), 0));
    if (succ.length) {
      out['Totale RID mese successivo'] = r2(succ.filter(r => !nuoto(r)).reduce((a, r) => a + num(r[kImp]), 0));
      out['RID nuoto mese successivo'] = r2(succ.filter(nuoto).reduce((a, r) => a + num(r[kImp]), 0));
    } else nota.push('nel Jarvis 4 non ci sono rate del mese prossimo: RID del mese successivo lasciati vuoti');
  } else nota.push('manca il Jarvis 4 di oggi');

  if (j2) {
    const h = j2[0], c = colonne(h), kC = c(/^Cognome$/), kN = c(/^Nome$/), kT = c(/^Tipo attività$/), kI = c(/^Inizio abilitazione$/), kF = c(/^Termine abilitazione$/), kDd = c(/^Data disdetta$/), kPk = c(/^Pacchetto$/);
    const att = new Set();
    let disd = 0;
    j2.slice(1).forEach(r => {
      if (r[kT] === 'FITNESS' && !/iscrizione|asciugaman|campus/i.test(r[kPk] || '')) {   // iscrizioni nuoto, asciugamani e campus non sono abbonamenti
        const i = data(r[kI]), f = data(r[kF]); if (i && f && i <= oggi && oggi <= f) att.add((r[kC] + '|' + r[kN]).toLowerCase()); }
      if (data(r[kDd]) === oggi) disd++;
    });
    out['Actives member'] = att.size;
    out['Disdette'] = (oggi.slice(8) === '01' ? 0 : Number(disdetteIeri) || 0) + disd;
  } else nota.push('manca il Jarvis 2');

  if (j1) {
    const h = j1[0], c = colonne(h), kS = c(/^Stato utente$/, 0), kV = c(/^Validità certificato medico$/);
    const attivi = j1.slice(1).filter(r => r[kS] === 'Attivo');
    out['Certificati medici assenti'] = attivi.filter(r => !String(r[kV] || '').trim()).length;
    out['Certificati medici scaduti'] = attivi.filter(r => { const v = data(r[kV]); return v && v < oggi; }).length;
  } else nota.push('manca il Jarvis 1');
  return { valori: out, nota };
}

/* ---------- File del giorno: quelli caricati su Jarvis (gas_file) + la copia del Drive (drive_file) ---------- */
async function json(u) { const r = await db(u); return r.ok ? r.json() : []; }
async function scarica(path) {
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/jarvis-file/' + path.split('/').map(encodeURIComponent).join('/'), { headers: H() });
  if (!r.ok) throw new Error('file non leggibile: ' + path);
  return Buffer.from(await r.arrayBuffer()).toString('utf8');
}
async function fileDelGiorno(oggi) {
  const g = await json('/rest/v1/gas_file?cartella=eq.' + CARTELLA + '&select=nome,path,dim,creato_il&order=creato_il.desc&limit=200');
  const d = await json('/rest/v1/drive_file?cartella=like.*Report%20Wellness&select=nome,path,dimensione,modificato&order=modificato.desc&limit=200');
  const tutti = g.map(x => ({ nome: x.nome, path: x.path, dim: Number(x.dim) || 0, quando: x.creato_il }))
    .concat(d.filter(x => x.path).map(x => ({ nome: x.nome, path: x.path, dim: Number(x.dimensione) || 0, quando: x.modificato })));
  const giorno = q => new Date(q).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const scegli = (re, testa, soloOggi = true) => tutti.filter(f => re.test(f.nome) && !/storico/i.test(f.nome) && (!soloOggi || giorno(f.quando) === oggi))
    .sort((a, b) => (giorno(b.quando).localeCompare(giorno(a.quando))) || (b.dim - a.dim))[0];
  return {
    j3: scegli(/jarvis 3|analisi_vendite_abbonamenti/i), j4: scegli(/jarvis 4|analisi_pagamenti/i),
    j2: scegli(/jarvis 2|analisi_scadenze_abilitazioni/i), j1: scegli(/jarvis 1|analisi_utenti/i)
  };
}

/* ---------- Giro: calcola e scrive nella riga di oggi del Daily (non la crea: la crea la Prima nota) ---------- */
// Ultimo giro della sera: se manca un file, Jarvis scrive ad Alessandro (regola di Andrea del 28/11/2026)
async function avvisaFileMancanti(oggi, mancano) {
  const st = (await json('/rest/v1/jarvis_stato?chiave=eq.daily-avviso&select=valore'))[0];
  if (st && st.valore && st.valore.giorno === oggi) return;
  const link = 'https://officine-sportive.vercel.app/goodmorning?page=dati&amp;t=' + (mancano.some(x => /3|4/.test(x)) ? 'sera' : 'mattina');
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#14323F;max-width:620px"><div style="background:#13556F;color:#ffffff;padding:16px 20px;font-size:12px;letter-spacing:2px;font-weight:bold;border-radius:12px 12px 0 0">OFFICINE SPORTIVE · DAILY</div>'
    + '<div style="padding:20px;border:1px solid #DCE6E8;border-top:0;border-radius:0 0 12px 12px;font-size:15px;line-height:1.55"><div style="font-size:19px;font-weight:bold;color:#13556F;margin:0 0 14px">📊 Mi manca qualche file per il Daily</div>'
    + '<p style="margin:0 0 12px">Ciao Alessandro! 👋</p><p style="margin:0 0 12px">per completare i numeri del Daily di oggi mi manca: <b>' + mancano.join(', ') + '</b>. Quando hai un attimo, me lo carichi qui? 🙏</p>'
    + '<a href="' + link + '" style="display:block;text-decoration:none;color:#14323F;background:#F3F8F8;border:2px dashed #1A9DA7;border-radius:14px;padding:18px 16px;text-align:center;margin:4px 0 12px"><div style="font-size:26px;line-height:1">📤</div><div style="font-size:18px;font-weight:bold;color:#13556F;margin:6px 0 2px">Carica i file</div></a>'
    + '<p style="margin:0;font-size:13px;color:#5A707A">Appena arrivano, i numeri si sistemano da soli. Grazie mille! 🙌</p>'
    + '<table role="presentation" style="margin:18px 0 0"><tr><td style="vertical-align:middle;padding-right:10px"><img src="https://officine-sportive.vercel.app/jarvis-logo.gif" width="56" height="56" alt="Jarvis"></td><td style="vertical-align:middle;font-size:15px">Un caro saluto,<br><b>Jarvis</b></td></tr></table></div></div>';
  await inviaMail('alessandropt@officinesportive.it', '📊 Daily: mi manca ' + mancano.join(', '), html, 'Jarvis · Officine Sportive');
  await db('/rest/v1/jarvis_stato', 'POST', { chiave: 'daily-avviso', valore: { giorno: oggi, mancano } }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
}

export async function wellnessDaily(chiave, giorno, scrivi, ultimo) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  const oggi = giorno || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const f = await fileDelGiorno(oggi), csv = {}, usati = {};
  for (const k of ['j1', 'j2', 'j3', 'j4']) if (f[k]) { csv[k] = leggiCsv(await scarica(f[k].path)); usati[k] = f[k].nome; }
  const fg = (await json('/rest/v1/gas_fogli?foglio=eq.' + DAILY + '&scheda=eq.Daily&select=valori'))[0];
  if (!fg) return { ok: false, errore: 'foglio Daily non trovato' };
  const v = fg.valori, h = v[0];
  const iData = h.indexOf('Data'), iDis = h.indexOf('Disdette');
  const riga = v.findIndex((r, i) => i > 0 && String(r[iData]).slice(0, 10) === oggi);
  const ieri = v.filter((r, i) => i > 0 && String(r[iData]).slice(0, 10) < oggi).pop();
  const { valori, nota } = calcola(csv, oggi, ieri ? ieri[iDis] : 0);
  const iAtt = h.indexOf('Actives member'), attIeri = ieri ? Number(ieri[iAtt]) || 0 : 0;
  if (valori['Actives member'] != null && attIeri && valori['Actives member'] < attIeri * 0.7) {   // Jarvis 2 incompleto: non sporcare il dato
    nota.push('soci attivi ' + valori['Actives member'] + ' contro ' + attIeri + ' di ieri: Jarvis 2 incompleto, lasciato il valore di ieri');
    valori['Actives member'] = attIeri;
  }
  const mancano = ['j1', 'j2', 'j3', 'j4'].filter(k => !csv[k]).map(k => 'Jarvis ' + k.slice(1));
  if (ultimo && scrivi && mancano.length) await avvisaFileMancanti(oggi, mancano);
  if (riga < 0) return { ok: true, scritto: false, motivo: 'riga di oggi non ancora creata dalla Prima nota', valori, nota, usati, mancano };
  if (!scrivi) return { ok: true, scritto: false, valori, nota, usati };
  const r = v[riga].slice();
  while (r.length < h.length) r.push('');
  Object.keys(valori).forEach(k => { const i = h.indexOf(k); if (i >= 0) r[i] = valori[k]; });
  v[riga] = r;
  const up = await db('/rest/v1/gas_fogli?foglio=eq.' + DAILY + '&scheda=eq.Daily', 'PATCH', { valori: v, aggiornato_il: new Date().toISOString() }, { Prefer: 'return=minimal' });
  return { ok: up.ok, scritto: up.ok, valori, nota, usati };
}
