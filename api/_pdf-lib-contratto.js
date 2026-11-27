// PDF del contratto in JavaScript puro (pdf-lib): stessi testi e stessa struttura della versione Google.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { CONDIZIONI, INFORMATIVA, SPUNTE } from './_testi-contratto.js';
import { oraRomaCompleta } from './_pdf-contratto.js';

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const hex = h => rgb(parseInt(h.substr(1, 2), 16) / 255, parseInt(h.substr(3, 2), 16) / 255, parseInt(h.substr(5, 2), 16) / 255);
const C = { testo: hex('#14323F'), blu: hex('#13556F'), tea: hex('#1A9DA7'), grigio: hex('#5A707A'), riga: hex('#D4E0E3'), rosso: hex('#C0392B'), rosa: hex('#FDF2F0'), sfondo: hex('#EEF4F5') };
const W = 595.28, H = 841.89, MX = 34, MT = 40, MB = 40, LARGH = W - 2 * MX;
const dataLunga = s => { const p = String(s || '').split('/'); return p.length === 3 ? Number(p[0]) + ' ' + MESI[Number(p[1]) - 1] + ' ' + p[2] : String(s || ''); };

// Caratteri fuori da WinAnsi (Helvetica standard) sostituiti.
function pulito(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/ /g, ' ')
    .replace(/×/g, 'x').replace(/[^\x20-\x7E -ÿ€–—…•·°]/g, '');
}
function entita(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

class Doc {
  constructor(pdf, f) { this.pdf = pdf; this.f = f; this.pagine = []; this.nuovaPagina(); }
  nuovaPagina() { this.p = this.pdf.addPage([W, H]); this.y = H - MT; this.pagine.push(this.p); }
  spazio(h) { if (this.y - h < MB) this.nuovaPagina(); }
  // runs: [{t, b, i}] -> righe di run, a capo per parole
  righe(runs, size, larg) {
    const out = []; let riga = [], w = 0;
    const font = r => r.b ? this.f.b : r.i ? this.f.i : this.f.r;
    const parole = [];
    runs.forEach(r => { pulito(r.t).split(/(\s+)/).forEach(tok => { if (tok !== '') parole.push({ t: tok, b: r.b, i: r.i }); }); });
    parole.forEach(tok => {
      const sp = /^\s+$/.test(tok.t);
      const tw = font(tok).widthOfTextAtSize(sp ? ' ' : tok.t, size);
      if (!sp && w + tw > larg && riga.length) { while (riga.length && /^\s+$/.test(riga[riga.length - 1].t)) riga.pop(); out.push(riga); riga = []; w = 0; }
      if (sp && !riga.length) return;
      riga.push(sp ? { t: ' ', b: tok.b, i: tok.i } : tok); w += tw;
    });
    if (riga.length) out.push(riga);
    return out;
  }
  testo(runs, o = {}) {
    const size = o.size || 7.9, lh = size * 1.42, x0 = o.x || MX, larg = o.larg || LARGH, col = o.colore || C.testo;
    if (typeof runs === 'string') runs = [{ t: runs, b: !!o.b }];
    this.righe(runs, size, larg).forEach(riga => {
      this.spazio(lh);
      let x = x0;
      riga.forEach(r => {
        const font = r.b ? this.f.b : r.i ? this.f.i : this.f.r;
        this.p.drawText(r.t, { x, y: this.y - size, size, font, color: o.colore || (r.b && o.coloreB) || col });
        x += font.widthOfTextAtSize(r.t, size);
      });
      this.y -= lh;
    });
    this.y -= o.dopo === undefined ? 3 : o.dopo;
  }
  h2(t) {
    this.spazio(28); this.y -= 6;
    this.p.drawText(pulito(t).toUpperCase(), { x: MX, y: this.y - 9.4, size: 9.4, font: this.f.b, color: C.blu });
    this.y -= 12.5;
    this.p.drawLine({ start: { x: MX, y: this.y }, end: { x: W - MX, y: this.y }, thickness: 1.5, color: C.tea });
    this.y -= 4;
  }
  h3(t) {
    this.spazio(26); this.y -= 6;
    this.p.drawText(pulito(t), { x: MX, y: this.y - 8.6, size: 8.6, font: this.f.b, color: C.blu });
    this.y -= 11;
    this.p.drawLine({ start: { x: MX, y: this.y }, end: { x: W - MX, y: this.y }, thickness: 0.75, color: C.riga });
    this.y -= 3;
  }
  // righe chiave/valore come le tabelle del riepilogo
  tabella(righe, o = {}) {
    const size = 7.9, lh = size * 1.42, kL = LARGH * (o.kPerc || 0.36), pad = 4;
    righe.forEach(([k, v, r]) => {
      const vr = r ? null : this.righe([{ t: v }], size, LARGH - kL - 2 * pad);
      const kr = this.righe([{ t: k, b: o.kBold }], size, (r ? LARGH * 0.8 : kL) - 2 * pad);
      const n = Math.max(kr.length, vr ? vr.length : 1);
      const h = n * lh + 2 * pad - 2;
      this.spazio(h);
      kr.forEach((rg, i) => this.p.drawText(rg.map(x => x.t).join(''), { x: MX + pad, y: this.y - pad - size - i * lh + 1, size, font: o.kBold ? this.f.b : this.f.r, color: r ? C.testo : C.grigio }));
      if (r) {
        const tw = (o.kBold ? this.f.b : this.f.r).widthOfTextAtSize(pulito(v), size);
        this.p.drawText(pulito(v), { x: W - MX - pad - tw, y: this.y - pad - size + 1, size, font: o.kBold ? this.f.b : this.f.r, color: C.testo });
      } else vr.forEach((rg, i) => this.p.drawText(rg.map(x => x.t).join(''), { x: MX + kL + pad, y: this.y - pad - size - i * lh + 1, size, font: this.f.r, color: C.testo }));
      this.y -= h;
      this.p.drawLine({ start: { x: MX, y: this.y }, end: { x: W - MX, y: this.y }, thickness: o.kBold ? 1.5 : 0.75, color: o.kBold ? C.blu : C.riga });
    });
    this.y -= 2;
  }
  riquadro(titolo, testo, o = {}) {
    const size = 7.9, lh = size * 1.42, pad = 8;
    const tr = this.righe([{ t: titolo, b: true }], o.tSize || 9.75, LARGH - 2 * pad);
    const cr = this.righe([{ t: testo }], size, LARGH - 2 * pad);
    const h = tr.length * (o.tSize || 9.75) * 1.4 + cr.length * lh + 2 * pad;
    this.spazio(h + 10); this.y -= 6;
    this.p.drawRectangle({ x: MX, y: this.y - h, width: LARGH, height: h, color: o.sfondo || C.rosa, borderColor: o.bordo || C.rosso, borderWidth: o.bw || 1.5 });
    let y = this.y - pad;
    tr.forEach(rg => { this.p.drawText(rg.map(x => x.t).join(''), { x: MX + pad, y: y - (o.tSize || 9.75), size: o.tSize || 9.75, font: this.f.b, color: o.tColore || C.rosso }); y -= (o.tSize || 9.75) * 1.4; });
    cr.forEach(rg => { this.p.drawText(rg.map(x => x.t).join(''), { x: MX + pad, y: y - size, size, font: this.f.r, color: C.testo }); y -= lh; });
    this.y -= h + 6;
  }
  // HTML delle condizioni/informativa: h3, p (con strong/em), table
  html(src) {
    const s = src.replace(/\n/g, ' ');
    const re = /<h3>([\s\S]*?)<\/h3>|<p[^>]*>([\s\S]*?)<\/p>|<table[^>]*>([\s\S]*?)<\/table>/g;
    let m;
    while ((m = re.exec(s))) {
      if (m[1] !== undefined) this.h3(entita(m[1].replace(/<[^>]+>/g, '')));
      else if (m[2] !== undefined) this.testo(runsDa(m[2]), { dopo: 3.5 });
      else {
        const righe = [];
        m[3].replace(/<tr>([\s\S]*?)<\/tr>/g, (x, tr) => {
          const celle = []; tr.replace(/<t([hd])>([\s\S]*?)<\/t[hd]>/g, (y, tipo, c) => { celle.push({ t: entita(c.replace(/<[^>]+>/g, '')), th: tipo === 'h' }); });
          righe.push(celle);
        });
        this.griglia(righe);
      }
    }
  }
  griglia(righe) {
    const size = 7.5, lh = size * 1.4, pad = 4, cw = LARGH / 2;
    righe.forEach(celle => {
      const rr = celle.map(c => this.righe([{ t: c.t, b: c.th }], size, cw - 2 * pad));
      const h = Math.max(...rr.map(r => r.length)) * lh + 2 * pad;
      this.spazio(h);
      if (celle[0] && celle[0].th) this.p.drawRectangle({ x: MX, y: this.y - h, width: LARGH, height: h, color: C.sfondo });
      rr.forEach((r, ci) => r.forEach((rg, i) => this.p.drawText(rg.map(x => x.t).join(''), { x: MX + ci * cw + pad, y: this.y - pad - size - i * lh + 1, size, font: celle[ci].th ? this.f.b : this.f.r, color: C.testo })));
      this.y -= h;
      this.p.drawLine({ start: { x: MX, y: this.y }, end: { x: W - MX, y: this.y }, thickness: 0.75, color: C.riga });
    });
    this.y -= 4;
  }
}
function runsDa(html) {
  const out = []; let b = 0, i = 0;
  html.split(/(<\/?(?:strong|b|em|i)>)/).forEach(tok => {
    if (/^<(strong|b)>$/.test(tok)) b++; else if (/^<\/(strong|b)>$/.test(tok)) b--;
    else if (/^<(em|i)>$/.test(tok)) i++; else if (/^<\/(em|i)>$/.test(tok)) i--;
    else if (tok) out.push({ t: entita(tok.replace(/<[^>]+>/g, '')), b: b > 0, i: i > 0 });
  });
  return out;
}

/** c: contratto con dettagli; cfg: impostazioni; logoPng: Buffer (facoltativo); impronta: SHA-256. */
export async function pdfContratto(c, cfg, logoPng, impronta) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Contratto ' + c.numero); pdf.setAuthor(cfg.societa || 'Officine Sportive'); pdf.setCreator('Jarvis · Officine Sportive');
  const f = { r: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold), i: await pdf.embedFont(StandardFonts.HelveticaOblique) };
  const D = new Doc(pdf, f);
  const d = c.dettagli || {}, p = d.piano || {}, t = d.titolare || {}, m = d.minore || null, abb = d.abb || {}, u = d.upgrade || null;
  const prova = String(c.numero).indexOf('PROVA') === 0;

  // Intestazione
  let logo = null;
  try { if (logoPng) logo = await pdf.embedPng(logoPng); } catch (e) { logo = null; }
  if (logo) { const s = 31.5 / logo.height; D.p.drawImage(logo, { x: MX, y: D.y - 31.5, width: logo.width * s, height: 31.5 }); }
  else D.p.drawText('OFFICINE SPORTIVE', { x: MX, y: D.y - 14, size: 13.5, font: f.b, color: C.blu });
  const n1 = 'Contratto n. ' + c.numero, n2 = 'Firmato il ' + (p.dataFirma || p.firma || '');
  D.p.drawText(n1, { x: W - MX - f.b.widthOfTextAtSize(n1, 7.5), y: D.y - 9, size: 7.5, font: f.b, color: C.grigio });
  D.p.drawText(n2, { x: W - MX - f.r.widthOfTextAtSize(n2, 7.5), y: D.y - 19, size: 7.5, font: f.r, color: C.grigio });
  D.y -= 38;
  D.p.drawLine({ start: { x: MX, y: D.y }, end: { x: W - MX, y: D.y }, thickness: 2.25, color: C.blu });
  D.y -= 10;
  if (prova) D.riquadro('CONTRATTO DI PROVA · NON VALIDO', '', { tSize: 12 });
  D.testo([{ t: 'Contratto di abbonamento · Riepilogo dell\'iscrizione', b: true }], { size: 12.75, colore: C.blu, dopo: 1 });
  D.testo((cfg.societa || '') + ' · ' + (cfg.sede || '') + ' · Circolo ' + (cfg.nomeCircolo || ''), { size: 7.1, colore: C.grigio });

  D.h2(m ? 'Intestatario del contratto (genitore)' : 'Tesserato');
  D.tabella([['Nome e cognome', t.nome + ' ' + t.cognome], ['Codice fiscale', t.cf], ['Nato il / a', (t.nascita || '') + ' · ' + (t.luogoNascita || '')],
    ['Residenza', t.via + ' ' + t.civico + ', ' + t.cap + ' ' + t.comune + ' (' + t.provincia + ')'], ['Cellulare (firma OTP)', t.cellulare]]
    .concat(t.telefono2 ? [['Secondo recapito', t.telefono2]] : []).concat([['Email', t.email]]));
  if (m) { D.h2('Junior'); D.tabella([['Nome e cognome', m.nome + ' ' + m.cognome], ['Codice fiscale', m.cf], ['Nato il / a', (m.nascita || '') + ' · ' + (m.luogoNascita || '')]]); }

  const giorn = abb.tipo === 'giornaliero';
  const ra = [['Abbonamento', p.area + ' · ' + p.abbonamento + (abb.tipo === 'breve' ? ' (breve termine)' : abb.tipo === 'lungo' ? ' (lungo termine)' : '')]];
  if (u && u.cessione) ra.push(['Cessione', 'Subentra a ' + u.cedente + ' nell\'abbonamento in corso, alle medesime condizioni economiche: accesso dal ' + p.primoGiorno + ', rata mensile di ' + p.prezzoEuro + ' dal ' + p.inizio + '; resta ferma la scadenza del ' + u.scadenza + (p.rinnovo ? ', con rinnovo tacito' : ', senza rinnovo tacito')]);
  else if (u) ra.push(['Upgrade', 'Sostituisce l\'abbonamento ' + u.vecchio + ' a decorrere dal ' + p.inizio + '; resta ferma la scadenza del ' + u.scadenza + ', con rinnovo tacito alle condizioni del presente contratto']);
  if (abb.descrizione) ra.push(['Comprende', abb.descrizione]);
  if (p.fasciaOraria) ra.push(['Fascia oraria di accesso', p.fasciaOraria]);
  if (!giorn) ra.push(['Primo giorno di accesso', p.primoGiorno]);
  if (p.prorata && p.prorata.length) ra.push(['Pro rata', p.prorata.map(r => r.periodo).join(' e ')]);
  ra.push([giorn ? 'Valido il' : 'Inizio abbonamento', p.inizio]);
  if (!giorn) ra.push(['Scadenza', p.scadenza]);
  ra.push(['Rinnovo', giorn ? 'Non previsto' : p.rinnovo ? 'Tacito rinnovo per un periodo uguale, alle medesime condizioni (art. 3.2)' : 'Rinnovo non previsto: termina alla scadenza']);
  if (p.promo) ra.push(['Promozione', p.promo]);
  D.h2('Abbonamento'); D.tabella(ra);

  if (p.rinnovo && p.disdettaEntro) {
    D.riquadro('DATA LIMITE PER LA DISDETTA: ' + (p.disdettaOgniAnno ? p.disdettaOgniAnno.toUpperCase() + ' DI OGNI ANNO' : dataLunga(p.disdettaEntro).toUpperCase()),
      'La prima volta è il ' + dataLunga(p.disdettaEntro) + '. Senza disdetta entro questa data l\'abbonamento si rinnova per ' + (Number(abb.durata_mesi) === 12 ? '12 mesi' : 'un periodo uguale') +
      ' alle medesime condizioni. La disdetta è valida solo dal sito, via email a ' + cfg.emailCircolo + ', via PEC o con raccomandata A/R. La disdetta verbale o telefonica non ha alcun valore, e nemmeno il messaggio WhatsApp.');
  } else if (p.rinnovo || abb.tipo === 'breve') {
    D.riquadro('DISDETTA', 'Abbonamento a breve termine: si rinnova ogni mese' + (abb.fine_stagione ? ' fino al ' + p.scadenza + ', termine della stagione,' : '') +
      ' salvo disdetta inviata nei modi e nei termini dell\'art. 3.3 (dal sito, via email a ' + cfg.emailCircolo + ', via PEC o con raccomandata A/R). La disdetta verbale o telefonica non ha alcun valore, e nemmeno il messaggio WhatsApp.');
  }

  D.h2('Pagamenti');
  D.tabella((p.righeFirma || []).map(r => [r.voce, r.importo, true]), { kPerc: 0.8 });
  D.y += 2; D.tabella([['Pagato alla firma', p.totaleFirma, true]], { kPerc: 0.8, kBold: true });
  const rp = [['Piano di pagamento', p.pianoRate]];
  if (d.metodo) rp.push(['Pagamento alla firma', d.metodo]);
  rp.push(['Metodo di pagamento delle rate', 'Tramite piattaforma TSPay (dati non riportati, art. 4.1)']);
  if (p.penale) rp.push(['Penale per rata non pagata', p.penale + ' dal giorno 5 del mese, per ogni mese di ritardo (art. 4.3)']);
  if (p.garanziaFino) rp.push(['Recesso convenzionale (art. 14.1)', 'Facoltà di recedere senza motivo, con rimborso integrale, entro il ' + p.garanziaFino]);
  D.tabella(rp);

  D.nuovaPagina();
  D.h2('Condizioni generali di contratto e Regolamento interno');
  D.html(CONDIZIONI);
  D.h2('Approvazioni');
  SPUNTE.forEach((sp, i) => {
    const size = 7.9, lh = size * 1.42, pad = 6;
    const tr = D.righe([{ t: '[X] ' + (i + 1) + ' · ' + sp.titolo, b: true }], size, LARGH - 2 * pad - 4);
    const cr = D.righe([{ t: sp.testo }], size, LARGH - 2 * pad - 4);
    const h = (tr.length + cr.length) * lh + 2 * pad;
    D.spazio(h + 6); D.y -= 3;
    D.p.drawRectangle({ x: MX, y: D.y - h, width: LARGH, height: h, borderColor: C.riga, borderWidth: 0.75 });
    D.p.drawRectangle({ x: MX, y: D.y - h, width: 3, height: h, color: C.tea });
    let y = D.y - pad;
    tr.forEach(rg => { D.p.drawText(rg.map(x => x.t).join(''), { x: MX + pad + 4, y: y - size, size, font: f.b, color: C.tea }); y -= lh; });
    cr.forEach(rg => { D.p.drawText(rg.map(x => x.t).join(''), { x: MX + pad + 4, y: y - size, size, font: f.r, color: C.testo }); y -= lh; });
    D.y -= h + 3;
  });
  D.h2('Informativa privacy');
  D.html(INFORMATIVA);

  // Registro della firma (art. 13.3)
  const cl = d.client || {};
  D.h2('Registro della firma (art. 13.3)');
  D.tabella((d.eventi || []).map(e => [oraRomaCompleta(e[0]), e[1]]), { kPerc: 0.28 });
  const reg = [['Firmatario', t.nome + ' ' + t.cognome + ' · ' + t.cf], ['Cellulare dichiarato', t.cellulare],
    ['Codice OTP inviato via', (d.canale || '') + ' a ' + (d.canale === 'SMS' ? t.cellulare : t.email) + (d.emailBackup ? ' e via email a ' + t.email : '') + (d.smsFallito ? ' (SMS non disponibile)' : '')],
    ['Indirizzo IP', cl.ip || 'non rilevato'], ['Dispositivo', cl.ua || ''], ['Schermo e lingua', (cl.schermo || '') + ' · ' + (cl.lingua || '')], ['Identificativo sessione', c.id]];
  if (d.offerte && d.offerte.length) reg.push(['Offerte mostrate prima della scelta (art. 2.1)', d.offerte.join(' · ')]);
  D.tabella(reg);
  D.testo('Impronta informatica SHA-256 del contratto (riepilogo, condizioni, approvazioni e informativa):', { size: 7.1, colore: C.grigio, dopo: 1 });
  D.p.drawText(impronta || '', { x: MX, y: D.y - 7, size: 6.8, font: await pdf.embedFont(StandardFonts.Courier), color: C.testo });
  D.y -= 12;

  // Numeri di pagina
  const tot = D.pagine.length;
  D.pagine.forEach((pg, i) => {
    const s = 'Contratto n. ' + c.numero + ' · pagina ' + (i + 1) + ' di ' + tot;
    pg.drawText(s, { x: W - MX - f.r.widthOfTextAtSize(s, 6.5), y: 20, size: 6.5, font: f.r, color: C.grigio });
  });
  return Buffer.from(await pdf.save());
}

/** Revoca della disdetta: documento firmato con OTP al circolo (stesso testo della versione Google). */
export function testoRevoca(r) {
  return 'Il/La sottoscritto/a ' + r.nome + ' ' + r.cognome + ', codice fiscale ' + r.codice_fiscale +
    ', titolare dell\'abbonamento sopra indicato, dichiara di revocare la disdetta comunicata in data ' + r.dataDisdetta +
    ', che deve pertanto intendersi priva di ogni effetto. Il contratto prosegue senza soluzione di continuità alle condizioni in essere, ivi compresi il piano di pagamento, ' +
    'l\'autorizzazione all\'addebito delle rate e il rinnovo tacito alla scadenza del ' + r.scadenzaIt + ', salvo nuova disdetta comunicata nei modi e nei termini previsti dalle Condizioni generali.';
}
export async function pdfRevoca(r, logoPngBuf, impronta) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Revoca della disdetta ' + r.numero); pdf.setCreator('Jarvis · Officine Sportive');
  const f = { r: await pdf.embedFont(StandardFonts.Helvetica), b: await pdf.embedFont(StandardFonts.HelveticaBold), i: await pdf.embedFont(StandardFonts.HelveticaOblique) };
  const D = new Doc(pdf, f);
  let logo = null;
  try { if (logoPngBuf) logo = await pdf.embedPng(logoPngBuf); } catch (e) { logo = null; }
  if (logo) { const s = 34.5 / logo.height; D.p.drawImage(logo, { x: MX, y: D.y - 34.5, width: logo.width * s, height: 34.5 }); D.y -= 44; }
  else { D.p.drawText('OFFICINE SPORTIVE', { x: MX, y: D.y - 14, size: 13.5, font: f.b, color: C.blu }); D.y -= 24; }
  if (/^PROVA/.test(r.numero)) D.riquadro('DOCUMENTO DI PROVA', '', { tSize: 11 });
  D.testo([{ t: 'Revoca della disdetta', b: true }], { size: 16, colore: C.blu, dopo: 2 });
  D.testo('Documento n. ' + r.numero + ' · Gate Fitness S.S.D. a r.l. · Circolo Officine Sportive', { size: 8.5, colore: C.grigio });
  D.h2('Dati');
  D.tabella([['Tesserato', r.nome + ' ' + r.cognome], ['Codice fiscale', r.codice_fiscale], ['Abbonamento', r.abbonamento],
    ['Disdetta comunicata il', r.dataDisdetta], ['Scadenza dell\'abbonamento', r.scadenzaIt]]);
  D.riquadro('', testoRevoca(r), { bordo: C.blu, sfondo: rgb(1, 1, 1), tSize: 1 });
  D.h2('Firma elettronica');
  D.testo('Sottoscritto con codice OTP personale inviato al cellulare ' + r.cellulare + ' (o all\'email ' + r.email + '), presso il Circolo, con la registrazione di ' + r.staff + '.', { size: 8.5 });
  D.tabella((r.eventi || []).map(e => [oraRomaCompleta(e[0]), e[1]]), { kPerc: 0.28 });
  D.testo('Impronta del documento (SHA-256): ' + (impronta || ''), { size: 7, colore: C.grigio });
  return Buffer.from(await pdf.save());
}
