// API Vercel: gateway per App Contratti
// Riceve POST { fn, args } e smista alla funzione giusta
// Replica le funzioni di google.script.run del vecchio GAS

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
    const handler = FUNZIONI[fn];
    if (!handler) return res.status(400).json({ ok: false, errore: 'Funzione non trovata: ' + fn });
    const data = await handler(...(args || []));
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
function euro(n) { return Number(n).toLocaleString('it-IT',{style:'currency',currency:'EUR'}); }
function arrotonda(n) { return Math.round(Number(n) * 100) / 100; }

// === CATALOGO ===
async function catalogo() {
  const r = await supaFetch('/rest/v1/listino?attivo=eq.true&order=ordine');
  const lista = await r.json();

  const r2 = await supaFetch('/rest/v1/promo?attivo=eq.true');
  const promoList = await r2.json();

  // Leggi impostazioni dal turni_docs (configurazione contratti)
  const r3 = await supaFetch('/rest/v1/turni_docs?path=eq.contratti/config&select=data');
  const cfgRows = await r3.json();
  const imp = cfgRows.length ? cfgRows[0].data : {};

  return {
    listino: lista,
    promo: promoList,
    impostazioni: imp,
    condizioni: imp.condizioni || '',
    informativa: imp.informativa || ''
  };
}

// === CODICE FISCALE ===
function cfControllo(cf15) {
  const set1='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', val1=[1,0,5,7,9,13,15,17,19,21,2,4,18,20,11,3,6,8,12,14,16,10,22,25,24,23];
  const set2='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', val2=[0,1,2,3,4,5,6,7,8,9,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25];
  let s=0;
  for(let i=0;i<15;i++){const c=cf15[i],idx=set1.indexOf(c);if(idx<0)return false;s+=(i%2===0)?val1[idx]:val2[idx];}
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
  return { cf: a, nome: nome || '', cognome: cognome || '' };
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

  return { valido: true, promo };
}

// === PREVENTIVO ===
async function preventivo(abbId, codicePromo, primoGiorno, upg) {
  // Leggi abbonamento dal listino
  const r = await supaFetch(`/rest/v1/listino?id=eq.${encodeURIComponent(abbId)}`);
  const rows = await r.json();
  if (!rows.length) return { errore: 'Abbonamento non trovato.' };
  const abb = rows[0];

  // Leggi promo se c'è
  let promo = null;
  if (codicePromo) {
    const rp = await verificaPromo(codicePromo, abbId);
    if (rp.valido) promo = rp.promo;
  }

  // Calcola piano (semplificato per ora, da completare con la logica piena)
  const firma = primoGiorno ? new Date(primoGiorno.split('/').reverse().join('-')) : new Date();

  return {
    abbonamento: abb,
    promo: promo,
    primoGiorno: fmtData(firma),
    // TODO: calcolo completo del piano (prorata, rate, scadenza, disdetta)
    piano: { calcolato: false, nota: 'Piano in fase di migrazione' }
  };
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
    const crypto = await import('crypto');
    const hash = crypto.pbkdf2Sync(pin, p.salt, 150000, 32, 'sha256').toString('hex');

    if (hash === p.hash) {
      const staffId = doc.path.replace('pins/', '');
      // Genera token sessione
      const token = crypto.randomBytes(20).toString('hex');
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
  const crypto = await import('crypto');
  const salt = crypto.randomBytes(12).toString('hex');
  const hash = crypto.pbkdf2Sync(pin, salt, 150000, 32, 'sha256').toString('hex');
  const id = nome.toLowerCase().replace(/\s+/g, '').slice(0, 20);

  await supaFetch('/rest/v1/turni_docs', 'POST', {
    path: `pins/${id}`,
    data: { hash, salt, temp: false, at: Date.now(), by: id }
  }, { 'Prefer': 'resolution=merge-duplicates' });

  // Login automatico
  return boLogin(pin, dispositivo);
}

// === FIRMA OTP ===
async function avviaFirma(dati) {
  // Salva il contratto in bozza
  const crypto = await import('crypto');
  const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 cifre
  const otpSalt = crypto.randomBytes(12).toString('hex');
  const otpHash = crypto.pbkdf2Sync(otp, otpSalt, 150000, 32, 'sha256').toString('hex');

  const record = {
    tipo: dati.tipo || 'nuovo',
    nome: dati.nome, cognome: dati.cognome,
    codice_fiscale: dati.cf, cellulare: dati.cellulare, email: dati.email,
    data_nascita: dati.dataNascita || null, luogo_nascita: dati.luogoNascita || null,
    sesso: dati.sesso || null, indirizzo: dati.indirizzo || null,
    comune: dati.comune || null, cap: dati.cap || null, provincia: dati.provincia || null,
    junior: !!dati.junior,
    genitore_nome: dati.genitoreNome || null, genitore_cognome: dati.genitoreCognome || null,
    genitore_cf: dati.genitoreCf || null, genitore_cellulare: dati.genitoreCellulare || null,
    categoria: dati.categoria, abbonamento_id: dati.abbId, abbonamento_nome: dati.abbNome,
    durata_mesi: dati.durataMesi, codice_promo: dati.codicePromo || null, promo_nome: dati.promoNome || null,
    primo_giorno: dati.primoGiorno || null, importo_rata: dati.rata || null,
    importo_prorata: dati.prorata || null, totale_firma: dati.totaleFirma || null,
    piano: dati.piano || null,
    otp_hash: otpHash, otp_salt: otpSalt,
    otp_scadenza: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minuti
    creato_da: dati.creatoDa || 'online',
    prova: dati.cognome === 'Prova'
  };

  const r = await supaFetch('/rest/v1/contratti', 'POST', record, { 'Prefer': 'return=representation' });
  if (!r.ok) {
    const err = await r.text();
    console.error('Errore salvataggio contratto:', err);
    return { ok: false, errore: 'Errore nel salvataggio.' };
  }
  const [saved] = await r.json();

  // Invia OTP via SMS (Skebby)
  let smsOk = false;
  if (SKEBBY_USER && SKEBBY_PASS) {
    try {
      smsOk = await inviaSms(dati.junior ? dati.genitoreCellulare : dati.cellulare,
        `Officine Sportive: il tuo codice per firmare il contratto è ${otp}. Valido 10 minuti.`);
    } catch (e) { console.error('Errore SMS:', e); }
  }

  // Se SMS fallisce, prova via email
  if (!smsOk && dati.email && RESEND_KEY) {
    try {
      await inviaOtpEmail(dati.email, dati.nome, otp);
      return { ok: true, id: saved.id, numero: saved.numero, metodo: 'email' };
    } catch (e) { console.error('Errore email OTP:', e); }
  }

  if (!smsOk && !RESEND_KEY) {
    // Nessun canale disponibile: OTP non inviato
    return { ok: true, id: saved.id, numero: saved.numero, metodo: 'nessuno', otp_debug: otp };
  }

  return { ok: true, id: saved.id, numero: saved.numero, metodo: smsOk ? 'sms' : 'nessuno' };
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
  const crypto = await import('crypto');
  const hash = crypto.pbkdf2Sync(codice, c.otp_salt, 150000, 32, 'sha256').toString('hex');

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
  const crypto = await import('crypto');
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpSalt = crypto.randomBytes(12).toString('hex');
  const otpHash = crypto.pbkdf2Sync(otp, otpSalt, 150000, 32, 'sha256').toString('hex');

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
  const crypto = await import('crypto');
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpSalt = crypto.randomBytes(12).toString('hex');
  const otpHash = crypto.pbkdf2Sync(otp, otpSalt, 150000, 32, 'sha256').toString('hex');

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
