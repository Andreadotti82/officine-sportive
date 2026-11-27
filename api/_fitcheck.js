// Fit Check su Jarvis: stessa logica, stessi testi e stessa grafica della versione Google («Fit Check», 23/11/2026).
// I turni arrivano direttamente dall'app Turni (Supabase, tabella turni_docs), senza passare dal Good Morning.
import { db, inviaMail, escHtml, segreto, firma } from './_jarvis-base.js';

// Personal trainer abilitati al Fit Check (id dell'app Turni)
const TRAINER = {
  aurora: { nome: 'Aurora', email: 'aurorapt@officinesportive.it' },
  alept: { nome: 'Alessandro', email: 'alessandropt@officinesportive.it' }
};
const EMAIL_COORDINATORE = 'alessandropt@officinesportive.it';
const EMAIL_DIREZIONE = 'andreadotti@officinesportive.it';
const NOME_DIREZIONE = 'Andrea';

const GIORNI_DA_MOSTRARE = 5, ORE_ANTICIPO = 24, MINUTI_DOPO_INIZIO = 30, MINUTI_PRIMA_FINE = 30;
const ORA_CHIUSURA = 22, MINUTI_PRIMA_CHIUSURA = 60, DURATA_MINIMA_FASCIA = 60, ORA_MAIL_MATTINO = 6;
const NOME_CIRCOLO = 'Officine Sportive', INDIRIZZO = 'Via Fratelli Wright snc, 00054 Fiumicino';
const TELEFONO = '06 6595 5545', EMAIL_INFO = 'info@officinesportive.it';
const URL_PAGINA = 'https://officine-sportive.vercel.app/fitcheck';
const URL_LOGO = 'https://officine-sportive.vercel.app/logo-os.png';

const GG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MM = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

// --- Date in ora di Roma ---
function partiRoma(d) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).forEach(x => { p[x.type] = x.value; });
  return p;
}
const chiave = d => { const p = partiRoma(d); return p.year + '-' + p.month + '-' + p.day; };
function epochRoma(g, minuti) {   // istante assoluto di "giorno g alle minuti" ora di Roma
  const [y, m, d] = g.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minuti);
  const p = partiRoma(new Date(guess));
  const comeUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return guess - (comeUtc - guess);
}
const daChiave = g => { const p = g.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)); };
const ora = m => Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2);
const giornoMin = g => { const d = daChiave(g); return GG[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MM[d.getUTCMonth()]; };
const giornoEsteso = g => { const s = giornoMin(g); return s.charAt(0).toUpperCase() + s.slice(1); };
const giornoBreve = g => { const d = daChiave(g); return GG[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MM[d.getUTCMonth()].slice(0, 3); };
function etichetta(g, f) {
  const d = daChiave(g), p = g.split('-'), gs = GG[d.getUTCDay()].slice(0, 3);
  return gs.charAt(0).toUpperCase() + gs.slice(1) + ' ' + p[2] + '/' + p[1] + '/' + p[0] + ' · ' + ora(f.a) + '–' + ora(f.b) + ' con ' + TRAINER[f.t].nome;
}

// --- Turni dall'app Turni: solo mesi pubblicati, solo i trainer abilitati ---
async function leggiTurni() {
  const oggi = new Date(), mesi = [];
  for (let k = -1; k <= 2; k++) { const d = new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth() + k, 15)); mesi.push(d.toISOString().slice(0, 7)); }
  const r = await db(`/rest/v1/turni_docs?path=in.(${mesi.map(m => 'months/' + m).join(',')})&select=path,data`);
  const rows = await r.json();
  const turni = {};
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const m = row.data || {};
    if (m.status !== 'pubblicato' || !m.schedule) return;
    Object.keys(m.schedule).forEach(g => (m.schedule[g] || []).forEach(x => {
      if (x && TRAINER[x.s]) (turni[g] = turni[g] || []).push({ t: x.s, a: Number(x.a), b: Number(x.b) });
    }));
  });
  return turni;
}
function fasceDelGiorno(g, turni) {
  return (turni[g] || []).map(s => {
    const a = Math.round(s.a * 60) + MINUTI_DOPO_INIZIO;
    const b = Math.round(s.b * 60) - (s.b >= ORA_CHIUSURA ? MINUTI_PRIMA_CHIUSURA : MINUTI_PRIMA_FINE);
    return { t: s.t, a, b };
  }).filter(f => f.b - f.a >= DURATA_MINIMA_FASCIA).sort((x, y) => x.a - y.a || x.t.localeCompare(y.t));
}
function giorniPrenotabili(turni) {
  const adesso = Date.now(), out = [];
  for (let i = 0; i < 60 && out.length < GIORNI_DA_MOSTRARE; i++) {
    const g = chiave(new Date(adesso + i * 864e5));
    const fasce = fasceDelGiorno(g, turni).filter(f => epochRoma(g, f.a) - adesso >= ORE_ANTICIPO * 3600e3);
    if (fasce.length) out.push({ data: g, fasce: fasce.map(f => Object.assign({ nome: TRAINER[f.t].nome, etichetta: etichetta(g, f) }, f)) });
  }
  return out;
}

// --- Stato: attivo solo dopo il passaggio. Prima, ogni mail va ad Andrea come simulazione. ---
async function attivo() {
  const r = await db('/rest/v1/jarvis_stato?chiave=eq.fitcheck&select=valore');
  const x = await r.json();
  return !!(Array.isArray(x) && x[0] && x[0].valore && x[0].valore.attivo);
}
async function manda(dest, oggetto, html, mittente, opz = {}) {
  if (await attivo()) return inviaMail(dest, oggetto, html, mittente || NOME_CIRCOLO + ' · Fit Check', opz);
  const a = Array.isArray(dest) ? dest.join(', ') : dest;
  return inviaMail(EMAIL_DIREZIONE, '[SIMULAZIONE → ' + a + (opz.cc ? ' + cc ' + opz.cc : '') + '] ' + oggetto, html, mittente || NOME_CIRCOLO + ' · Fit Check');
}

// --- Grafica delle mail (identica a Google) ---
export function cornice(titolo, corpo) {
  return '<div style="background:#F4F9F9;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#3A3A3A">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden">' +
    '<tr><td style="padding:18px;text-align:center;border-bottom:4px solid #0A9BA5"><img src="' + URL_LOGO + '" height="80" alt="Circolo Officine Sportive" style="height:80px"></td></tr>' +
    '<tr><td style="background:#07808A;color:#ffffff;padding:26px 28px;font-size:25px;font-weight:bold;line-height:1.25">' + titolo + '</td></tr>' +
    '<tr><td style="padding:22px 28px 26px;font-size:15px;line-height:1.6">' + corpo + '</td></tr></table>' +
    '<div style="max-width:560px;margin:14px auto 0;text-align:center;font-size:12px;line-height:1.5;color:#6B7477">' +
    'Mail automatica: per qualsiasi cosa chiamaci allo ' + escHtml(TELEFONO) + ' o scrivi a ' + escHtml(EMAIL_INFO) + '.<br>' +
    'Circolo ' + escHtml(NOME_CIRCOLO) + ' · ' + escHtml(INDIRIZZO) + '<br><b>Palestra · Piscina · Spa · Padel · Centri estivi</b></div></div>';
}
export const firmaJarvis = '<table role="presentation" style="margin:20px 0 0"><tr><td style="vertical-align:middle;padding-right:10px"><img src="https://officine-sportive.vercel.app/jarvis-logo.gif" width="56" height="56" alt="Jarvis"></td>' +
  '<td style="vertical-align:middle;font-size:15px">Un caro saluto,<br><b>Jarvis</b></td></tr></table>';
function riquadro(p) {
  const r = (icona, et, val) => '<tr><td style="padding:8px 0;width:34px;font-size:22px;vertical-align:top">' + icona + '</td>' +
    '<td style="padding:8px 0"><div style="font-size:13px;color:#6B7477">' + et + '</div><div style="font-size:17px;font-weight:bold">' + val + '</div></td></tr>';
  return '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 14px">' +
    r('📅', 'Giorno', escHtml(giornoEsteso(p.data))) +
    r('🕐', 'Fascia', escHtml(ora(p.a) + ' – ' + ora(p.b)) + '<div style="font-size:14px;font-weight:normal;color:#6B7477">vieni quando vuoi dentro la fascia</div>') +
    r('💪', 'Personal trainer', escHtml(TRAINER[p.trainer].nome)) +
    r('📍', 'Dove', escHtml(NOME_CIRCOLO) + '<div style="font-size:14px;font-weight:normal;color:#6B7477">' + escHtml(INDIRIZZO) + '</div>') + '</table>';
}
const bottone = (url, testo) => '<a href="' + url + '" style="display:inline-block;background:#07808A;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 22px;border-radius:12px;margin:4px 0 10px">' + testo + '</a>';
async function linkAnnulla(p) { return URL_PAGINA + '?annulla=' + encodeURIComponent(p.id) + '&k=' + await firma('fc|' + p.id); }
async function bottoneAnnulla(p) {
  return '<div style="margin:18px 0 6px;padding-top:14px;border-top:1px solid #E1E8E9;font-size:14px;color:#6B7477">' +
    'Non riesci più a venire? Annulla in un attimo, così liberi il posto per qualcun altro.<br>' +
    '<a href="' + await linkAnnulla(p) + '" style="display:inline-block;margin-top:8px;border:2px solid #B9C7CB;color:#3A3A3A;text-decoration:none;font-weight:bold;font-size:14px;padding:8px 16px;border-radius:10px">❌ Annulla appuntamento</a></div>';
}

async function mailSocio(tipo, p, prima) {
  if (!p.email) return;
  const nome = (p.nome || '').split(' ')[0] || 'ciao', tr = TRAINER[p.trainer].nome;
  const contatti = '<p>Imprevisti? Chiamaci allo <b>' + escHtml(TELEFONO) + '</b> o scrivi a <b>' + escHtml(EMAIL_INFO) + '</b>.</p>';
  const saluto = '<table role="presentation" style="margin:20px 0 0"><tr><td style="vertical-align:middle;padding-right:12px"><img src="https://officine-sportive.vercel.app/logo-os-soci.gif" width="150" alt="Officine Sportive" style="width:150px;height:auto"></td>' +
    '<td style="vertical-align:middle;font-size:15px">Un caro saluto,<br><b>Il team di ' + escHtml(NOME_CIRCOLO) + '</b></td></tr></table>';
  let oggetto, titolo, corpo;
  if (tipo === 'conferma') {
    oggetto = '💪 Fit Check prenotato! Ti aspettiamo ' + giornoBreve(p.data); titolo = 'Fit Check prenotato! 💪';
    corpo = '<p>Ciao ' + escHtml(nome) + '! Ottima scelta: il primo passo per allenarti meglio è sapere da dove parti. Ecco il tuo appuntamento:</p>' + riquadro(p) +
      '<p>Non serve segnarti niente: la mattina del Fit Check ti mandiamo un promemoria.</p>' + contatti + '<p>A presto!</p>' + saluto + await bottoneAnnulla(p);
  } else if (tipo === 'promemoria') {
    oggetto = '⏰ Oggi è il giorno del tuo Fit Check con ' + tr; titolo = 'Oggi c’è il tuo Fit Check! ⏰';
    corpo = '<p>Buongiorno ' + escHtml(nome) + '! Oggi ' + escHtml(tr) + ' ti aspetta per il tuo Fit Check. Passa quando vuoi dentro la fascia:</p>' + riquadro(p) + contatti +
      '<p>Ci vediamo dopo!</p>' + saluto + await bottoneAnnulla(p);
  } else if (tipo === 'annullataSocio') {
    oggetto = 'Fit Check annullato: ti aspettiamo quando vuoi'; titolo = 'Fit Check annullato';
    corpo = '<p>Ciao ' + escHtml(nome) + '! Come ci hai chiesto, abbiamo annullato il tuo Fit Check di <b>' + escHtml(giornoMin(p.data)) + '</b> (fascia ' + escHtml(ora(p.a) + ' – ' + ora(p.b)) +
      '). Il tuo abbonamento resta naturalmente com’è: abbiamo annullato solo l’appuntamento.</p><p>Quando vuoi, riprenotare è questione di un attimo: i nostri personal trainer ti aspettano. 💪</p>' +
      bottone(URL_PAGINA, '📅 Scegli un’altra data') + saluto;
  } else if (tipo === 'fascia') {
    oggetto = '🕐 Il tuo Fit Check resta confermato, con una nuova fascia oraria'; titolo = 'Piccolo cambio di orario 🕐';
    corpo = '<p>Ciao ' + escHtml(nome) + '! Il tuo Fit Check di ' + escHtml(giornoMin(p.data)) + ' resta confermato, ma ' + escHtml(tr) + ' ha cambiato orario: la fascia non è più ' +
      escHtml(ora(prima.a) + ' – ' + ora(prima.b)) + ', ora è questa:</p>' + riquadro(p) + '<p>Se il nuovo orario non ti va bene, chiamaci e troviamo un’altra soluzione.</p>' + contatti + '<p>A presto!</p>' + saluto;
  } else if (tipo === 'trainer') {
    oggetto = '💪 Il tuo Fit Check resta confermato: ti seguirà ' + tr; titolo = 'Ti seguirà ' + escHtml(tr) + ' 💪';
    corpo = '<p>Ciao ' + escHtml(nome) + '! Il tuo Fit Check di ' + escHtml(giornoMin(p.data)) + ' resta confermato. C’è stato un cambio turno, quindi ti seguirà <b>' + escHtml(tr) +
      '</b> invece di ' + escHtml(TRAINER[prima.t].nome) + '. Ecco i dettagli aggiornati:</p>' + riquadro(p) + contatti + '<p>A presto!</p>' + saluto;
  } else {
    oggetto = '🙏 Scusaci! Il tuo Fit Check di ' + giornoBreve(p.data) + ' va riprogrammato'; titolo = 'Ops, ti dobbiamo delle scuse 🙏';
    corpo = '<p>Ciao ' + escHtml(nome) + ',<br>prima di tutto: scusaci davvero. Per un cambio turno dell’ultimo momento, ' + escHtml(giornoMin(p.data)) +
      ' non ci sarà un personal trainer disponibile per il Fit Check, quindi abbiamo dovuto disdire il tuo appuntamento (fascia ' + escHtml(ora(prima.a) + ' – ' + ora(prima.b)) + ').</p>' +
      '<p>Sappiamo che ti eri organizzato e ci dispiace. La buona notizia? Riprenotare è questione di un attimo, e i nostri personal trainer ti aspettano con ancora più energia. 💪</p>' +
      bottone(URL_PAGINA, '📅 Scegli un’altra data') +
      '<p>Preferisci sentirci? Chiamaci allo <b>' + escHtml(TELEFONO) + '</b> o scrivi a <b>' + escHtml(EMAIL_INFO) + '</b> e troviamo insieme il giorno giusto.</p><p>Grazie per la pazienza e a prestissimo!</p>' + saluto;
  }
  await manda(p.email, oggetto, cornice(titolo, corpo));
}

async function mailTrainer(t, sue) {
  const tr = TRAINER[t], n = sue.length, fasce = [];
  sue.forEach(p => { const f = ora(p.a) + ' – ' + ora(p.b); if (!fasce.includes(f)) fasce.push(f); });
  const frasi = ['Caffè pronto? ☕', 'Oggi si spacca! 💥', 'Si parte! 🚀'];
  const corpo = '<p>Buongiorno ' + escHtml(tr.nome) + '! ☀️ ' + frasi[daChiave(sue[0].data).getUTCDay() % frasi.length] + ' Nel tuo turno di oggi, <b>' + escHtml(fasce.join(' e ')) + '</b>, ' +
    (n === 1 ? 'passerà per il Fit Check:' : 'passeranno per il Fit Check:') + '</p><table role="presentation" cellpadding="0" cellspacing="0" width="100%">' +
    sue.map(p => '<tr><td style="padding:12px 0;border-bottom:1px solid #E1E8E9"><div style="font-size:17px;font-weight:bold">' + escHtml(p.nome) + '</div>' +
      '<div style="font-size:15px">📱 <a href="tel:' + escHtml(String(p.telefono || '').replace(/[^\d+]/g, '')) + '" style="color:#07808A">' + escHtml(p.telefono || '') + '</a> · ✉️ ' + escHtml(p.email || '') + '</div>' +
      (fasce.length > 1 ? '<div style="font-size:13px;color:#6B7477">fascia ' + escHtml(ora(p.a) + ' – ' + ora(p.b)) + '</div>' : '') + '</td></tr>').join('') +
    '</table><p style="margin-top:16px">Fai faville! 💪</p>' + firmaJarvis;
  await manda(tr.email, 'Buongiorno ' + tr.nome + '! ☀️ Oggi hai ' + n + ' Fit Check', cornice('Oggi hai ' + n + ' Fit Check 💪', corpo), 'Jarvis · Officine Sportive');
}
async function avvisaTrainerAnnullo(p) {
  if (p.data !== chiave(new Date())) return;
  const r = await db(`/rest/v1/jarvis_stato?chiave=eq.fitcheck-mattino-${p.data}&select=chiave`);
  const x = await r.json(); if (!Array.isArray(x) || !x.length) return;    // solo se ha già ricevuto la mail del mattino
  const tr = TRAINER[p.trainer]; if (!tr) return;
  const corpo = '<p>Ciao ' + escHtml(tr.nome) + '! 👋</p><p>Un Fit Check di oggi è stato annullato dal socio:</p>' +
    '<div style="border-left:4px solid #13556F;background:#F3F8F8;border-radius:8px;padding:9px 12px;margin:8px 0"><div style="font-size:13px;font-weight:800;color:#13556F">❌ Annullato</div>' +
    '<div style="font-size:15px">' + escHtml(p.nome) + ' · fascia ' + escHtml(ora(p.a) + ' – ' + ora(p.b)) + '<br>📱 ' + escHtml(p.telefono || '') + '</div></div>' +
    '<p>Hai un po’ di tempo libero in più: ottimo momento per un giro di chiamate! 💪</p>' + firmaJarvis;
  await manda(tr.email, '❌ Fit Check annullato: ' + p.nome + ' (' + ora(p.a) + ' – ' + ora(p.b) + ')', cornice('Fit Check annullato', corpo), 'Jarvis · Officine Sportive');
}
async function mailAllarme(allarmi) {
  const n = allarmi.length, tit = '⚠️ Abbiamo dovuto disdire ' + (n === 1 ? 'un Fit Check' : n + ' Fit Check');
  const corpo = '<p>Ciao ' + escHtml(NOME_DIREZIONE) + ',<br>abbiamo dovuto disdire ' + (n === 1 ? 'un Fit Check' : n + ' Fit Check') + '. Dopo l’ultimo cambio turni, queste prenotazioni sono rimaste <b>senza un personal trainer abilitato</b> ' +
    'e sono state annullate. I soci hanno già ricevuto una mail con l’invito a scegliere un’altra data, ma una telefonata fa sempre piacere.</p><table role="presentation" cellpadding="0" cellspacing="0" width="100%">' +
    allarmi.map(x => '<tr><td style="padding:12px 0;border-bottom:1px solid #E1E8E9"><div style="font-size:16px;font-weight:bold">' + escHtml(giornoEsteso(x.p.data)) + ' · ' + escHtml(ora(x.prima.a) + ' – ' + ora(x.prima.b)) +
      ' · era con ' + escHtml(TRAINER[x.prima.t].nome) + '</div><div style="font-size:15px">' + escHtml(x.p.nome) + ' · 📱 <a href="tel:' + escHtml(String(x.p.telefono || '').replace(/[^\d+]/g, '')) + '" style="color:#07808A">' +
      escHtml(x.p.telefono || '') + '</a> · ' + escHtml(x.p.email || '') + '</div></td></tr>').join('') + '</table>' +
    '<p style="margin-top:14px">Se rimettete in turno ' + Object.keys(TRAINER).map(k => TRAINER[k].nome).join(' o ') + ' in quel giorno, i soci possono riprenotare subito dalla pagina.</p>' + firmaJarvis;
  await manda(EMAIL_DIREZIONE, tit, cornice(tit, corpo), 'Jarvis · Officine Sportive', { cc: EMAIL_COORDINATORE });
}

// --- Funzioni chiamate dalla pagina ---
export async function fcDati() {
  const turni = await leggiTurni();
  return { giorni: giorniPrenotabili(turni), circolo: NOME_CIRCOLO, indirizzo: INDIRIZZO, telefono: TELEFONO, privacy: '' };
}
export async function fcPrenota(d) {
  const v = {};
  ['nome', 'email', 'telefono', 'data', 't'].forEach(k => { v[k] = String((d && d[k]) || '').trim().slice(0, 200); });
  if (!v.nome) return { ok: false, errore: 'Scrivi nome e cognome.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return { ok: false, errore: 'Controlla l\'indirizzo email.' };
  if (v.telefono.replace(/\D/g, '').length < 8) return { ok: false, errore: 'Controlla il numero di telefono.' };
  const giorno = giorniPrenotabili(await leggiTurni()).find(g => g.data === v.data);
  const fascia = giorno && giorno.fasce.find(f => f.t === v.t);
  if (!fascia) return { ok: false, errore: 'Questa fascia non è più disponibile: ricarica la pagina e scegline un\'altra.' };
  const r = await db('/rest/v1/fitcheck', 'POST', { nome: v.nome, email: v.email.toLowerCase(), telefono: v.telefono, data: v.data, trainer: fascia.t, a: fascia.a, b: fascia.b,
    prova: /\bprova\b/i.test(v.nome) }, { Prefer: 'return=representation' });
  const righe = await r.json();
  if (!r.ok || !Array.isArray(righe) || !righe.length) return { ok: false, errore: 'Qualcosa è andato storto: riprova tra poco.' };
  try { await mailSocio('conferma', righe[0]); } catch (e) { console.error('[FC] conferma', e.message || e); }
  return { ok: true };
}
// Annullamento dal bottone della mail: prima mostra, poi (ok=1) annulla.
export async function fcAnnulla(id, k, conferma) {
  const r = await db(`/rest/v1/fitcheck?id=eq.${encodeURIComponent(id || '')}&select=*`);
  const rows = await r.json();
  const p = Array.isArray(rows) && rows[0];
  if (!p || k !== await firma('fc|' + p.id)) return { stato: 'non_valido', telefono: TELEFONO };
  const info = { giorno: giornoEsteso(p.data), fascia: ora(p.a) + ' – ' + ora(p.b), trainer: TRAINER[p.trainer].nome, dove: NOME_CIRCOLO, indirizzo: INDIRIZZO, telefono: TELEFONO };
  if (p.stato !== 'attiva') return { stato: 'gia_annullato', ...info };
  if (p.data < chiave(new Date())) return { stato: 'passato', ...info };
  if (!conferma) return { stato: 'da_confermare', ...info };
  await db(`/rest/v1/fitcheck?id=eq.${p.id}&stato=eq.attiva`, 'PATCH', { stato: 'annullata', annullata_il: new Date().toISOString(), annullata_da: 'socio' }, { Prefer: 'return=minimal' });
  try { await mailSocio('annullataSocio', p); } catch (e) { console.error(e); }
  try { await avvisaTrainerAnnullo(p); } catch (e) { console.error(e); }
  return { stato: 'annullato', ...info };
}

// --- Giro programmato (ogni 10 minuti): turni cambiati e mail del mattino ---
async function riallinea(turni) {
  const oggi = chiave(new Date());
  const r = await db(`/rest/v1/fitcheck?stato=eq.attiva&data=gte.${oggi}&select=*`);
  const pren = await r.json();
  const allarmi = []; let cambiate = 0;
  for (const p of (Array.isArray(pren) ? pren : [])) {
    const fasce = fasceDelGiorno(p.data, turni);
    if (fasce.find(f => f.t === p.trainer && f.a === p.a && f.b === p.b)) continue;
    const prima = { t: p.trainer, a: p.a, b: p.b };
    const stesso = fasce.find(f => f.t === p.trainer), altro = fasce.find(f => f.t !== p.trainer);
    let patch, tipo;
    if (stesso) { patch = { a: stesso.a, b: stesso.b }; tipo = 'fascia'; }
    else if (altro) { patch = { trainer: altro.t, a: altro.a, b: altro.b }; tipo = 'trainer'; }
    else { patch = { stato: 'annullata', annullata_il: new Date().toISOString(), annullata_da: 'cambio turni' }; tipo = 'annullata'; }
    await db(`/rest/v1/fitcheck?id=eq.${p.id}`, 'PATCH', patch, { Prefer: 'return=minimal' });
    Object.assign(p, patch);
    try { await mailSocio(tipo, p, prima); } catch (e) { console.error(e); }
    if (tipo === 'annullata') allarmi.push({ p, prima });
    cambiate++;
  }
  if (allarmi.length) await mailAllarme(allarmi);
  return cambiate;
}
async function mattino() {
  const oggi = chiave(new Date()), oraRoma = Number(partiRoma(new Date()).hour);
  if (oraRoma < ORA_MAIL_MATTINO || oraRoma >= 12) return false;
  const ins = await db('/rest/v1/jarvis_stato', 'POST', { chiave: 'fitcheck-mattino-' + oggi, valore: { at: new Date().toISOString() } }, { Prefer: 'return=minimal' });
  if (!ins.ok) return false;                                   // già fatto oggi
  const r = await db(`/rest/v1/fitcheck?stato=eq.attiva&data=eq.${oggi}&select=*&order=a`);
  const diOggi = await r.json();
  for (const t of Object.keys(TRAINER)) { const sue = diOggi.filter(p => p.trainer === t); if (sue.length) await mailTrainer(t, sue); }
  for (const p of diOggi) { try { await mailSocio('promemoria', p); } catch (e) { console.error(e); } }
  return true;
}
export async function fcGiro(chiaveGiro) {
  if (!chiaveGiro || chiaveGiro !== await segreto('giro')) return { ok: false };
  const turni = await leggiTurni();
  const cambiate = await riallinea(turni);
  const mattinoFatto = await mattino();
  // pulizia: prove dopo 30 minuti, prenotazioni passate da più di 30 giorni
  await db(`/rest/v1/fitcheck?prova=eq.true&creata_il=lt.${encodeURIComponent(new Date(Date.now() - 30 * 60000).toISOString())}`, 'DELETE', null, { Prefer: 'return=minimal' });
  await db(`/rest/v1/fitcheck?data=lt.${chiave(new Date(Date.now() - 30 * 864e5))}`, 'DELETE', null, { Prefer: 'return=minimal' });
  return { ok: true, cambiate, mattino: mattinoFatto };
}
