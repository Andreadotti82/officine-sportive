// API Vercel: gateway per App Contratti
// Riceve POST { fn, args } e smista alla funzione giusta
// Replica le funzioni di google.script.run del vecchio GAS

import { CONDIZIONI, INFORMATIVA, SPUNTE } from './_testi-contratto.js';
import { COMUNI } from './_comuni.js';
import { htmlContratto } from './_pdf-contratto.js';
import { pdfContratto } from './_pdf-lib-contratto.js';

let _crypto = null;
async function getCrypto() { if (!_crypto) _crypto = await import('node:crypto'); return _crypto; }

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kyricrhlqlassvhxqjgf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5cmljcmhscWxhc3N2aHhxamdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2OTU4MjEsImV4cCI6MjExMTI3MTgyMX0.PgX0_48IE63SB7MFEWaRSpMsA7uPqAh2GLQ-X2uNuyU';
const SKEBBY_USER = process.env.SKEBBY_USER || '';
const SKEBBY_PASS = process.env.SKEBBY_PASS || '';
const SUMUP_KEY = process.env.SUMUP_API_KEY || '';
const SUMUP_MERCHANT = process.env.SUMUP_MERCHANT_CODE || '';
const RESEND_KEY = process.env.RESEND_API_KEY || '';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const { fn, args } = req.body || {};
  if (!fn) return res.status(400).json({ ok: false, errore: 'Funzione mancante' });

  try {
    const comando = FUNZIONI[fn];
    if (!comando) return res.status(400).json({ ok: false, errore: 'Funzione non trovata: ' + fn });
    const data = await comando(...(args || []));
    return res.json({ ok: true, data });
  } catch (err) {
    console.error(`Errore contratti/${fn}:`, err);
    return res.status(500).json({ ok: false, errore: err.message || 'Errore interno' });
  }
}

// === Helper Supabase ===
// Chiave segreta di Supabase: solo lato server, per le tabelle chiuse al pubblico (es. liberatorie).
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
async function supaFetchSrv(path, method, body, extraHeaders) {
  if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY non configurata');
  method = method || 'GET';
  const auth = SUPABASE_SERVICE_KEY.startsWith('sb_') ? {} : { 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` };
  const headers = { 'Content-Type': 'application/json', 'apikey': SUPABASE_SERVICE_KEY, ...auth, ...(extraHeaders || {}) };
  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const r = await fetch(`${SUPABASE_URL}${path}`, opts);
  if (!r.ok) console.error('[DB] ' + method + ' ' + path.split('?')[0] + ' -> ' + r.status + ' ' + (await r.clone().text()).slice(0, 200));
  return r;
}

async function supaFetch(path, method, body, extraHeaders) {
  method = method || 'GET';
  const headers = { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, ...(extraHeaders || {}) };
  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const r = await fetch(`${SUPABASE_URL}${path}`, opts);
  return r;
}

// === MESI E DATE ===
const MESI_IT = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
function dt(y, m, d) { return new Date(y, m, d, 12, 0, 0); }
function giorniNelMese(y, m) { return new Date(y, m + 1, 0).getDate(); }
function fmtData(d) { return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); }
function fmtDataLunga(d) { return d.getDate()+' '+MESI_IT[d.getMonth()]+' '+d.getFullYear(); }
function euro(n) { return '€ ' + Number(n).toFixed(2).replace('.', ','); }
function arrotonda(n) { return Math.round(Number(n) * 100) / 100; }
function ultimoGiorno(y, m) { return dt(y, m, giorniNelMese(y, m)); }
function aggiungiMesi(d, n) { return dt(d.getFullYear(), d.getMonth() + n, 1); }
function aggiungiGiorni(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function mesiTra(inizio, scadenza) { return (scadenza.getFullYear() - inizio.getFullYear()) * 12 + (scadenza.getMonth() - inizio.getMonth()) + 1; }
function euroInteri(n) { return arrotonda(n); }

// === CATALOGO ===
// Regola del circolo: tutto ciò che è di PROVA (cognome «Prova») sparisce 30 minuti dopo la firma.
// Gira a ogni apertura della pagina e del back office, così nessuno vede prove vecchie.
async function pulisciProve() {
  if (!SUPABASE_SERVICE_KEY) return;
  const limite = encodeURIComponent(new Date(Date.now() - 30 * 60000).toISOString());
  try {
    const limite60 = encodeURIComponent(new Date(Date.now() - 60 * 60000).toISOString());
    const filtro = `prova=eq.true&or=(and(firmato_il.lt.${limite},pdf_inviato_il.not.is.null),firmato_il.lt.${limite60},and(firmato_il.is.null,creato_il.lt.${limite}))`;
    const rp = await supaFetchSrv(`/rest/v1/contratti?${filtro}&pdf_path=not.is.null&select=pdf_path`);
    const pdfProva = (await rp.json() || []).map(x => x.pdf_path).filter(Boolean);
    if (pdfProva.length) await fetch(`${SUPABASE_URL}/storage/v1/object/contratti`, { method: 'DELETE', headers: { ...storageAuth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: pdfProva }) });
    await supaFetchSrv(`/rest/v1/contratti?${filtro}`, 'DELETE', null, { 'Prefer': 'return=minimal' });
    await supaFetchSrv(`/rest/v1/liberatorie?prova=eq.true&or=(firmata_il.lt.${limite},and(firmata_il.is.null,creata_il.lt.${limite}))`, 'DELETE', null, { 'Prefer': 'return=minimal' });
  } catch (e) { console.error('[PROVE] Pulizia non riuscita:', e.message || e); }
}

async function catalogo() {
  const pulizia = pulisciProve();
  // Tutte le query in parallelo per velocizzare il caricamento
  const [r1, r2, r3] = await Promise.all([
    supaFetch('/rest/v1/listino?attivo=eq.true&order=ordine'),
    supaFetch('/rest/v1/promo?attivo=eq.true'),
    supaFetch('/rest/v1/turni_docs?path=eq.contratti/config&select=data')
  ]);
  const [lista, promoList, cfgRows] = await Promise.all([r1.json(), r2.json(), r3.json(), pulizia]);

  return {
    listino: lista,
    promo: promoList,
    impostazioni: cfgRows.length ? cfgRows[0].data : {},
    condizioni: CONDIZIONI,
    informativa: INFORMATIVA,
    spunte: SPUNTE,
    oggi: fmtData(new Date())
  };
}

// === CODICE FISCALE (identico alla versione Google, con omocodia e luogo di nascita) ===
const CF_MESI = 'ABCDEHLMPRST';
const CF_OMOCODIA = 'LMNPQRSTUV';
const CF_DISPARI = { '0':1,'1':0,'2':5,'3':7,'4':9,'5':13,'6':15,'7':17,'8':19,'9':21,
  'A':1,'B':0,'C':5,'D':7,'E':9,'F':13,'G':15,'H':17,'I':19,'J':21,'K':2,'L':4,'M':18,'N':20,
  'O':11,'P':3,'Q':6,'R':8,'S':12,'T':14,'U':16,'V':10,'W':22,'X':25,'Y':24,'Z':23 };
function cfPulisci(cf) { return String(cf || '').toUpperCase().replace(/\s+/g, ''); }
function cfControllo(cf15) {
  let s = 0;
  for (let i = 0; i < 15; i++) {
    const c = cf15.charAt(i);
    if ((i + 1) % 2 === 1) s += CF_DISPARI[c];
    else s += /[0-9]/.test(c) ? Number(c) : c.charCodeAt(0) - 65;
  }
  return String.fromCharCode(65 + (s % 26));
}
function cfNormalizza(cf) {
  const a = cf.split('');
  [6, 7, 9, 10, 12, 13, 14].forEach(p => { const k = CF_OMOCODIA.indexOf(a[p]); if (k >= 0) a[p] = String(k); });
  return a.join('');
}
function analizzaCF(cf, oggi) {
  cf = cfPulisci(cf);
  oggi = oggi ? new Date(oggi) : new Date();
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf))
    return { valido: false, errore: 'Il codice fiscale non ha un formato valido.' };
  if (cfControllo(cf.substr(0, 15)) !== cf.charAt(15))
    return { valido: false, errore: 'Il codice fiscale non è corretto: controlla di averlo scritto bene.' };
  const n = cfNormalizza(cf);
  const yy = Number(n.substr(6, 2)), mese = CF_MESI.indexOf(n.charAt(8));
  let gg = Number(n.substr(9, 2));
  const sesso = gg > 40 ? 'F' : 'M';
  if (gg > 40) gg -= 40;
  const anno = (yy > oggi.getFullYear() % 100 ? 1900 : 2000) + yy;
  const nascita = dt(anno, mese, gg);
  if (nascita.getMonth() !== mese || gg < 1) return { valido: false, errore: 'La data di nascita nel codice fiscale non è valida.' };
  const eta = etaAl(nascita, oggi);
  return { valido: true, cf, sesso, nascitaData: nascita, nascita: fmtData(nascita), eta, minore: eta < 18, codiceComune: n.substr(11, 4) };
}
function etaAl(nascita, data) {
  let e = data.getFullYear() - nascita.getFullYear();
  if (data.getMonth() < nascita.getMonth() || (data.getMonth() === nascita.getMonth() && data.getDate() < nascita.getDate())) e--;
  return e;
}
function cfConsonanti(s) { return s.replace(/[^BCDFGHJKLMNPQRSTVWXYZ]/g, ''); }
function cfVocali(s) { return s.replace(/[^AEIOU]/g, ''); }
function cfPrepara(s) { return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z]/g, ''); }
function cfCodiceCognome(c) { const s = cfPrepara(c); return (cfConsonanti(s) + cfVocali(s) + 'XXX').substr(0, 3); }
function cfCodiceNome(nome) {
  const s = cfPrepara(nome), c = cfConsonanti(s);
  if (c.length >= 4) return c.charAt(0) + c.charAt(2) + c.charAt(3);
  return (c + cfVocali(s) + 'XXX').substr(0, 3);
}
function verificaNomeCF(nome, cognome, cf) {
  cf = cfPulisci(cf);
  const ok = cfCodiceCognome(cognome) === cf.substr(0, 3) && cfCodiceNome(nome) === cf.substr(3, 3);
  return { corrispondente: ok };
}
function luogoNascita(codice) {
  if (codice.charAt(0) === 'Z') return { nome: 'Stato estero (' + codice + ')', provincia: 'EE' };
  const c = COMUNI[codice];
  return c ? { nome: c[0], provincia: c[1] } : { nome: 'Comune ' + codice, provincia: '' };
}
function datiDaCF(cf, nome, cognome) {
  const a = analizzaCF(cf);
  if (!a.valido) return { ok: false, errore: a.errore };
  const l = luogoNascita(a.codiceComune);
  const v = nome && cognome ? verificaNomeCF(nome, cognome, cf) : { corrispondente: null };
  return { ok: true, sesso: a.sesso, nascita: a.nascita, eta: a.eta, minore: a.minore,
    luogo: l.nome, provincia: l.provincia, nomeOk: v.corrispondente };
}

// === VERIFICA PROMO ===
async function verificaPromo(codice, abbId) {
  codice = String(codice || '').replace(/\s+/g, '').toUpperCase();
  if (!codice) return { valido: false, errore: 'Inserisci un codice promo.' };

  const r = await supaFetch(`/rest/v1/promo?codice=eq.${encodeURIComponent(codice)}&attivo=eq.true`);
  const rows = await r.json();
  if (!rows.length) return { valido: false, errore: 'Codice promo non riconosciuto.' };

  const promo = rows[0];
  const oggi = new Date();
  if (promo.data_fine && new Date(promo.data_fine) < oggi) return { valido: false, errore: 'Questa promozione è scaduta.' };
  if (promo.data_inizio && new Date(promo.data_inizio) > oggi) return { valido: false, errore: 'Questa promozione non è ancora attiva.' };

  return { valido: true, ok: true, promo, descrizione: promo.descrizione || promo.codice };
}

// === PREVENTIVO ===
async function preventivo(abbId, codicePromo, primoGiorno, upg) {
  const r = await supaFetch(`/rest/v1/listino?id=eq.${encodeURIComponent(abbId)}`);
  const rows = await r.json();
  if (!rows.length) return { errore: 'Abbonamento non trovato.' };
  const abb = rows[0];
  let promo = null;
  if (codicePromo) { const rp = await verificaPromo(codicePromo, abbId); if (rp.valido) promo = rp.promo; }
  const r3 = await supaFetch('/rest/v1/turni_docs?path=eq.contratti/config&select=data');
  const cfgRows = await r3.json();
  const imp = cfgRows.length ? cfgRows[0].data : {};
  const firma = primoGiorno ? new Date(primoGiorno.split('/').reverse().join('-')) : new Date();
  const piano = calcolaPiano(abb, promo, firma, { primaRataAllaFirma: imp.primaRataAllaFirma !== false, includiGiornoIscrizione: imp.giornoIscrizioneNelProRata !== false, penale: imp.penale || 6, upgrade: upg || null });
  return { ok: true, abbonamento: abb, promo, piano };
}

function calcolaPiano(abb, promo, firma, opz) {
  opz = opz || {};
  const includi = opz.includiGiornoIscrizione !== false;
  const omaggio = !!(promo && promo.omaggio);
  let prezzo = omaggio ? 0 : Number(abb.prezzo) || 0;
  if (!omaggio && promo && promo.prezzo_rata != null && promo.prezzo_rata !== '' && !isNaN(Number(promo.prezzo_rata))) prezzo = Number(promo.prezzo_rata);
  else if (!omaggio && promo && Number(promo.sconto_percento) > 0) prezzo = arrotonda(prezzo * (1 - Number(promo.sconto_percento) / 100));
  const iscrizione = omaggio ? 0 : Number(abb.iscrizione) || 0;
  const p = { abbonamento: abb.nome, area: abb.area, tipo: abb.tipo, firma: fmtData(firma), primoGiorno: fmtData(firma),
    garanziaFino: abb.tipo === 'lungo' ? fmtData(aggiungiGiorni(firma, 14)) : null,
    iscrizione: arrotonda(iscrizione), prezzo: arrotonda(prezzo), pagamento: abb.pagamento,
    rinnovo: !!abb.rinnovo, fasciaOraria: abb.fascia_oraria || '',
    prorata: [], prorataTotale: 0, primaRataAllaFirma: false, totaleFirma: 0, righeFirma: [],
    promo: promo ? promo.descrizione || promo.codice : '', penale: opz.penale };
  if (abb.tipo === 'giornaliero') {
    p.inizio = fmtData(firma); p.scadenza = fmtData(firma); p.rinnovo = false; p.disdettaEntro = null;
    p.totaleFirma = euro(arrotonda(prezzo + iscrizione));
    if (iscrizione) p.righeFirma.push({ voce: 'Iscrizione', importo: euro(iscrizione) });
    p.righeFirma.push({ voce: 'Abbonamento giornaliero del ' + fmtData(firma), importo: euro(prezzo) });
    p.pianoRate = 'Pagamento unico alla firma'; return p;
  }
  const rataMese = abb.pagamento === 'annuale' ? prezzo / 12 : prezzo;
  const y = firma.getFullYear(), m = firma.getMonth(), d = firma.getDate();
  const extra = promo && promo.mesi_prorata_extra ? Number(promo.mesi_prorata_extra) : 0;
  let importi = null;
  if (omaggio) importi = [0];
  else if (promo && promo.importo_prorata_mese != null && promo.importo_prorata_mese !== '') {
    importi = String(promo.importo_prorata_mese).split(/[;\/]/).map(x => Number(String(x).replace(',','.').trim())).filter(x => !isNaN(x));
    if (!importi.length) importi = null;
  }
  const importoFisso = importi ? importi[0] : null;
  const importoMese = (i) => importi ? importi[Math.min(i, importi.length - 1)] : null;
  let fisso = promo && promo.inizio_abbonamento ? promo.inizio_abbonamento : null;
  if (fisso && typeof fisso === 'string') { const pts = fisso.split('/'); if (pts.length === 3) fisso = dt(Number(pts[2]), Number(pts[1]) - 1, 1); else fisso = null; }
  let inizio;
  if (fisso) {
    const nMesi = (fisso.getFullYear() * 12 + fisso.getMonth()) - (y * 12 + m);
    for (let q = 0; q < nMesi; q++) {
      const mq = aggiungiMesi(dt(y, m, 1), q), gq = giorniNelMese(mq.getFullYear(), mq.getMonth());
      const daq = q === 0 ? firma : mq, giorniQ = q === 0 ? gq - d + (includi ? 1 : 0) : gq;
      const impQ = importi ? importoMese(q) : (q === 0 ? rataMese / gq * giorniQ : rataMese);
      p.prorata.push({ periodo: fmtData(daq) + ' – ' + fmtData(ultimoGiorno(mq.getFullYear(), mq.getMonth())), mese: MESI_IT[mq.getMonth()] + ' ' + mq.getFullYear(), giorni: giorniQ, importo: euroInteri(impQ) });
    }
    inizio = dt(fisso.getFullYear(), fisso.getMonth(), 1);
  } else if (d === 1 && !extra) {
    inizio = dt(y, m, 1);
  } else {
    if (d !== 1) {
      const gm = giorniNelMese(y, m), giorni = gm - d + (includi ? 1 : 0);
      const imp = importi ? importoMese(0) : rataMese / gm * giorni;
      p.prorata.push({ periodo: fmtData(firma) + ' – ' + fmtData(ultimoGiorno(y, m)), mese: MESI_IT[m] + ' ' + y, giorni, importo: euroInteri(imp) });
    }
    const pe = d === 1 ? 0 : 1;
    for (let k = 0; k < extra; k++) {
      const mm = aggiungiMesi(dt(y, m, 1), pe + k);
      p.prorata.push({ periodo: fmtData(mm) + ' – ' + fmtData(ultimoGiorno(mm.getFullYear(), mm.getMonth())), mese: MESI_IT[mm.getMonth()] + ' ' + mm.getFullYear(), giorni: giorniNelMese(mm.getFullYear(), mm.getMonth()), importo: euroInteri(importi ? importoMese(pe + k) : rataMese) });
    }
    inizio = aggiungiMesi(dt(y, m, 1), pe + extra);
  }
  p.inizio = fmtData(inizio);
  p.prorataTotale = arrotonda(p.prorata.reduce((s, r) => s + r.importo, 0));
  if (abb.fine_stagione) {
    const fs = String(abb.fine_stagione).split('-'), fm = Number(fs[0]) - 1, fg = Number(fs[1]);
    p.scadenza = fmtData(dt(inizio.getMonth() > fm ? inizio.getFullYear() + 1 : inizio.getFullYear(), fm, fg));
  } else {
    const um = aggiungiMesi(inizio, (Number(abb.durata_mesi) || 1) - 1);
    p.scadenza = fmtData(ultimoGiorno(um.getFullYear(), um.getMonth()));
  }
  const scadD = new Date(p.scadenza.split('/').reverse().join('-'));
  if (p.rinnovo && abb.tipo !== 'breve') {
    const mp = aggiungiMesi(dt(scadD.getFullYear(), scadD.getMonth(), 1), -1);
    p.disdettaEntro = fmtData(dt(mp.getFullYear(), mp.getMonth(), 5));
  } else { p.disdettaEntro = null; }
  if (iscrizione) p.righeFirma.push({ voce: 'Quota di iscrizione', importo: iscrizione });
  p.prorata.forEach(r => { p.righeFirma.push({ voce: 'Pro rata ' + r.mese + (importoFisso !== null ? ' (promozione)' : ' (' + r.giorni + ' giorni)'), importo: r.importo }); });
  const primaRata = promo && promo.prima_rata_alla_firma != null ? !!promo.prima_rata_alla_firma : (opz.primaRataAllaFirma !== false);
  const meseInizio = MESI_IT[inizio.getMonth()] + ' ' + inizio.getFullYear();
  if (abb.pagamento === 'annuale') {
    p.primaRataAllaFirma = true;
    p.righeFirma.push({ voce: 'Abbonamento annuale (' + meseInizio + ' – ' + MESI_IT[scadD.getMonth()] + ' ' + scadD.getFullYear() + ')', importo: prezzo });
    p.pianoRate = 'Pagamento annuale anticipato di ' + euro(prezzo) + (p.rinnovo ? ', a ogni rinnovo' : '');
  } else if (abb.pagamento === 'unico') {
    p.primaRataAllaFirma = true; p.righeFirma.push({ voce: 'Abbonamento', importo: prezzo }); p.pianoRate = 'Pagamento unico';
  } else {
    p.primaRataAllaFirma = primaRata;
    if (primaRata) {
      p.righeFirma.push({ voce: 'Prima rata (' + meseInizio + ')', importo: prezzo });
      p.pianoRate = 'Rata mensile di ' + euro(prezzo) + ' dal ' + fmtData(aggiungiMesi(inizio, 1)) + (p.rinnovo ? ', fino alla scadenza e a ogni rinnovo' : ', fino alla scadenza');
    } else {
      p.pianoRate = 'Rata mensile di ' + euro(prezzo) + ' dal ' + fmtData(inizio) + (p.rinnovo ? ', fino alla scadenza e a ogni rinnovo' : ', fino alla scadenza');
    }
    p.mesiDurata = mesiTra(inizio, scadD);
  }
  if (omaggio) { p.righeFirma = [{ voce: 'Abbonamento omaggio', importo: 0 }]; p.pianoRate = 'Abbonamento omaggio: nessun pagamento'; p.primaRataAllaFirma = false; }
  p.omaggio = omaggio;
  p.totaleFirma = arrotonda(p.righeFirma.reduce((s, r) => s + Number(r.importo), 0));
  // Formatta con € per il frontend
  p.totaleFirma = euro(p.totaleFirma);
  p.righeFirma.forEach(r => { r.importo = euro(r.importo); });
  p.prorata.forEach(r => { r.importo = euro(r.importo); });
  p.prorataTotale = euro(p.prorataTotale);
  // Stringa leggibile per il frontend
  p.prorataDescrizione = p.prorata.length ? p.prorata.map(r => r.importo + ' (' + r.mese + ')').join(' + ') + ' = ' + p.prorataTotale : '';
  if (p.penale) p.penale = euro(p.penale);
  return p;
}

// === TESTI SPUNTE ===
function testiSpunte() { return SPUNTE; }

// === BACK OFFICE ===
async function boLogin(pin, dispositivo) {
  // Leggi i PIN dalla tabella turni_docs (condivisi con app turni)
  const r = await supaFetch('/rest/v1/turni_docs?path=like.pins%2F%25&select=*');
  const pinDocs = await r.json();

  for (const doc of pinDocs) {
    const p = doc.data;
    if (!p || !p.hash || !p.salt) continue;

    // Verifica PIN con PBKDF2
    const c = await getCrypto();
    const hash = c.pbkdf2Sync(pin, p.salt, 150000, 32, 'sha256').toString('hex');

    if (hash === p.hash) {
      const staffId = doc.path.replace('pins/', '');
      // Genera token sessione
      const token = c.randomBytes(20).toString('hex');
      const scade = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      await supaFetch('/rest/v1/bo_sessioni', 'POST', {
        token, staff_id: staffId, staff_nome: staffId, dispositivo: dispositivo || '',
        creato_il: new Date().toISOString(), scade_il: scade.toISOString()
      });

      return { ok: true, token, nome: staffId };
    }
  }

  return { ok: false, errore: 'PIN non valido.' };
}

function dataOraRoma(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(',', '');
}
function dataIt(s) { return s ? String(s).slice(0, 10).split('-').reverse().join('/') : ''; }
function rigaElenco(c) {
  const d = c.dettagli || {}, t = d.titolare || {}, m = d.minore || null, p = d.piano || c.piano || {};
  const junior = c.junior;
  const intest = junior ? (c.genitore_nome || t.nome || '') + ' ' + (c.genitore_cognome || t.cognome || '') : c.nome + ' ' + c.cognome;
  const carta = c.pagamento_metodo === 'Carte online' ? (c.pagamento_stato === 'pagato' ? 'Pagato' + (c.pagato_il ? ' il ' + dataOraRoma(c.pagato_il) : '') : 'In attesa di pagamento') : '';
  return {
    numero: c.numero, data: dataOraRoma(c.firmato_il || c.data_firma || c.creato_il),
    area: c.area || c.categoria || p.area || '', abbonamento: c.abbonamento_nome || p.abbonamento || '',
    intestatario: intest.trim(), cf: junior ? (c.genitore_cf || t.cf || '') : (c.codice_fiscale || ''),
    email: c.email || '', cellulare: c.cellulare || '',
    junior: junior ? (m ? m.nome + ' ' + m.cognome : c.nome + ' ' + c.cognome) : '',
    inizio: p.inizio || '', scadenza: p.scadenza || dataIt(c.scadenza), disdetta: p.disdettaEntro || c.data_limite_disdetta || '',
    totale: c.totale_firma != null ? euro(c.totale_firma) : (p.totaleFirma || ''), rata: c.importo_rata != null ? euro(c.importo_rata) : '',
    promo: c.codice_promo || '', metodo: c.pagamento_metodo || '', carta, upgrade: d.upgrade ? (d.upgrade.cessione ? 'Cessione da: ' + d.upgrade.cedente : 'Sostituisce: ' + d.upgrade.vecchio) : '',
    inserito: c.inserito_gestionale ? (dataOraRoma(c.inserito_il) + (c.inserito_da ? ' da ' + c.inserito_da : '')) || 'sì' : '',
    prova: !!c.prova,
    dettagli: {
      nome: t.nome || (junior ? c.genitore_nome : c.nome) || '', cognome: t.cognome || (junior ? c.genitore_cognome : c.cognome) || '',
      nascita: t.nascita ? t.nascita + (t.luogoNascita ? ' · ' + t.luogoNascita : '') : (c.data_nascita ? dataIt(c.data_nascita) + (c.luogo_nascita ? ' · ' + c.luogo_nascita : '') : ''),
      indirizzo: t.via ? t.via + ' ' + t.civico + ', ' + t.cap + ' ' + t.comune + ' (' + t.provincia + ')' : [c.indirizzo, c.cap, c.comune, c.provincia ? '(' + c.provincia + ')' : ''].filter(Boolean).join(' '),
      telefono2: t.telefono2 || '',
      junior: m ? { nome: m.nome, cognome: m.cognome, cf: m.cf, nascita: m.nascita + (m.luogoNascita ? ' · ' + m.luogoNascita : '') } : null
    }
  };
}

async function boElenco(token, cerca, filtro) {
  const sessione = await verificaSessione(token);
  if (!sessione) return { ok: false, errore: 'Sessione scaduta.' };
  await pulisciProve();
  const base = '/rest/v1/contratti?firmato=eq.true&annullato=eq.false';
  const rd = await supaFetch(base + '&prova=eq.false&inserito_gestionale=is.false&select=id');
  const daInserire = (await rd.json() || []).length;
  let q = base + '&order=firmato_il.desc.nullslast&limit=80&select=*';
  if (filtro === 'da') q += '&prova=eq.false&inserito_gestionale=is.false';
  if (filtro === 'fatti') q += '&inserito_gestionale=is.true';
  cerca = String(cerca || '').trim().replace(/[,()*%]/g, ' ').trim();
  if (cerca) {
    const k = encodeURIComponent('*' + cerca + '*');
    q += `&or=(numero.ilike.${k},nome.ilike.${k},cognome.ilike.${k},codice_fiscale.ilike.${k},email.ilike.${k},genitore_cognome.ilike.${k},abbonamento_nome.ilike.${k})`;
  }
  const r = await supaFetch(q);
  const rows = await r.json();
  return { ok: true, contratti: (Array.isArray(rows) ? rows : []).map(rigaElenco), daInserire };
}

async function boPromo(token) {
  const sessione = await verificaSessione(token);
  if (!sessione) return { ok: false, errore: 'Sessione scaduta.' };

  const r = await supaFetch('/rest/v1/promo?attivo=eq.true');
  return await r.json();
}

async function boSegnaGestionale(token, numero) {
  const sessione = await verificaSessione(token);
  if (!sessione) return { ok: false, errore: 'Sessione scaduta.' };

  await supaFetch(`/rest/v1/contratti?numero=eq.${numero}`, 'PATCH', {
    inserito_gestionale: true,
    inserito_da: sessione.staff_nome,
    inserito_il: new Date().toISOString()
  }, { 'Prefer': 'return=minimal' });

  return { ok: true };
}

async function contrattoPerNumero(numero) {
  const r = await supaFetch(`/rest/v1/contratti?numero=eq.${encodeURIComponent(numero || '')}&select=*`);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function boPdf(token, numero) {
  const sessione = await verificaSessione(token);
  if (!sessione) return { ok: false, errore: 'Sessione scaduta.' };
  const c = await contrattoPerNumero(numero);
  if (!c) return { ok: false, errore: 'Contratto non trovato.' };
  let pdf = await leggiPdf(c);
  if (!pdf && !c.pdf_url && c.dettagli && c.firmato) pdf = await creaPdfContratto(c);
  if (pdf) return { ok: true, base64: pdf.toString('base64'), nome: nomeFilePdf(c) };
  if (c.pdf_url) return { ok: true, url: c.pdf_url };   // contratti firmati su Google: PDF su Drive
  return { ok: false, errore: 'PDF non disponibile.' };
}

async function boInvia(token, numero, email) {
  const sessione = await verificaSessione(token);
  if (!sessione) return { ok: false, errore: 'Sessione scaduta.' };
  email = String(email || '').trim().toLowerCase();
  if (!emailValida(email)) return { ok: false, errore: 'Indirizzo email non valido.' };
  const c = await contrattoPerNumero(numero);
  if (!c) return { ok: false, errore: 'Contratto non trovato.' };
  if (!c.pdf_path && !c.dettagli) return { ok: false, errore: 'Questo contratto è stato firmato sulla versione Google: il PDF è su Drive.' };
  try { await inviaPdfSocio(c, email); } catch (e) { console.error('[BO] Invio PDF', numero, e.message || e); return { ok: false, errore: 'Invio non riuscito, riprova.' }; }
  return { ok: true };
}

async function boEsci(token) {
  await supaFetch(`/rest/v1/bo_sessioni?token=eq.${encodeURIComponent(token)}`, 'DELETE');
  return true;
}

async function boRegistrazioneAperta() {
  return true; // La registrazione è sempre aperta su Vercel
}

async function boRegistra(nome, pin, pin2, dispositivo) {
  if (pin !== pin2) return { ok: false, errore: 'I due PIN non coincidono.' };
  if (pin.length < 4) return { ok: false, errore: 'Il PIN deve avere almeno 4 cifre.' };

  // Per ora la registrazione crea un nuovo PIN

  const c = await getCrypto();
  const salt = c.randomBytes(12).toString('hex');
  const hash = c.pbkdf2Sync(pin, salt, 150000, 32, 'sha256').toString('hex');
  const id = nome.toLowerCase().replace(/\s+/g, '').slice(0, 20);

  await supaFetch('/rest/v1/turni_docs', 'POST', {
    path: `pins/${id}`,
    data: { hash, salt, temp: false, at: Date.now(), by: id }
  }, { 'Prefer': 'resolution=merge-duplicates' });

  // Login automatico
  return boLogin(pin, dispositivo);
}

// === FIRMA OTP ===
async function generaNumero() {
  const anno = new Date().getFullYear();
  const r = await supaFetch(`/rest/v1/contratti?numero=like.OS-${anno}-%25&select=numero&order=numero.desc&limit=1`);
  const rows = await r.json();
  const last = rows.length ? parseInt(rows[0].numero.split('-')[2]) : 0;
  return `OS-${anno}-${String(last + 1).padStart(4, '0')}`;
}

// === VALIDAZIONE DATI (come la versione Google) ===
function pulisciTesto(s, max) { return String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().substr(0, max || 80); }
function maiuscoleNome(s) { return pulisciTesto(s).toLowerCase().replace(/(^|[\s'’-])([a-zà-ù])/g, (m, a, b) => a + b.toUpperCase()); }
function normalizzaCell(s) {
  let n = String(s || '').replace(/[\s.\-\/()]/g, '');
  if (n.indexOf('0039') === 0) n = '+39' + n.substr(4);
  if (n.charAt(0) !== '+') n = '+39' + n;
  return n;
}
function emailValida(e) { return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e); }
function eProva(cognome) { return String(cognome || '').trim().toLowerCase() === 'prova'; }
function validaPersona(p, etichetta, conContatti, secondoObbligatorio) {
  const e = [];
  const out = { nome: maiuscoleNome(p.nome), cognome: maiuscoleNome(p.cognome), cf: cfPulisci(p.cf) };
  if (!out.nome || !out.cognome) e.push(etichetta + ': inserisci nome e cognome.');
  const a = analizzaCF(out.cf);
  if (eProva(out.cognome) && !a.valido) {
    out.cf = out.cf || 'PROVA'; out.sesso = 'M'; out.nascita = ''; out.luogoNascita = '(prova)';
    out.eta = etichetta === 'Junior' ? 10 : 30;
  } else if (!a.valido) e.push(etichetta + ': ' + a.errore);
  else {
    if (out.nome && out.cognome && !eProva(out.cognome) && !verificaNomeCF(out.nome, out.cognome, out.cf).corrispondente)
      e.push(etichetta + ': nome e cognome non corrispondono al codice fiscale.');
    const l = luogoNascita(a.codiceComune);
    out.sesso = a.sesso; out.nascita = a.nascita; out.eta = a.eta;
    out.luogoNascita = l.nome + (l.provincia ? ' (' + l.provincia + ')' : '');
  }
  if (conContatti) {
    out.via = pulisciTesto(p.via); out.civico = pulisciTesto(p.civico, 10);
    out.cap = String(p.cap || '').replace(/\D/g, ''); out.comune = maiuscoleNome(p.comune);
    out.provincia = String(p.provincia || '').toUpperCase().replace(/[^A-Z]/g, '').substr(0, 2);
    out.cellulare = normalizzaCell(p.cellulare); out.telefono2 = secondoObbligatorio ? normalizzaCell(p.telefono2) : '';
    out.email = String(p.email || '').trim().toLowerCase();
    if (!out.via || !out.civico) e.push('Inserisci via e numero civico.');
    if (!/^\d{5}$/.test(out.cap)) e.push('Il CAP deve avere 5 cifre.');
    if (!out.comune || out.provincia.length !== 2) e.push('Inserisci comune e provincia (2 lettere).');
    if (!/^\+393\d{8,9}$/.test(out.cellulare)) e.push('Il cellulare non è valido: serve un cellulare italiano per ricevere il codice.');
    if (secondoObbligatorio) {
      if (!/^\+\d{8,14}$/.test(out.telefono2)) e.push('Inserisci un secondo recapito telefonico valido.');
      else if (out.telefono2 === out.cellulare) e.push('Il secondo recapito deve essere diverso dal cellulare.');
    }
    if (!emailValida(out.email)) e.push('L\'email non è valida.');
    else if (out.email !== String(p.email2 || '').trim().toLowerCase()) e.push('Le due email non coincidono.');
  }
  return { dati: out, errori: e };
}
function pulisciClient(c) {
  c = c || {};
  return { ip: pulisciTesto(c.ip, 60), ua: pulisciTesto(c.ua, 300), schermo: pulisciTesto(c.schermo, 30), lingua: pulisciTesto(c.lingua, 20) };
}
function mascherato(s) {
  s = String(s || '');
  return s.indexOf('@') > 0 ? s.replace(/(.{2}).+(@.+)/, '$1***$2') : s.replace(/^(.{6}).+(.{2})$/, '$1***$2');
}
async function aggiungiEvento(id, testo, extra) {
  const r = await supaFetch(`/rest/v1/contratti?id=eq.${id}&select=dettagli`);
  const rows = await r.json();
  const d = (rows[0] && rows[0].dettagli) || {};
  d.eventi = (d.eventi || []).concat([[new Date().toISOString(), testo]]);
  Object.assign(d, extra || {});
  await supaFetch(`/rest/v1/contratti?id=eq.${id}`, 'PATCH', { dettagli: d }, { 'Prefer': 'return=minimal' });
  return d;
}

async function avviaFirma(dati) {
  dati = dati || {};
  const cfg = await configContratti();
  const rl = await supaFetch(`/rest/v1/listino?id=eq.${encodeURIComponent(dati.abbId || '')}`);
  const listino = await rl.json();
  if (!Array.isArray(listino) || !listino.length) return { ok: false, errori: ['Abbonamento non disponibile.'] };
  const abb = listino[0];
  const junior = !!abb.junior || !!dati.perMinore;
  let errori = [];

  let promo = null;
  if (dati.promo) {
    const rp = await verificaPromo(dati.promo, abb.id);
    if (!rp.valido) errori.push(rp.errore); else promo = rp.promo;
  }
  const t = validaPersona(dati.titolare || {}, junior ? 'Genitore' : 'Dati', true, junior);
  errori = errori.concat(t.errori);
  if (t.dati.eta !== undefined && t.dati.eta < 18)
    errori.push(junior ? 'Il genitore deve essere maggiorenne.' : 'Il titolare risulta minorenne: attiva "L\'abbonamento è per un minorenne" e compila i dati del genitore.');
  let m = null;
  if (junior) {
    m = validaPersona(dati.minore || {}, 'Junior', false);
    errori = errori.concat(m.errori);
    if (m.dati.eta !== undefined && m.dati.eta >= 18) errori.push('Lo Junior risulta maggiorenne: scegli un abbonamento adulti.');
    if (m.dati.cf && m.dati.cf === t.dati.cf) errori.push('Il codice fiscale dello Junior è uguale a quello del genitore.');
  }
  const sp = dati.spunte || [];
  if (!(sp[0] && sp[1] && sp[2])) errori.push('Per firmare servono tutte e tre le spunte.');
  if (!dati.lettura || !dati.lettura.aperto) errori.push('Prima di firmare apri e leggi il contratto completo.');
  if (errori.length) return { ok: false, errori };

  const prev = await preventivo(abb.id, promo ? promo.codice : '', dati.primoGiorno);
  if (!prev.ok) return { ok: false, errori: [prev.errore || 'Errore nel calcolo del piano.'] };
  const piano = prev.piano;
  const oggi = new Date();
  piano.dataFirma = fmtData(oggi);
  piano.garanziaFino = abb.tipo === 'lungo' && String(abb.area).toLowerCase() !== 'centro estivo' ? fmtData(aggiungiGiorni(oggi, 14)) : null;
  if (piano.disdettaEntro && abb.tipo !== 'breve' && Number(abb.durata_mesi) === 12) {
    const pd = piano.disdettaEntro.split('/');
    piano.disdettaOgniAnno = '5 ' + MESI_IT[Number(pd[1]) - 1];
  }
  piano.prezzoEuro = euro(piano.prezzo);
  const parseEuro = s => s ? Number(String(s).replace('€', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) : 0;
  const totaleFirma = parseEuro(piano.totaleFirma);
  let metodo = '';
  if (totaleFirma > 0) {
    metodo = String(dati.metodo || '').trim();
    const metodi = cfg.modalitaPagamento || ['Contanti', 'Bancomat'];
    if (metodi.indexOf(metodo) < 0) return { ok: false, errori: ['Seleziona la modalità di pagamento alla firma.'] };
  }

  const cr = await getCrypto();
  const otp = String(cr.randomInt(0, 1000000)).padStart(6, '0');
  const otpSalt = cr.randomBytes(12).toString('hex');
  const otpHash = cr.pbkdf2Sync(otp, otpSalt, 150000, 32, 'sha256').toString('hex');
  const T = t.dati, M = m ? m.dati : null;
  const adesso = new Date().toISOString();
  const dettagli = {
    titolare: T, minore: M, abb: { id: abb.id, nome: abb.nome, area: abb.area, tipo: abb.tipo, durata_mesi: abb.durata_mesi, descrizione: abb.descrizione || '', fine_stagione: abb.fine_stagione || '' },
    promo: promo ? { codice: promo.codice, descrizione: promo.descrizione || '' } : null,
    piano, metodo, offerte: (dati.offerte || []).slice(0, 20).map(o => pulisciTesto(o, 120)),
    lettura: dati.lettura, client: pulisciClient(dati.client), spunte: SPUNTE.map(s => s.titolo), spunteAlle: adesso,
    eventi: [[adesso, 'Contratto visualizzato e spunte 1, 2, 3 approvate']]
  };
  const record = {
    numero: 'BOZZA-' + cr.randomBytes(5).toString('hex'),
    tipo: 'nuovo', area: abb.area,
    nome: junior && M ? M.nome : T.nome, cognome: junior && M ? M.cognome : T.cognome,
    codice_fiscale: junior && M ? M.cf : T.cf, sesso: junior && M ? M.sesso : T.sesso,
    luogo_nascita: junior && M ? M.luogoNascita : T.luogoNascita,
    cellulare: T.cellulare, email: T.email,
    indirizzo: (T.via + ' ' + T.civico).trim(), comune: T.comune, cap: T.cap, provincia: T.provincia,
    junior,
    genitore_nome: junior ? T.nome : null, genitore_cognome: junior ? T.cognome : null,
    genitore_cf: junior ? T.cf : null, genitore_cellulare: junior ? T.cellulare : null,
    categoria: abb.area, abbonamento_id: abb.id, abbonamento_nome: abb.nome, durata_mesi: abb.durata_mesi || null,
    codice_promo: promo ? promo.codice : null, promo_nome: promo ? (promo.descrizione || promo.codice) : null,
    primo_giorno: piano.primoGiorno.split('/').reverse().join('-'),
    scadenza: piano.scadenza ? piano.scadenza.split('/').reverse().join('-') : null,
    rinnovo_tacito: !!piano.rinnovo, data_limite_disdetta: piano.disdettaEntro || null,
    pagamento_metodo: metodo || (totaleFirma > 0 ? '' : 'Nessun pagamento'),
    totale_firma: totaleFirma, importo_rata: piano.prezzo, importo_prorata: parseEuro(piano.prorataTotale),
    piano, dettagli,
    otp_hash: otpHash, otp_salt: otpSalt, otp_tentativi: 0,
    otp_scadenza: new Date(Date.now() + 10 * 60000).toISOString(),
    creato_da: 'online', prova: eProva(T.cognome)
  };
  if (junior && M) { const a = analizzaCF(M.cf); if (a.valido) record.data_nascita = a.nascitaData.toISOString().slice(0, 10); }
  else { const a = analizzaCF(T.cf); if (a.valido) record.data_nascita = a.nascitaData.toISOString().slice(0, 10); }

  const r = await supaFetch('/rest/v1/contratti', 'POST', record, { 'Prefer': 'return=representation' });
  if (!r.ok) {
    console.error('Errore salvataggio contratto:', r.status, await r.text());
    return { ok: false, errori: ['Errore nel salvataggio (' + r.status + '). Riprova.'] };
  }
  const [saved] = await r.json();

  let canale = '';
  if (String(cfg.canaleOTP || 'SMS').toUpperCase() === 'SMS' && await inviaSms(T.cellulare, `Officine Sportive: il tuo codice per firmare il contratto è ${otp}. Valido 10 minuti.`)) canale = 'SMS';
  let smsFallito = false;
  if (!canale && T.email) {
    smsFallito = true;
    try { await inviaOtpEmail(T.email, T.nome, otp); canale = 'email'; } catch (e) { console.error('[OTP] Errore email:', e.message || e); }
  }
  if (!canale) {
    console.error('[OTP] Nessun canale disponibile per', saved.id, '- contratto annullato');
    await supaFetch(`/rest/v1/contratti?id=eq.${saved.id}`, 'PATCH', { annullato: true, annullato_il: new Date().toISOString() }, { 'Prefer': 'return=minimal' });
    return { ok: false, errori: ['I sistemi sono momentaneamente bloccati: questo contratto non può essere firmato ora. Riprova più tardi.'] };
  }
  const a = canale === 'SMS' ? T.cellulare : T.email;
  await aggiungiEvento(saved.id, 'Codice OTP inviato via ' + canale + ' a ' + a + (smsFallito ? ' (SMS non disponibile)' : ''), { canale, smsFallito });
  return { ok: true, id: saved.id, canale, a: mascherato(a) };
}

async function nuovoNumeroContratto(prova) {
  const anno = new Date().getFullYear();
  const pref = prova ? 'PROVA-' : `OS-${anno}-`;
  const r = await supaFetch(`/rest/v1/contratti?numero=like.${encodeURIComponent(pref)}%25&select=numero&order=numero.desc&limit=1`);
  const rows = await r.json();
  const last = rows.length ? parseInt(rows[0].numero.split('-').pop(), 10) || 0 : 0;
  return pref + String(last + 1).padStart(4, '0');
}

async function confermaFirma(id, codice) {
  const r = await supaFetch(`/rest/v1/contratti?id=eq.${encodeURIComponent(id || '')}&select=*`);
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) return { ok: false, errore: 'Sessione scaduta: ricomincia.' };
  const c = rows[0];
  if (c.firmato) return { ok: true, numero: c.numero, firmato: true };
  if (c.annullato) return { ok: false, errore: 'Sessione scaduta: ricomincia.' };
  if (new Date(c.otp_scadenza) < new Date()) return { ok: false, errore: 'Il codice è scaduto: chiedine uno nuovo.' };
  if (c.otp_tentativi >= 5) return { ok: false, errore: 'Troppi tentativi: chiedi un nuovo codice.' };

  const cr = await getCrypto();
  codice = String(codice || '').replace(/\D/g, '');
  const hash = cr.pbkdf2Sync(codice, c.otp_salt, 150000, 32, 'sha256').toString('hex');
  if (hash !== c.otp_hash) {
    const t = c.otp_tentativi + 1;
    await supaFetch(`/rest/v1/contratti?id=eq.${c.id}`, 'PATCH', { otp_tentativi: t }, { 'Prefer': 'return=minimal' });
    return { ok: false, errore: 'Codice non corretto. Tentativi rimasti: ' + (5 - t) };
  }

  // Firma valida: numero definitivo (OS-anno-n, oppure PROVA-n), poi PDF.
  const d = c.dettagli || {};
  d.eventi = (d.eventi || []).concat([[new Date().toISOString(), 'Codice OTP inserito correttamente: contratto firmato']]);
  let numero = '';
  for (let tentativo = 0; tentativo < 3 && !numero; tentativo++) {
    const n = await nuovoNumeroContratto(c.prova);
    const up = await supaFetch(`/rest/v1/contratti?id=eq.${c.id}`, 'PATCH', {
      numero: n, firmato: true, firmato_il: new Date().toISOString(), data_firma: new Date().toISOString(),
      dettagli: d, otp_hash: null, otp_salt: null
    }, { 'Prefer': 'return=minimal' });
    if (up.ok) numero = n;
  }
  if (!numero) return { ok: false, errore: 'Errore nel salvataggio della firma. Riprova.' };
  c.numero = numero; c.dettagli = d; c.firmato = true;

  try { await creaPdfContratto(c); } catch (e) { console.error('[PDF] Errore creazione PDF', numero, e.message || e); }

  if (c.pagamento_metodo === 'Carte online' && SUMUP_KEY && SUMUP_MERCHANT && Number(c.totale_firma) > 0) {
    try {
      const checkout = await creaSumUpCheckout(c);
      if (checkout && checkout.url) {
        await supaFetch(`/rest/v1/contratti?id=eq.${c.id}`, 'PATCH', { sumup_checkout_id: checkout.id, pagamento_stato: 'in_attesa' }, { 'Prefer': 'return=minimal' });
        return { ok: true, numero, firmato: true, pagamento: { url: checkout.url, importo: checkout.importo } };
      }
    } catch (e) { console.error('[SUMUP] Errore creazione checkout:', e); }
    return { ok: true, numero, firmato: true, pagamento: { errore: true } };
  }
  return { ok: true, numero, firmato: true };
}

// === PDF: crea, archivia (Supabase Storage privato), scarica ===
async function creaPdfContratto(c) {
  const cfg = await configContratti();
  // Impronta SHA-256 del contenuto (riepilogo, condizioni, approvazioni, informativa), come su Google.
  const corpo = htmlContratto(c, cfg, '');
  const cr = await getCrypto();
  const impronta = cr.createHash('sha256').update(corpo, 'utf8').digest('hex');
  const pdf = await pdfContratto(c, cfg, await logoPng(), impronta);
  const path = `${new Date().getFullYear()}/${c.numero}.pdf`;
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/contratti/${path}`, {
    method: 'POST',
    headers: { ...storageAuth(), 'Content-Type': 'application/pdf', 'x-upsert': 'true' },
    body: pdf
  });
  if (!up.ok) throw new Error('Upload PDF ' + up.status + ' ' + (await up.text()).slice(0, 200));
  await supaFetchSrv(`/rest/v1/contratti?id=eq.${c.id}`, 'PATCH', { pdf_path: path, impronta }, { 'Prefer': 'return=minimal' });
  c.pdf_path = path; c.impronta = impronta;
  return pdf;
}
let _logoPng = null;
async function logoPng() {
  if (_logoPng) return _logoPng;
  try { const r = await fetch('https://www.officinesportive.it/wp-content/uploads/2025/11/logo-officine-sportive-top.png'); if (r.ok) _logoPng = Buffer.from(await r.arrayBuffer()); } catch (e) {}
  return _logoPng;
}
function storageAuth() {
  return SUPABASE_SERVICE_KEY.startsWith('sb_') ? { apikey: SUPABASE_SERVICE_KEY } : { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` };
}
async function leggiPdf(c) {
  if (!c.pdf_path) return null;
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/contratti/${c.pdf_path}`, { headers: storageAuth() });
  if (!r.ok) { console.error('[PDF] Lettura', c.pdf_path, r.status); return null; }
  return Buffer.from(await r.arrayBuffer());
}
function nomeFilePdf(c) {
  const t = (c.dettagli && c.dettagli.titolare) || { cognome: c.cognome, nome: c.nome };
  const m = c.dettagli && c.dettagli.minore;
  return c.numero + ' · ' + t.cognome + ' ' + t.nome + (m ? ' (Junior ' + m.nome + ')' : '') + '.pdf';
}

// Mail al socio con il contratto firmato in allegato.
function htmlMailContratto(c) {
  const d = c.dettagli || {}, p = d.piano || {}, t = d.titolare || { nome: c.nome };
  const rr = (k, v) => '<tr><td style="padding:8px 0;border-bottom:1px solid #D4E0E3;color:#5A707A;width:42%">' + k + '</td><td style="padding:8px 0;border-bottom:1px solid #D4E0E3;font-weight:600">' + escHtml(v) + '</td></tr>';
  const junior = d.minore ? d.minore.nome : '';
  return cornice(
    '<p style="margin:0 0 12px">Ciao ' + escHtml(t.nome) + '! 👋</p>' +
    '<p style="margin:0 0 14px">Grazie per aver scelto Officine Sportive! In allegato trovi il tuo <b>contratto firmato</b>, con le condizioni generali e il regolamento: conservalo, ti sarà utile.</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px">' +
    rr('Contratto', 'n. ' + c.numero) + rr('Abbonamento', (p.area || c.area || '') + ' · ' + (p.abbonamento || c.abbonamento_nome || '') + (junior ? ' per ' + junior : '')) +
    (p.inizio === p.scadenza ? rr('Valido il', p.inizio) : rr('Dal', p.inizio) + rr('Al', p.scadenza)) + '</table>' +
    (p.rinnovo && p.disdettaEntro ? '<div style="border-left:4px solid #C0392B;background:#FDF2F0;padding:12px 14px;border-radius:8px;margin:0 0 16px;font-size:14px">' +
      '<b>📌 Ricorda la data per la disdetta: entro il ' + escHtml(p.disdettaEntro) + '</b><br>Senza disdetta l\'abbonamento si rinnova alle medesime condizioni. La trovi anche nella prima pagina del contratto.</div>' : '') +
    '<p style="margin:0">Per qualsiasi domanda contattaci: 📱 375 599 2375 · ☎️ 06 6595 5545 · ✉️ info@officinesportive.it</p>');
}
async function inviaPdfSocio(c, email) {
  const pdf = await leggiPdf(c) || await creaPdfContratto(c);
  const prova = String(c.numero).indexOf('PROVA') === 0 ? '[PROVA] ' : '';
  await inviaMail(email || c.email, prova + 'Il tuo contratto Officine Sportive n. ' + c.numero, htmlMailContratto(c), null,
    [{ filename: nomeFilePdf(c), content: pdf.toString('base64') }]);
}

// Giro programmato (ogni 10 minuti da Supabase): PDF ai soci 30 minuti dopo la firma, pulizia prove.
async function giroContratti(chiave) {
  const rk = await supaFetchSrv('/rest/v1/jarvis_segreti?nome=eq.giro&select=valore');
  const k = await rk.json();
  if (!Array.isArray(k) || !k.length || !chiave || chiave !== k[0].valore) return { ok: false };
  // PDF mancanti (es. errore al momento della firma): si rifanno qui.
  const rm = await supaFetchSrv('/rest/v1/contratti?firmato=eq.true&annullato=eq.false&pdf_path=is.null&dettagli=not.is.null&select=*&limit=5');
  let rifatti = 0;
  const errori = [];
  const daRifare = await rm.json();
  if (!Array.isArray(daRifare)) errori.push('lettura: ' + JSON.stringify(daRifare).slice(0, 200));
  for (const c of (Array.isArray(daRifare) ? daRifare : [])) {
    try { await creaPdfContratto(c); rifatti++; } catch (e) { console.error('[GIRO] PDF', c.numero, e.message || e); errori.push(c.numero + ': ' + String(e.message || e).slice(0, 300)); }
  }
  const limite = encodeURIComponent(new Date(Date.now() - 30 * 60000).toISOString());
  const r = await supaFetchSrv(`/rest/v1/contratti?firmato=eq.true&annullato=eq.false&pdf_inviato_il=is.null&pdf_path=not.is.null&firmato_il=lt.${limite}&select=*&limit=20`);
  const rows = await r.json();
  let inviati = 0;
  for (const c of (Array.isArray(rows) ? rows : [])) {
    if (c.pagamento_metodo === 'Carte online' && Number(c.totale_firma) > 0 && c.pagamento_stato !== 'pagato') continue;
    try {
      await inviaPdfSocio(c);
      await supaFetchSrv(`/rest/v1/contratti?id=eq.${c.id}`, 'PATCH', { pdf_inviato_il: new Date().toISOString() }, { 'Prefer': 'return=minimal' });
      inviati++;
    } catch (e) { console.error('[GIRO] PDF al socio', c.numero, e.message || e); errori.push('mail ' + c.numero + ': ' + String(e.message || e).slice(0, 200)); }
  }
  await pulisciProve();
  return { ok: true, inviati, rifatti, errori };
}

async function reinviaOtp(id) {
  // Genera nuovo OTP e invia
  const cr = await getCrypto();
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpSalt = cr.randomBytes(12).toString('hex');
  const otpHash = cr.pbkdf2Sync(otp, otpSalt, 150000, 32, 'sha256').toString('hex');

  const r = await supaFetch(`/rest/v1/contratti?id=eq.${id}&select=cellulare,email,nome,junior,genitore_cellulare,genitore_nome,firmato`);
  const rows = await r.json();
  if (!rows.length) return { ok: false, errore: 'Contratto non trovato.' };
  const c = rows[0];

  await supaFetch(`/rest/v1/contratti?id=eq.${id}`, 'PATCH', {
    otp_hash: otpHash, otp_salt: otpSalt, otp_tentativi: 0,
    otp_scadenza: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  }, { 'Prefer': 'return=minimal' });

  const tel = c.junior ? c.genitore_cellulare : c.cellulare;
  if (SKEBBY_USER && tel) {
    const smsOk = await inviaSms(tel, `Officine Sportive: il tuo nuovo codice è ${otp}. Valido 10 minuti.`);
    if (smsOk) { await aggiungiEvento(id, 'Codice OTP inviato di nuovo via SMS a ' + tel); return { ok: true, metodo: 'sms', canale: 'SMS', a: mascherato(tel) }; }
  }
  if (RESEND_KEY && c.email) {
    try {
      await inviaOtpEmail(c.email, c.junior ? c.genitore_nome : c.nome, otp);
      await aggiungiEvento(id, 'Codice OTP inviato di nuovo via email a ' + c.email);
      return { ok: true, metodo: 'email', canale: 'email', a: mascherato(c.email) };
    } catch (e) { console.error('[OTP] Reinvio email fallito:', e.message || e); }
  }
  return { ok: false, errore: 'Non riesco a inviare il codice: controlla cellulare ed email.' };
}

async function otpViaEmail(id) {
  const cr = await getCrypto();
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpSalt = cr.randomBytes(12).toString('hex');
  const otpHash = cr.pbkdf2Sync(otp, otpSalt, 150000, 32, 'sha256').toString('hex');

  const r = await supaFetch(`/rest/v1/contratti?id=eq.${id}&select=email,nome,junior,genitore_nome`);
  const rows = await r.json();
  if (!rows.length) return { ok: false };

  await supaFetch(`/rest/v1/contratti?id=eq.${id}`, 'PATCH', {
    otp_hash: otpHash, otp_salt: otpSalt, otp_tentativi: 0,
    otp_scadenza: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  }, { 'Prefer': 'return=minimal' });

  if (RESEND_KEY && rows[0].email) {
    await inviaOtpEmail(rows[0].email, rows[0].junior ? rows[0].genitore_nome : rows[0].nome, otp);
    await aggiungiEvento(id, 'SMS in ritardo: nuovo codice OTP inviato via email a ' + rows[0].email, { emailBackup: true });
    return { ok: true, a: mascherato(rows[0].email) };
  }
  return { ok: false, errore: 'Email non disponibile.' };
}

async function creaSumUpCheckout(contratto) {
  const importo = contratto.totale_firma ? Number(contratto.totale_firma) : 0;
  if (!importo || importo <= 0) return null;
  const ref = 'OS-' + contratto.id.slice(0, 8);
  const r = await fetch('https://api.sumup.com/v0.1/checkouts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUMUP_KEY },
    body: JSON.stringify({
      merchant_code: SUMUP_MERCHANT,
      amount: importo,
      currency: 'EUR',
      checkout_reference: ref,
      description: 'Contratto ' + (contratto.numero || '') + ' - ' + (contratto.nome || '') + ' ' + (contratto.cognome || ''),
      redirect_url: 'https://officine-sportive.vercel.app/contratti?pagato=' + contratto.id,
      hosted_checkout: { enabled: true }
    })
  });
  if (!r.ok) {
    const err = await r.text();
    console.error('[SUMUP] Checkout fallito:', r.status, err);
    return null;
  }
  const data = await r.json();
  console.log('[SUMUP] Checkout creato:', data.id, 'URL:', data.hosted_checkout_url);
  return { id: data.id, url: data.hosted_checkout_url, importo: euro(importo) };
}

async function statoPagamento(checkoutId) {
  if (!checkoutId || !SUMUP_KEY) return { ok: false, errore: 'Configurazione pagamento mancante.' };
  try {
    const r = await fetch('https://api.sumup.com/v0.1/checkouts/' + encodeURIComponent(checkoutId), {
      headers: { 'Authorization': 'Bearer ' + SUMUP_KEY }
    });
    if (!r.ok) return { ok: false, errore: 'Errore verifica pagamento.' };
    const data = await r.json();
    if (data.status === 'PAID') {
      // Aggiorna il contratto
      await supaFetch(`/rest/v1/contratti?sumup_checkout_id=eq.${encodeURIComponent(checkoutId)}`, 'PATCH', {
        pagamento_stato: 'pagato', pagato_il: new Date().toISOString()
      }, { 'Prefer': 'return=minimal' });
      return { ok: true, stato: 'pagato' };
    }
    return { ok: true, stato: data.status === 'PENDING' ? 'in_attesa' : data.status.toLowerCase() };
  } catch (e) { console.error('[SUMUP] Errore stato:', e); return { ok: false, errore: 'Errore verifica.' }; }
}

async function riprovaPagamento(id) {
  // Cerca il contratto e ricrea il checkout se serve
  const r = await supaFetch(`/rest/v1/contratti?id=eq.${id}&select=*`);
  const rows = await r.json();
  if (!rows.length) return { ok: false, errore: 'Contratto non trovato.' };
  const c = rows[0];
  if (c.pagamento_stato === 'pagato') return { ok: true, stato: 'pagato' };
  const checkout = await creaSumUpCheckout(c);
  if (!checkout) return { ok: false, errore: 'Errore creazione pagamento.' };
  await supaFetch(`/rest/v1/contratti?id=eq.${id}`, 'PATCH', { sumup_checkout_id: checkout.id }, { 'Prefer': 'return=minimal' });
  return { ok: true, url: checkout.url, importo: checkout.importo };
}

// Revoca disdetta
async function boRevocaAvvia(token, d) {
  const sessione = await verificaSessione(token);
  if (!sessione) return { ok: false, errore: 'Sessione scaduta.' };
  // TODO: implementare revoca disdetta
  return { ok: false, errore: 'Revoca disdetta in fase di migrazione.' };
}

async function boRevocaConferma(token, id, codice) {
  return { ok: false, errore: 'Revoca disdetta in fase di migrazione.' };
}

// Cessione
async function boCessioneCerca(token, d) {
  const sessione = await verificaSessione(token);
  if (!sessione) return { ok: false, errore: 'Sessione scaduta.' };
  // TODO: implementare cessione
  return { ok: false, errore: 'Cessione in fase di migrazione.' };
}

// Liberatoria
// Stessa logica della versione Google: max 2 liberatorie per socio, certificato entro 30 giorni,
// alla seconda mail al socio (serve il certificato) e allo staff (bloccare il tornello).
function nomeProprio(t) {
  return String(t || '').trim().toLowerCase().replace(/(^|[\s'-])([a-zà-ù])/g, (m, a, b) => a + b.toUpperCase());
}
function oraRoma(d) {
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d).replace(',', '');
}
async function contaLiberatorie(cognome, nome) {
  const r = await supaFetchSrv(`/rest/v1/liberatorie?stato=eq.firmata&prova=eq.false&cognome=ilike.${encodeURIComponent(cognome)}&nome=ilike.${encodeURIComponent(nome)}&select=id`);
  const rows = await r.json();
  return Array.isArray(rows) ? rows.length : 0;
}
async function configContratti() {
  const r = await supaFetch('/rest/v1/turni_docs?path=eq.contratti/config&select=data');
  const rows = await r.json();
  return rows.length ? rows[0].data || {} : {};
}

async function libAvvia(token, dati) {
  const sessione = await verificaSessione(token);
  if (!sessione) return { ok: false, errore: 'Sessione scaduta.' };
  const nome = nomeProprio(dati && dati.nome), cognome = nomeProprio(dati && dati.cognome);
  const cell = String((dati && dati.cellulare) || '').trim();
  const email = String((dati && dati.email) || '').trim().toLowerCase();
  if (!nome || !cognome) return { ok: false, errore: 'Inserisci nome e cognome.' };
  if (!cell) return { ok: false, errore: 'Inserisci il numero di cellulare.' };
  if (!email) return { ok: false, errore: 'Inserisci la mail del socio.' };

  const cfg = await configContratti();
  const count = await contaLiberatorie(cognome, nome);
  if (count >= 2) return { ok: false, errore: 'Questo socio ha già usato 2 liberatorie.' };

  const cr = await getCrypto();
  const otp = String(cr.randomInt(0, 1000000)).padStart(6, '0');
  const salt = cr.randomBytes(12).toString('hex');
  const hash = cr.pbkdf2Sync(otp, salt, 150000, 32, 'sha256').toString('hex');
  const prova = String(cfg.liberatoriaProva || '').toUpperCase() === 'SI' || cognome.toLowerCase() === 'prova';

  const ins = await supaFetchSrv('/rest/v1/liberatorie', 'POST', {
    cognome, nome, cellulare: cell, email, operatore: sessione.staff_nome || '', prova, stato: 'in_attesa',
    otp_hash: hash, otp_salt: salt, otp_scadenza: new Date(Date.now() + 10 * 60000).toISOString(), otp_tentativi: 0
  }, { 'Prefer': 'return=representation' });
  const righe = await ins.json();
  if (!ins.ok || !Array.isArray(righe) || !righe.length) return { ok: false, errore: 'Non riesco a salvare la liberatoria. Riprova tra qualche istante.' };
  const riga = righe[0];

  let canale = '';
  if (!prova && String(cfg.canaleOTP || 'SMS').toUpperCase() === 'SMS') {
    if (await inviaSms(cell, `Officine Sportive: il tuo codice per la liberatoria è ${otp}. Vale 10 minuti.`)) canale = 'SMS';
  }
  const destMail = prova ? (cfg.emailAllarmi || email) : email;
  if (!canale) {
    try {
      await inviaMail(destMail, 'Il tuo codice per la liberatoria: ' + otp,
        cornice('<p style="margin:0 0 14px">Ciao ' + escHtml(nome) + ',</p><p style="margin:0 0 6px">il tuo codice per firmare la liberatoria è:</p>' +
          '<div style="background:#13556F;color:#fff;font-size:32px;font-weight:800;text-align:center;padding:20px;border-radius:14px;letter-spacing:8px;margin:16px 0">' + otp + '</div>' +
          '<p style="color:#5A707A;font-size:13px;margin:0">Vale 10 minuti.</p>'));
      canale = 'email';
    } catch (e) { console.error('[LIB] Mail OTP fallita:', e.message || e); }
  }
  if (!canale) {
    await supaFetchSrv(`/rest/v1/liberatorie?id=eq.${riga.id}`, 'DELETE');
    return { ok: false, errore: 'I sistemi sono momentaneamente bloccati: la liberatoria non può essere firmata ora. Riprova più tardi.' };
  }

  const mask = canale === 'SMS' ? numeroSkebby(cell).replace(/^(.{3}).+(.{2})$/, '$1***$2') : destMail.replace(/(.{2}).+(@.+)/, '$1***$2');
  return { ok: true, id: riga.id, numero: count + 1, canale, mask, nomeSocio: nome + ' ' + cognome };
}

async function libConferma(token, id, codice) {
  const sessione = await verificaSessione(token);
  if (!sessione) return { ok: false, errore: 'Sessione scaduta.' };
  const r = await supaFetchSrv(`/rest/v1/liberatorie?id=eq.${encodeURIComponent(id || '')}&stato=eq.in_attesa&select=*`);
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) return { ok: false, errore: 'Sessione scaduta. Ricomincia.' };
  const o = rows[0];
  const elimina = () => supaFetchSrv(`/rest/v1/liberatorie?id=eq.${o.id}`, 'DELETE');
  if (new Date(o.otp_scadenza) < new Date()) { await elimina(); return { ok: false, errore: 'Codice scaduto. Ricomincia.' }; }
  if (o.otp_tentativi >= 5) { await elimina(); return { ok: false, errore: 'Troppi tentativi. Ricomincia.' }; }
  const cr = await getCrypto();
  const h = cr.pbkdf2Sync(String(codice || '').trim(), o.otp_salt, 150000, 32, 'sha256').toString('hex');
  if (h !== o.otp_hash) {
    const t = o.otp_tentativi + 1;
    await supaFetchSrv(`/rest/v1/liberatorie?id=eq.${o.id}`, 'PATCH', { otp_tentativi: t }, { 'Prefer': 'return=minimal' });
    return { ok: false, errore: 'Codice errato. ' + (5 - t) + ' tentativi rimasti.' };
  }
  const numero = (o.prova ? 0 : await contaLiberatorie(o.cognome, o.nome)) + 1;
  if (numero > 2) { await elimina(); return { ok: false, errore: 'Questo socio ha già usato 2 liberatorie.' }; }
  const ora = new Date();
  const scad = new Date(Date.now() + 30 * 864e5);
  await supaFetchSrv(`/rest/v1/liberatorie?id=eq.${o.id}`, 'PATCH', {
    stato: 'firmata', numero, firmata_il: ora.toISOString(), scadenza: scad.toISOString().slice(0, 10),
    otp_hash: null, otp_salt: null, otp_scadenza: null
  }, { 'Prefer': 'return=minimal' });
  if (numero === 2 && !o.prova) {
    const cfg = await configContratti();
    try { await libMailBlocco(o.nome, o.email); } catch (e) { console.error('[LIB] Mail socio:', e.message || e); }
    try { await libMailStaffBlocco(o.nome, o.cognome, oraRoma(ora), cfg); } catch (e) { console.error('[LIB] Mail staff:', e.message || e); }
  }
  return { ok: true, numero, scadenza: fmtData(scad) };
}

const BOX_MEDICO = '<div style="background:#F0F7F8;border:1px solid #C8E0E3;border-radius:12px;padding:14px;margin:14px 0">' +
  '<div style="font-size:12px;font-weight:600;color:#1A9DA7;text-transform:uppercase;margin-bottom:4px">Medico convenzionato del circolo</div>' +
  '<div style="font-size:15px;font-weight:700;color:#14323F">Dr. Domenico Bisogno</div>' +
  '<div style="font-size:13px;color:#5A707A">Medicina dello sport · Senza appuntamento<br>Viale Donato Bramante 47, Fiumicino<br>Lun e Mer 15–18 · Mar e Gio 11:30–15 · Ven 17–19</div></div>';

async function libMailBlocco(nome, email) {
  await inviaMail(email, 'Certificato medico: da adesso è obbligatorio per accedere · Officine Sportive', cornice(
    '<p style="margin:0 0 14px">Ciao ' + escHtml(nome) + ',</p>' +
    '<p style="margin:0 0 14px">ti scriviamo per aggiornarti sul tuo certificato medico.</p>' +
    '<div style="background:#FFF4E5;border:1px solid #FFD599;border-radius:12px;padding:16px;margin:14px 0;font-size:14px;color:#8B5E00"><b>Hai utilizzato entrambe le liberatorie temporanee</b> previste dal regolamento del circolo.</div>' +
    '<p style="margin:0 0 14px"><b style="color:#13556F">Da questo momento, per accedere al circolo è necessario presentare in reception il certificato medico.</b></p>' +
    '<p style="margin:0 0 14px">I ragazzi in reception non sono autorizzati a fare eccezioni: senza certificato, purtroppo, non è possibile entrare.</p>' +
    BOX_MEDICO +
    '<p style="margin:0">Per qualsiasi informazione ti aspettiamo in reception!</p>'));
}

async function libMailStaffBlocco(nome, cognome, ora, cfg) {
  const dest = [cfg.emailStaff, cfg.emailAllarmi].filter(Boolean);
  if (!dest.length) return;
  const html = '<div style="background:#EEF4F5;padding:24px 12px;font-family:Montserrat,Arial,Helvetica,sans-serif;color:#14323F">' +
    '<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #D4E0E3">' +
    '<div style="padding:24px 26px;font-size:15px;line-height:1.6">' +
    '<div style="background:#FDECEC;border:2px solid #C0392B;border-radius:12px;padding:16px;margin:0 0 16px;text-align:center"><div style="font-size:18px;font-weight:700;color:#C0392B">⛔ Bloccare il tornello</div></div>' +
    '<p style="margin:0 0 14px">Il socio <b>' + escHtml(nome + ' ' + cognome) + '</b> ha firmato la seconda e ultima liberatoria il ' + ora + '.</p>' +
    '<p style="margin:0 0 14px"><b>Da adesso questo socio non può più entrare senza certificato medico.</b></p>' +
    '<p style="margin:0 0 6px"><b>Cosa fare:</b></p>' +
    '<p style="margin:0 0 14px">1. Aprire Wellness in Cloud<br>2. Cercare il socio: ' + escHtml(nome + ' ' + cognome) + '<br>3. Inserire il blocco tornello per certificato medico mancante<br>4. Se il socio si presenta, spiegargli con gentilezza che senza certificato non è possibile entrare</p>' +
    BOX_MEDICO +
    '<table role="presentation" style="margin:20px 0 0"><tr><td style="vertical-align:middle;padding-right:10px"><img src="https://officine-sportive.vercel.app/jarvis-logo.gif" width="56" height="56" alt="Jarvis"></td>' +
    '<td style="vertical-align:middle;font-size:15px">Un caro saluto,<br><b>Jarvis</b></td></tr></table>' +
    '</div></div></div>';
  await inviaMail(dest, 'Bloccare tornello: ' + nome + ' ' + cognome + ' ha firmato 2 liberatorie', html, 'Jarvis · Officine Sportive');
}
async function libAvviaSocio(dati) { return { ok: false, errore: 'In fase di migrazione.' }; }
async function libConfermaSocio(id, codice) { return { ok: false, errore: 'In fase di migrazione.' }; }

// === HELPER: SMS via Skebby ===
function numeroSkebby(n) {
  let s = String(n || '').replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) s = (s.startsWith('39') && s.length >= 11 ? '+' : '+39') + s;
  return s;
}

async function inviaSms(numero, testo) {
  if (!SKEBBY_USER || !SKEBBY_PASS) { console.error('[SMS] Credenziali Skebby mancanti'); return false; }
  const dest = numeroSkebby(numero);
  try {
    const auth = Buffer.from(SKEBBY_USER + ':' + SKEBBY_PASS).toString('base64');
    const login = await fetch('https://api.skebby.it/API/v1.0/REST/login', {
      headers: { 'Authorization': 'Basic ' + auth }
    });
    const loginBody = await login.text();
    if (!login.ok) { console.error('[SMS] Login Skebby:', login.status, loginBody.slice(0, 200)); return false; }
    const k = loginBody.trim().split(';');
    const r = await fetch('https://api.skebby.it/API/v1.0/REST/sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'user_key': k[0], 'Session_key': k[1] },
      body: JSON.stringify({ message_type: 'GP', message: testo, recipient: [dest], returnCredits: true })
    });
    const body = await r.text();
    if (!r.ok) { console.error('[SMS] Invio fallito:', r.status, body.slice(0, 300)); return false; }
    console.log('[SMS] Inviato a', dest);
    return true;
  } catch (e) { console.error('[SMS] Errore:', e.message || e); return false; }
}

// === HELPER: mail via Resend ===
function escHtml(t) { return String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
// Layout fisso delle mail ai soci: logo, firma del team, attività del circolo.
function cornice(contenuto) {
  return '<div style="background:#EEF4F5;padding:24px 12px;font-family:Montserrat,Arial,Helvetica,sans-serif;color:#14323F">' +
    '<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #D4E0E3">' +
    '<div style="padding:20px 26px;text-align:center;border-bottom:4px solid #1A9DA7"><img src="https://www.officinesportive.it/wp-content/uploads/2025/11/logo-officine-sportive-top.png" width="200" alt="Officine Sportive" style="width:200px;max-width:60%;height:auto"></div>' +
    '<div style="padding:24px 26px;font-size:15px;line-height:1.55">' + contenuto + '</div>' +
    '<div style="border-top:1px solid #D4E0E3;padding:16px 26px;font-size:14px;color:#14323F"><table><tr>' +
    '<td style="vertical-align:middle;padding-right:14px"><img src="https://www.officinesportive.it/wp-content/uploads/2025/11/logo-officine-sportive-top.png" width="140" alt="Officine Sportive"></td>' +
    '<td style="vertical-align:middle">Un caro saluto,<br><b style="color:#13556F">Il team di Officine Sportive</b></td></tr></table>' +
    '<div style="margin-top:10px;font-size:11.5px;letter-spacing:.5px;color:#5A707A;text-align:center">Palestra · Piscina · Spa · Padel · Centri estivi</div></div>' +
    '</div></div>';
}
async function inviaMail(to, subject, html, mittente, allegati) {
  if (!RESEND_KEY) throw new Error('RESEND_KEY non configurata');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: (mittente || 'Officine Sportive') + ' <info@officinesportive.it>', to: Array.isArray(to) ? to : [to], subject, html, ...(allegati ? { attachments: allegati } : {}) })
  });
  if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()).slice(0, 200));
}

// === HELPER: OTP via Email ===
async function inviaOtpEmail(email, nome, otp) {
  if (!RESEND_KEY) throw new Error('RESEND_KEY non configurata');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Officine Sportive <info@officinesportive.it>',
      to: [email],
      subject: 'Il tuo codice per firmare il contratto',
      html: `<div style="font-family:Montserrat,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <p>Ciao ${nome || ''}!</p>
        <p>Il tuo codice per firmare il contratto è:</p>
        <div style="background:#13556F;color:#fff;font-size:32px;font-weight:800;text-align:center;padding:20px;border-radius:14px;letter-spacing:8px;margin:16px 0">${otp}</div>
        <p style="color:#5A707A;font-size:13px">Valido 10 minuti. Se non hai richiesto questo codice, ignora questo messaggio.</p>
      </div>`
    })
  });
  if (!r.ok) {
    const errBody = await r.text();
    console.error('[EMAIL] Resend errore:', r.status, errBody);
    throw new Error('Email non inviata: ' + r.status);
  }
  console.log('[EMAIL] OTP inviato a', email);
}

// === HELPER: Verifica sessione back office ===
async function verificaSessione(token) {
  if (!token) return null;
  const r = await supaFetch(`/rest/v1/bo_sessioni?token=eq.${encodeURIComponent(token)}&select=*`);
  const rows = await r.json();
  if (!rows.length) return null;
  if (new Date(rows[0].scade_il) < new Date()) {
    await supaFetch(`/rest/v1/bo_sessioni?token=eq.${encodeURIComponent(token)}`, 'DELETE');
    return null;
  }
  return rows[0];
}

// === MAPPA FUNZIONI ===
const FUNZIONI = {
  analizzaCF, verificaNomeCF, datiDaCF, catalogo, verificaPromo, preventivo,
  calcolaPiano: preventivo, // alias
  testiSpunte, avviaFirma, reinviaOtp, confermaFirma, otpViaEmail, giroContratti,
  statoPagamento, riprovaPagamento,
  boLogin, boRegistrazioneAperta, boRegistra, boEsci, boElenco, boPromo,
  boSegnaGestionale, boPdf, boInvia,
  boRevocaAvvia, boRevocaConferma, boCessioneCerca,
  libAvvia, libConferma, libAvviaSocio, libConfermaSocio,
  caricaComuni: async () => [] // TODO: lista comuni
};
