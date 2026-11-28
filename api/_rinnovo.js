// Mail dei 75 giorni (rinnovo tacito): archivio su Jarvis e collegamento al contratto dell'App Contratti (regola di Andrea del 27/11/2026).
// Se un socio contesta il rinnovo, dal back office gli si manda il contratto con allegata la mail che glielo ricordava.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { db, segreto } from './_jarvis-base.js';

export async function archiviaRinnovo(chiave, email, nome, cognome, abbonamento, scadenza, oggetto, testo) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  const e = String(email || '').trim().toLowerCase();
  const c = await (await db('/rest/v1/contratti?email=ilike.' + encodeURIComponent(e) + '&firmato=eq.true&annullato=eq.false&prova=eq.false&select=numero&order=firmato_il.desc&limit=1')).json();
  const contratto = Array.isArray(c) && c[0] ? c[0].numero : null;
  const r = await db('/rest/v1/mail_rinnovo', 'POST', { email: e, nome, cognome, abbonamento, scadenza: scadenza ? String(scadenza).slice(0, 10) : null, oggetto, testo, contratto }, { Prefer: 'return=minimal' });
  return { ok: r.ok, contratto };
}

// PDF della mail inviata (allegato al contratto quando lo si rimanda al socio)
export async function pdfMailRinnovo(m) {
  const doc = await PDFDocument.create(), f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const p = doc.addPage([595, 842]); let y = 790;
  const scrivi = (t, font, size, col) => {
    const parole = String(t).replace(/[^\u0000-ÿ€«»’‘“”–—…]/g, '').split(' '); let riga = '';
    const flush = () => { p.drawText(riga, { x: 50, y, size, font, color: col || rgb(0.08, 0.2, 0.25) }); y -= size + 6; riga = ''; };
    parole.forEach(w => { const prova = riga ? riga + ' ' + w : w; if (font.widthOfTextAtSize(prova, size) > 495) { flush(); riga = w; } else riga = prova; });
    if (riga) flush();
  };
  const quando = new Date(m.inviata_il).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'long', timeStyle: 'short' });
  scrivi('Officine Sportive · Gate Fitness SSD srl', fb, 13); y -= 6;
  scrivi('Copia della comunicazione di rinnovo tacito inviata al socio', fb, 15); y -= 10;
  scrivi('Inviata il: ' + quando, f, 11); scrivi('Da: Officine Sportive <info@officinesportive.it>', f, 11); scrivi('A: ' + m.email, f, 11);
  scrivi('Abbonamento: ' + (m.abbonamento || '') + (m.scadenza ? ' · scadenza ' + String(m.scadenza).split('-').reverse().join('/') : ''), f, 11);
  scrivi('Oggetto: ' + m.oggetto, f, 11); y -= 12;
  String(m.testo || '').split('\n').forEach(l => { if (l.trim()) scrivi(l, f, 12); else y -= 10; });
  return Buffer.from(await doc.save());
}
