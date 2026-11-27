// PDF del contratto: stesso HTML e stessa grafica della versione Google Script.
import { CONDIZIONI, INFORMATIVA, SPUNTE } from './_testi-contratto.js';

const URL_LOGO = 'https://www.officinesportive.it/wp-content/uploads/2025/11/logo-officine-sportive-top.png';
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

const esc = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const riga = (k, v) => '<tr><td class="k">' + esc(k) + '</td><td>' + esc(v) + '</td></tr>';
// "05/12/2027" -> "5 dicembre 2027"
function dataLunga(s) {
  const p = String(s || '').split('/');
  return p.length === 3 ? Number(p[0]) + ' ' + MESI[Number(p[1]) - 1] + ' ' + p[2] : String(s || '');
}
export function oraRomaCompleta(iso) {
  return new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .format(new Date(iso)).replace(',', '');
}

/**
 * c: riga della tabella contratti (con dettagli), p: piano (come calcolato alla firma), cfg: impostazioni.
 * Restituisce l'HTML con il segnaposto %%REGISTRO%%.
 */
export function htmlContratto(c, cfg, logoDataUri) {
  const d = c.dettagli || {}, p = d.piano || {}, t = d.titolare || {}, m = d.minore || null, abb = d.abb || {};
  const prova = String(c.numero).indexOf('PROVA') === 0;
  const h = [];
  h.push('<html><head><meta charset="utf-8"><style>' +
    '@page{size:A4;margin:14mm 12mm}' +
    'body{font-family:Arial,Helvetica,sans-serif;color:#14323F;font-size:10.5px;line-height:1.45;margin:0}' +
    '.top{border-bottom:3px solid #13556F;padding-bottom:8px;margin-bottom:12px}' +
    '.top img{height:42px}.top .n{float:right;text-align:right;color:#5A707A;font-size:10px}' +
    'h1{font-size:17px;color:#13556F;margin:6px 0 2px}h2{font-size:12.5px;color:#13556F;border-bottom:2px solid #1A9DA7;padding:0 0 2px;margin:10px 0 4px;text-transform:uppercase;letter-spacing:.5px}' +
    'h3{font-size:11.5px;color:#13556F;margin:12px 0 4px;border-bottom:1px solid #D4E0E3;padding-bottom:2px}' +
    'p{margin:0 0 5px;text-align:left}table{width:100%;border-collapse:collapse}td,th{padding:3px 6px;border-bottom:1px solid #D4E0E3;vertical-align:top;text-align:left}' +
    'td.k{width:36%;color:#5A707A}td.r{text-align:right;white-space:nowrap}' +
    '.box{border:2px solid #C0392B;background:#FDF2F0;padding:9px 12px;margin:10px 0;border-radius:6px}' +
    '.box b.t{color:#C0392B;font-size:13px}.ok{color:#1A9DA7}.tot td{font-weight:bold;border-top:2px solid #13556F}' +
    '.sp{border:1px solid #D4E0E3;border-left:4px solid #1A9DA7;padding:6px 9px;margin:6px 0;border-radius:4px}' +
    '.reg td{font-size:9.5px}.hash{font-family:Courier New,monospace;font-size:9px;word-break:break-all}' +
    '.tab th{background:#EEF4F5}.pb{page-break-before:always}.small{color:#5A707A;font-size:9.5px}' +
    '</style></head><body>');
  h.push('<div class="top">' + (logoDataUri ? '<img src="' + logoDataUri + '">' : '<b style="font-size:18px;color:#13556F">OFFICINE SPORTIVE</b>') +
    '<div class="n">Contratto n. <b>' + esc(c.numero) + '</b><br>Firmato il ' + esc(p.dataFirma || p.firma) + '</div></div>' +
    (prova ? '<div style="border:3px dashed #C0392B;color:#C0392B;font-weight:bold;font-size:16px;text-align:center;padding:8px;margin-bottom:10px">CONTRATTO DI PROVA · NON VALIDO</div>' : ''));
  h.push('<h1>Contratto di abbonamento · Riepilogo dell\'iscrizione</h1>');
  h.push('<p class="small">' + esc(cfg.societa) + ' · ' + esc(cfg.sede) + ' · Circolo ' + esc(cfg.nomeCircolo) + '</p>');

  h.push('<h2>' + (m ? 'Intestatario del contratto (genitore)' : 'Tesserato') + '</h2><table>' +
    riga('Nome e cognome', t.nome + ' ' + t.cognome) + riga('Codice fiscale', t.cf) +
    riga('Nato il / a', t.nascita + ' · ' + t.luogoNascita) +
    riga('Residenza', t.via + ' ' + t.civico + ', ' + t.cap + ' ' + t.comune + ' (' + t.provincia + ')') +
    riga('Cellulare (firma OTP)', t.cellulare) + (t.telefono2 ? riga('Secondo recapito', t.telefono2) : '') + riga('Email', t.email) + '</table>');
  if (m) {
    h.push('<h2>Junior</h2><table>' + riga('Nome e cognome', m.nome + ' ' + m.cognome) + riga('Codice fiscale', m.cf) +
      riga('Nato il / a', m.nascita + ' · ' + m.luogoNascita) + '</table>');
  }

  const giornaliero = abb.tipo === 'giornaliero';
  const u = d.upgrade || null;
  h.push('<h2>Abbonamento</h2><table>' +
    riga('Abbonamento', p.area + ' · ' + p.abbonamento + (abb.tipo === 'breve' ? ' (breve termine)' : abb.tipo === 'lungo' ? ' (lungo termine)' : '')) +
    (u && u.cessione ? riga('Cessione', 'Subentra a ' + u.cedente + ' nell\'abbonamento in corso, alle medesime condizioni economiche: accesso dal ' + p.primoGiorno +
      ', rata mensile di ' + p.prezzoEuro + ' dal ' + p.inizio + '; resta ferma la scadenza del ' + u.scadenza + (p.rinnovo ? ', con rinnovo tacito' : ', senza rinnovo tacito')) :
      u ? riga('Upgrade', 'Sostituisce l\'abbonamento ' + u.vecchio + ' a decorrere dal ' + p.inizio +
        '; resta ferma la scadenza del ' + u.scadenza + ', con rinnovo tacito alle condizioni del presente contratto') : '') +
    (abb.descrizione ? riga('Comprende', abb.descrizione) : '') +
    (p.fasciaOraria ? riga('Fascia oraria di accesso', p.fasciaOraria) : '') +
    (!giornaliero ? riga('Primo giorno di accesso', p.primoGiorno) : '') +
    (p.prorata && p.prorata.length ? riga('Pro rata', p.prorata.map(r => r.periodo).join(' e ')) : '') +
    riga(giornaliero ? 'Valido il' : 'Inizio abbonamento', p.inizio) +
    (giornaliero ? '' : riga('Scadenza', p.scadenza)) +
    riga('Rinnovo', giornaliero ? 'Non previsto' : p.rinnovo ? 'Tacito rinnovo per un periodo uguale, alle medesime condizioni (art. 3.2)' : 'Rinnovo non previsto: termina alla scadenza') +
    (p.promo ? riga('Promozione', p.promo) : '') + '</table>');

  if (p.rinnovo && p.disdettaEntro) {
    h.push('<div class="box"><b class="t">DATA LIMITE PER LA DISDETTA: ' + (p.disdettaOgniAnno ? esc(p.disdettaOgniAnno.toUpperCase()) + ' DI OGNI ANNO' : esc(dataLunga(p.disdettaEntro).toUpperCase())) + '</b><br>' +
      'La prima volta è il ' + esc(dataLunga(p.disdettaEntro)) + '. Senza disdetta entro questa data l\'abbonamento si rinnova per ' +
      (Number(abb.durata_mesi) === 12 ? '12 mesi' : 'un periodo uguale') + ' alle medesime condizioni. La disdetta è valida solo dal sito, via email a ' + esc(cfg.emailCircolo) +
      ', via PEC o con raccomandata A/R. La disdetta verbale o telefonica non ha alcun valore, e nemmeno il messaggio WhatsApp.</div>');
  } else if (p.rinnovo || abb.tipo === 'breve') {
    h.push('<div class="box"><b class="t">DISDETTA</b><br>Abbonamento a breve termine: si rinnova ogni mese' + (abb.fine_stagione ? ' fino al ' + esc(p.scadenza) + ', termine della stagione,' : '') +
      ' salvo disdetta inviata nei modi e nei termini dell\'art. 3.3 (dal sito, via email a ' + esc(cfg.emailCircolo) +
      ', via PEC o con raccomandata A/R). La disdetta verbale o telefonica non ha alcun valore, e nemmeno il messaggio WhatsApp.</div>');
  }

  h.push('<h2>Pagamenti</h2><table>');
  (p.righeFirma || []).forEach(r => { h.push('<tr><td>' + esc(r.voce) + '</td><td class="r">' + esc(r.importo) + '</td></tr>'); });
  h.push('<tr class="tot"><td>Pagato alla firma</td><td class="r">' + esc(p.totaleFirma) + '</td></tr></table><table>' +
    riga('Piano di pagamento', p.pianoRate) +
    (d.metodo ? riga('Pagamento alla firma', d.metodo) : '') +
    riga('Metodo di pagamento delle rate', 'Tramite piattaforma TSPay (dati non riportati, art. 4.1)') +
    (p.penale ? riga('Penale per rata non pagata', p.penale + ' dal giorno 5 del mese, per ogni mese di ritardo (art. 4.3)') : '') +
    (p.garanziaFino ? riga('Recesso convenzionale (art. 14.1)', 'Facoltà di recedere senza motivo, con rimborso integrale, entro il ' + p.garanziaFino) : '') + '</table>');

  h.push('<div class="pb"></div><h2>Condizioni generali di contratto e Regolamento interno</h2>' + CONDIZIONI);
  h.push('<h2>Approvazioni</h2>');
  SPUNTE.forEach((sp, i) => { h.push('<div class="sp"><b class="ok">☑ ' + (i + 1) + ' · ' + esc(sp.titolo) + '</b><br>' + esc(sp.testo) + '</div>'); });
  h.push('<h2>Informativa privacy</h2>' + INFORMATIVA);
  h.push('%%REGISTRO%%</body></html>');
  return h.join('');
}

export function htmlRegistro(c, impronta) {
  const d = c.dettagli || {}, t = d.titolare || {}, cl = d.client || {};
  const r = ['<h2>Registro della firma (art. 13.3)</h2><table class="reg">'];
  (d.eventi || []).forEach(e => { r.push('<tr><td style="width:28%">' + esc(oraRomaCompleta(e[0])) + '</td><td>' + esc(e[1]) + '</td></tr>'); });
  r.push('</table><table class="reg">' +
    riga('Firmatario', t.nome + ' ' + t.cognome + ' · ' + t.cf) +
    riga('Cellulare dichiarato', t.cellulare) +
    riga('Codice OTP inviato via', (d.canale || '') + ' a ' + (d.canale === 'SMS' ? t.cellulare : t.email) + (d.smsFallito ? ' (SMS non disponibile)' : '')) +
    riga('Indirizzo IP', cl.ip || 'non rilevato') + riga('Dispositivo', cl.ua || '') +
    riga('Schermo e lingua', (cl.schermo || '') + ' · ' + (cl.lingua || '')) +
    riga('Identificativo sessione', c.id) +
    (d.offerte && d.offerte.length ? riga('Offerte mostrate prima della scelta (art. 2.1)', d.offerte.join(' · ')) : '') + '</table>' +
    '<p class="small" style="margin-top:6px">Impronta informatica SHA-256 del contratto (riepilogo, condizioni, approvazioni e informativa):</p><p class="hash">' + impronta + '</p>');
  return r.join('');
}

let _logo = null;
export async function logoDataUri() {
  if (_logo !== null) return _logo;
  try {
    const r = await fetch(URL_LOGO);
    const b = Buffer.from(await r.arrayBuffer());
    _logo = 'data:' + (r.headers.get('content-type') || 'image/png') + ';base64,' + b.toString('base64');
  } catch (e) { _logo = ''; }
  return _logo;
}

/** HTML -> PDF con Chromium (stesso motore di Google). */
export async function htmlInPdf(html) {
  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({
    args: chromium.args, defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(), headless: true
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally { await browser.close(); }
}
