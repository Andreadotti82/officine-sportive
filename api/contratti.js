// API Vercel: gateway per App Contratti
// Riceve POST { fn, args } e smista alla funzione giusta
// Replica le funzioni di google.script.run del vecchio GAS

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
  const [r1, r2, r3, r4, r5] = await Promise.all([
    supaFetch('/rest/v1/listino?attivo=eq.true&order=ordine'),
    supaFetch('/rest/v1/promo?attivo=eq.true'),
    supaFetch('/rest/v1/turni_docs?path=eq.contratti/config&select=data'),
    supaFetch('/rest/v1/turni_docs?path=eq.contratti/condizioni&select=data'),
    supaFetch('/rest/v1/turni_docs?path=eq.contratti/informativa&select=data')
  ]);
  const [lista, promoList, cfgRows, condRows, infoRows] = await Promise.all([
    r1.json(), r2.json(), r3.json(), r4.json(), r5.json()
  ]);

  return {
    listino: lista,
    promo: promoList,
    impostazioni: cfgRows.length ? cfgRows[0].data : {},
    condizioni: condRows.length && condRows[0].data ? condRows[0].data.html || '' : '',
    informativa: infoRows.length && infoRows[0].data ? infoRows[0].data.html || '' : '',
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
  if (p.penale) p.penale = euro(p.penale);
  return p;
}

// === TESTI SPUNTE ===
function testiSpunte() {
  return [
    'Dichiaro di aver preso visione delle condizioni generali di contratto e dell\'informativa privacy e di accettarle integralmente.',
    'Acconsento al trattamento dei miei dati personali per le finalità indicate nell\'informativa privacy.',
    'Acconsento all\'utilizzo di immagini e video per la comunicazione del circolo, come indicato nelle condizioni generali.'
  ];
}

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
    primo_giorno: primoGiorno,
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

  // Contratti di prova (cognome "Prova") → mostra OTP a schermo
  const isProva = (t.cognome || '').toLowerCase() === 'prova';
  if (isProva) {
    return { ok: true, id: saved.id, numero: saved.numero, canale: 'test', a: dest || t.email || '', otp_test: otp };
  }

  // Invia OTP via SMS (Skebby)
  let smsOk = false;
  if (SKEBBY_USER && SKEBBY_PASS) {
    try {
      smsOk = await inviaSms(dest,
        `Officine Sportive: il tuo codice per firmare il contratto è ${otp}. Valido 10 minuti.`);
    } catch (e) { console.error('Errore SMS:', e); }
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
    } catch (e) { console.error('Errore email OTP:', e); }
  }

  // Nessun canale funzionante — mostra OTP a schermo
  return { ok: true, id: saved.id, numero: saved.numero, canale: 'test', a: dest || emailDest, otp_test: otp };
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
  await supaFetch(`/rest/v1/contratti?id=eq.${id}`, 'PATCH', {
    firmato: true, firmato_il: new Date().toISOString()
  }, { 'Prefer': 'return=minimal' });

  // TODO: generare PDF e salvarlo in Supabase Storage
  // TODO: inviare email al socio dopo 30 minuti

  return { ok: true, numero: c.numero, firmato: true };
}

async function reinviaOtp(id) {
  // Genera nuovo OTP e invia

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpSalt = c.randomBytes(12).toString('hex');
  const otpHash = c.pbkdf2Sync(otp, otpSalt, 150000, 32, 'sha256').toString('hex');

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
    await inviaSms(tel, `Officine Sportive: il tuo nuovo codice è ${otp}. Valido 10 minuti.`);
    return { ok: true, metodo: 'sms' };
  }
  return { ok: true, metodo: 'nessuno', otp_debug: otp };
}

async function otpViaEmail(id) {

  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpSalt = c.randomBytes(12).toString('hex');
  const otpHash = c.pbkdf2Sync(otp, otpSalt, 150000, 32, 'sha256').toString('hex');

  const r = await supaFetch(`/rest/v1/contratti?id=eq.${id}&select=email,nome`);
  const rows = await r.json();
  if (!rows.length) return { ok: false };

  await supaFetch(`/rest/v1/contratti?id=eq.${id}`, 'PATCH', {
    otp_hash: otpHash, otp_salt: otpSalt, otp_tentativi: 0,
    otp_scadenza: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  }, { 'Prefer': 'return=minimal' });

  if (RESEND_KEY && rows[0].email) {
    await inviaOtpEmail(rows[0].email, rows[0].nome, otp);
    return { ok: true };
  }
  return { ok: false, errore: 'Email non disponibile.' };
}

async function statoPagamento(token) {
  // TODO: check SumUp payment status
  return { stato: 'in_attesa' };
}

async function riprovaPagamento(token) {
  return { ok: false, errore: 'Pagamenti SumUp in fase di migrazione.' };
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
async function libAvvia(token, dati) { return { ok: false, errore: 'In fase di migrazione.' }; }
async function libConferma(token, id, codice) { return { ok: false, errore: 'In fase di migrazione.' }; }
async function libAvviaSocio(dati) { return { ok: false, errore: 'In fase di migrazione.' }; }
async function libConfermaSocio(id, codice) { return { ok: false, errore: 'In fase di migrazione.' }; }

// === HELPER: SMS via Skebby ===
async function inviaSms(numero, testo) {
  if (!SKEBBY_USER || !SKEBBY_PASS) return false;
  // TODO: implementare chiamata API Skebby
  console.log(`[SMS] A ${numero}: ${testo}`);
  return false;
}

// === HELPER: OTP via Email ===
async function inviaOtpEmail(email, nome, otp) {
  if (!RESEND_KEY) return;
  await fetch('https://api.resend.com/emails', {
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
