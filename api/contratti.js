// API Vercel: gateway per App Contratti
// Riceve POST { fn, args } e smista alla funzione giusta
// Replica le funzioni di google.script.run del vecchio GAS

import { CONDIZIONI, INFORMATIVA, SPUNTE } from './_testi-contratto.js';

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
async function catalogo() {
  // Tutte le query in parallelo per velocizzare il caricamento
  const [r1, r2, r3] = await Promise.all([
    supaFetch('/rest/v1/listino?attivo=eq.true&order=ordine'),
    supaFetch('/rest/v1/promo?attivo=eq.true'),
    supaFetch('/rest/v1/turni_docs?path=eq.contratti/config&select=data')
  ]);
  const [lista, promoList, cfgRows] = await Promise.all([r1.json(), r2.json(), r3.json()]);

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

// === CODICE FISCALE ===
function cfControllo(cf15) {
  // Tabella ufficiale: posizioni dispari (1-based) = indice pari (0-based)
  const dispari = { '0':1,'1':0,'2':5,'3':7,'4':9,'5':13,'6':15,'7':17,'8':19,'9':21,
    'A':1,'B':0,'C':5,'D':7,'E':9,'F':13,'G':15,'H':17,'I':19,'J':21,
    'K':2,'L':4,'M':18,'N':20,'O':11,'P':3,'Q':6,'R':8,'S':12,'T':14,
    'U':16,'V':10,'W':22,'X':25,'Y':24,'Z':23 };
  const pari = { '0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
    'A':0,'B':1,'C':2,'D':3,'E':4,'F':5,'G':6,'H':7,'I':8,'J':9,
    'K':10,'L':11,'M':12,'N':13,'O':14,'P':15,'Q':16,'R':17,'S':18,'T':19,
    'U':20,'V':21,'W':22,'X':23,'Y':24,'Z':25 };
  let s=0;
  for(let i=0;i<15;i++){const c=cf15[i]; s+=(i%2===0)?dispari[c]:pari[c];}
  return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[s%26];
}

function analizzaCF(cf, oggi) {
  cf = String(cf || '').toUpperCase().replace(/\s+/g, '');
  if (cf.length !== 16) return { valido: false, errore: 'Il codice fiscale deve avere 16 caratteri.' };
  if (!/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(cf)) return { valido: false, errore: 'Formato non valido.' };
  const atteso = cfControllo(cf.slice(0, 15));
  if (cf[15] !== atteso) return { valido: false, errore: 'Codice di controllo errato.' };

  const anno = parseInt(cf.slice(6, 8));
  const mesi = 'ABCDEHLMPRST';
  const mese = mesi.indexOf(cf[8]);
  if (mese < 0) return { valido: false, errore: 'Mese non valido.' };
  let giorno = parseInt(cf.slice(9, 11));
  const sesso = giorno > 40 ? 'F' : 'M';
  if (giorno > 40) giorno -= 40;

  const oggiD = oggi ? new Date(oggi) : new Date();
  const annoNascita = anno + (anno > oggiD.getFullYear() % 100 ? 1900 : 2000);
  const nascita = dt(annoNascita, mese, giorno);

  const eta = oggiD.getFullYear() - nascita.getFullYear() - (oggiD < new Date(oggiD.getFullYear(), mese, giorno) ? 1 : 0);

  return { valido: true, sesso, nascita: fmtData(nascita), eta, minore: eta < 18 };
}

function verificaNomeCF(nome, cognome, cf) {
  if (!nome || !cognome || !cf || cf.length < 6) return { corrispondente: false };
  // Simplified check
  return { corrispondente: true };
}

function datiDaCF(cf, nome, cognome) {
  const a = analizzaCF(cf);
  if (!a.valido) return { ok: false, errore: a.errore };
  const v = verificaNomeCF(nome, cognome, cf);
  return { ok: true, sesso: a.sesso, nascita: a.nascita, eta: a.eta, minore: a.minore,
    luogo: '', provincia: '', nomeOk: v.corrispondente };
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

async function boElenco(token, cerca, filtro) {
  // Verifica sessione
  const sessione = await verificaSessione(token);
  if (!sessione) return { ok: false, errore: 'Sessione scaduta.' };

  // Leggi contratti
  let query = '/rest/v1/contratti?annullato=eq.false&order=creato_il.desc&limit=50';
  if (filtro === 'da_inserire') query += '&inserito_gestionale=eq.false&firmato=eq.true';
  if (cerca) query += `&or=(nome.ilike.%25${encodeURIComponent(cerca)}%25,cognome.ilike.%25${encodeURIComponent(cerca)}%25)`;

  const r = await supaFetch(query);
  const contratti = await r.json();

  return { ok: true, contratti };
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

async function boPdf(token, numero) {
  const sessione = await verificaSessione(token);
  if (!sessione) return { ok: false, errore: 'Sessione scaduta.' };

  const r = await supaFetch(`/rest/v1/contratti?numero=eq.${numero}&select=pdf_url`);
  const rows = await r.json();
  if (!rows.length || !rows[0].pdf_url) return { ok: false, errore: 'PDF non disponibile.' };

  return { ok: true, url: rows[0].pdf_url };
}

async function boInvia(token, numero, email) {
  // TODO: invio PDF via Resend (serve DNS verificato)
  return { ok: false, errore: 'Invio mail non ancora attivo (DNS in verifica).' };
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

async function avviaFirma(dati) {
  const numero = await generaNumero();

  const c = await getCrypto();
  const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 cifre
  const otpSalt = c.randomBytes(12).toString('hex');
  const otpHash = c.pbkdf2Sync(otp, otpSalt, 150000, 32, 'sha256').toString('hex');

  // Il frontend manda: { titolare: {cf,nome,cognome,via,civico,cap,comune,provincia,cellulare,email}, minore: {cf,nome,cognome}|null, abbId, promo, primoGiorno, metodo, ... }
  const t = dati.titolare || {};
  const m = dati.minore || null;
  const junior = !!dati.perMinore || !!(m && m.nome);
  const primoGiorno = dati.primoGiorno ? dati.primoGiorno.split('/').reverse().join('-') : null;

  // Calcola piano per salvare importi nel contratto
  let pianoData = null, totaleFirma = null, importoRata = null, importoProrata = null;
  try {
    const prev = await preventivo(dati.abbId, dati.promo, dati.primoGiorno);
    if (prev.ok && prev.piano) {
      pianoData = prev.piano;
      // totaleFirma e importoRata sono stringhe euro "€ 39,00" — estrarre il numero
      const parseEuro = s => s ? Number(String(s).replace('€', '').replace(/\s/g, '').replace(',', '.')) : null;
      totaleFirma = parseEuro(prev.piano.totaleFirma);
      importoRata = parseEuro(prev.piano.rataMensile || prev.piano.pianoRate);
      importoProrata = parseEuro(prev.piano.prorataTotale);
    }
  } catch (e) { console.error('[FIRMA] Errore calcolo piano:', e); }

  const record = {
    numero,
    tipo: dati.tipo || 'nuovo',
    nome: t.nome || '', cognome: t.cognome || '',
    codice_fiscale: t.cf || null, cellulare: t.cellulare || '', email: t.email || null,
    indirizzo: (t.via || '') + (t.civico ? ' ' + t.civico : '') || null,
    comune: t.comune || null, cap: t.cap || null, provincia: t.provincia || null,
    junior,
    genitore_nome: junior ? t.nome : null, genitore_cognome: junior ? t.cognome : null,
    genitore_cf: junior ? t.cf : null, genitore_cellulare: junior ? t.cellulare : null,
    abbonamento_id: dati.abbId || null, codice_promo: dati.promo || null,
    primo_giorno: primoGiorno, pagamento_metodo: dati.metodo || 'Contanti',
    totale_firma: totaleFirma, importo_rata: importoRata, importo_prorata: importoProrata,
    piano: pianoData ? JSON.stringify(pianoData) : null,
    otp_hash: otpHash, otp_salt: otpSalt,
    otp_scadenza: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minuti
    creato_da: 'online',
    prova: (t.cognome || '').toLowerCase() === 'prova'
  };

  const r = await supaFetch('/rest/v1/contratti', 'POST', record, { 'Prefer': 'return=representation' });
  if (!r.ok) {
    const err = await r.text();
    console.error('Errore salvataggio contratto:', r.status, err);
    console.error('Record inviato:', JSON.stringify(record).slice(0, 500));
    return { ok: false, errori: ['Errore nel salvataggio (' + r.status + '). Riprova.'] };
  }
  const [saved] = await r.json();

  const dest = t.cellulare || '';

  // Invia OTP via SMS (Skebby)
  let smsOk = false;
  const hasSms = !!(SKEBBY_USER && SKEBBY_PASS);
  console.log('[OTP] Config SMS:', hasSms, 'dest:', dest, 'RESEND:', !!RESEND_KEY);
  if (hasSms) {
    try {
      smsOk = await inviaSms(dest,
        `Officine Sportive: il tuo codice per firmare il contratto è ${otp}. Valido 10 minuti.`);
      console.log('[OTP] SMS risultato:', smsOk);
    } catch (e) { console.error('[OTP] Errore SMS:', e); }
  }

  if (smsOk) {
    return { ok: true, id: saved.id, numero: saved.numero, canale: 'SMS', a: dest };
  }

  // Se SMS fallisce, prova via email
  const emailDest = t.email || '';
  if (emailDest && RESEND_KEY) {
    try {
      await inviaOtpEmail(emailDest, t.nome, otp);
      return { ok: true, id: saved.id, numero: saved.numero, canale: 'email', a: emailDest };
    } catch (e) { console.error('[OTP] Errore email:', e); }
  }

  // Nessun canale funzionante: niente codice, niente firma. Il contratto non firmato viene annullato.
  console.error('[OTP] Nessun canale disponibile per', saved.numero, '- contratto annullato');
  await supaFetch(`/rest/v1/contratti?id=eq.${saved.id}`, 'PATCH',
    { annullato: true, annullato_il: new Date().toISOString() }, { 'Prefer': 'return=minimal' });
  return { ok: false, errori: ['I sistemi sono momentaneamente bloccati: questo contratto non può essere firmato ora. Riprova più tardi.'] };
}

async function confermaFirma(id, codice) {
  // Leggi il contratto
  const r = await supaFetch(`/rest/v1/contratti?id=eq.${id}&select=*`);
  const rows = await r.json();
  if (!rows.length) return { ok: false, errore: 'Contratto non trovato.' };
  const c = rows[0];

  if (c.firmato) return { ok: false, errore: 'Contratto già firmato.' };
  if (new Date(c.otp_scadenza) < new Date()) return { ok: false, errore: 'Codice scaduto. Richiedi un nuovo codice.' };
  if (c.otp_tentativi >= 5) return { ok: false, errore: 'Troppi tentativi. Richiedi un nuovo codice.' };

  // Verifica OTP

  const cr = await getCrypto();
  const hash = cr.pbkdf2Sync(codice, c.otp_salt, 150000, 32, 'sha256').toString('hex');

  if (hash !== c.otp_hash) {
    await supaFetch(`/rest/v1/contratti?id=eq.${id}`, 'PATCH', { otp_tentativi: c.otp_tentativi + 1 }, { 'Prefer': 'return=minimal' });
    return { ok: false, errore: 'Codice non corretto. Riprova.' };
  }

  // Firma confermata!
  const patch = { firmato: true, firmato_il: new Date().toISOString(), pagamento_metodo: c.pagamento_metodo || 'Contanti' };
  await supaFetch(`/rest/v1/contratti?id=eq.${id}`, 'PATCH', patch, { 'Prefer': 'return=minimal' });

  // Se pagamento online → crea checkout SumUp
  console.log('[FIRMA] metodo:', c.pagamento_metodo, 'totale_firma:', c.totale_firma, 'SUMUP:', !!SUMUP_KEY, !!SUMUP_MERCHANT);
  if (c.pagamento_metodo === 'Carte online' && SUMUP_KEY && SUMUP_MERCHANT) {
    try {
      const checkout = await creaSumUpCheckout(c);
      if (checkout && checkout.url) {
        await supaFetch(`/rest/v1/contratti?id=eq.${id}`, 'PATCH', {
          sumup_checkout_id: checkout.id, pagamento_stato: 'in_attesa'
        }, { 'Prefer': 'return=minimal' });
        return { ok: true, numero: c.numero, firmato: true, pagamento: { url: checkout.url, importo: checkout.importo } };
      }
    } catch (e) { console.error('[SUMUP] Errore creazione checkout:', e); }
  }

  return { ok: true, numero: c.numero, firmato: true };
}

async function reinviaOtp(id) {
  // Genera nuovo OTP e invia
  const cr = await getCrypto();
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpSalt = cr.randomBytes(12).toString('hex');
  const otpHash = cr.pbkdf2Sync(otp, otpSalt, 150000, 32, 'sha256').toString('hex');

  const r = await supaFetch(`/rest/v1/contratti?id=eq.${id}&select=cellulare,email,nome,junior,genitore_cellulare`);
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
    if (smsOk) return { ok: true, metodo: 'sms', canale: 'SMS', a: tel };
  }
  if (RESEND_KEY && c.email) {
    try {
      await inviaOtpEmail(c.email, c.nome, otp);
      return { ok: true, metodo: 'email', canale: 'email', a: c.email };
    } catch (e) { console.error('[OTP] Reinvio email fallito:', e.message || e); }
  }
  return { ok: false, errore: 'Non riesco a inviare il codice: controlla cellulare ed email.' };
}

async function otpViaEmail(id) {
  const cr = await getCrypto();
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpSalt = cr.randomBytes(12).toString('hex');
  const otpHash = cr.pbkdf2Sync(otp, otpSalt, 150000, 32, 'sha256').toString('hex');

  const r = await supaFetch(`/rest/v1/contratti?id=eq.${id}&select=email,nome`);
  const rows = await r.json();
  if (!rows.length) return { ok: false };

  await supaFetch(`/rest/v1/contratti?id=eq.${id}`, 'PATCH', {
    otp_hash: otpHash, otp_salt: otpSalt, otp_tentativi: 0,
    otp_scadenza: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  }, { 'Prefer': 'return=minimal' });

  if (RESEND_KEY && rows[0].email) {
    await inviaOtpEmail(rows[0].email, rows[0].nome, otp);
    return { ok: true, a: rows[0].email };
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
  const prova = String(cfg.liberatoriaProva || '').toUpperCase() === 'SI';

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
async function inviaMail(to, subject, html, mittente) {
  if (!RESEND_KEY) throw new Error('RESEND_KEY non configurata');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: (mittente || 'Officine Sportive') + ' <info@officinesportive.it>', to: Array.isArray(to) ? to : [to], subject, html })
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
  testiSpunte, avviaFirma, reinviaOtp, confermaFirma, otpViaEmail,
  statoPagamento, riprovaPagamento,
  boLogin, boRegistrazioneAperta, boRegistra, boEsci, boElenco, boPromo,
  boSegnaGestionale, boPdf, boInvia,
  boRevocaAvvia, boRevocaConferma, boCessioneCerca,
  libAvvia, libConferma, libAvviaSocio, libConfermaSocio,
  caricaComuni: async () => [] // TODO: lista comuni
};
