// 28/11/2026 · Verifica notturna della chiusura cassa di ieri con i dati definitivi di Playtomic
// (prima la faceva un compito di Claude alle 4:41 sul foglio Google «Cassa» e sull'artifact della Prima nota).
// Regola di Andrea (20-23/11/2026): se una chiusura KO torna con Playtomic aggiornato diventa OK, sparisce
// dalle chiusure da risolvere, l'azione di cassa nell'Action plan si chiude e chi ha chiuso, Alessandro e Andrea lo sanno.
// Se non torna nemmeno così non si tocca niente: resta KO e si risolve dalla Prima nota come sempre.
import { db, segreto, inviaMail } from './_jarvis-base.js';
import { calcolaGiorno, scheda as schedaPT } from './_pn-playtomic.js';

const PLAYTOMIC = '1LRHt3BDd_J6m8VDQ4KO7ux1wp64kRD5tUqPozbdoIz4';
const AP = '14HxB5_4S0tb3duMbfnxHl2g9CBQki4mAP6apBK7ti-g';
const MAIL = { Aurora: 'aurorapt@officinesportive.it', Giorgia: 'giorgia@officinesportive.it', Francesca: 'c.francesca@officinesportive.it',
  Alessandro: 'alessandropt@officinesportive.it', Luca: 'm.luca@officinesportive.it', Teresa: 's.teresa@officinesportive.it', Andrea: 'andreadotti@officinesportive.it' };
const r2 = x => Math.round(x * 100) / 100;
const n = v => Number(v) || 0;
const json = async p => (await db(p)).json();
const roma = (d, o) => d.toLocaleString('it-IT', { timeZone: 'Europe/Rome', ...o });

async function scheda(nome) {
  const x = (await json('/rest/v1/gas_fogli?foglio=eq.' + PLAYTOMIC + '&scheda=eq.' + encodeURIComponent(nome) + '&select=valori'))[0];
  return (x && x.valori) || [];
}

function mailHtml(titolo, corpo) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#14323F;max-width:620px"><div style="background:#13556F;color:#ffffff;padding:16px 20px;font-size:12px;letter-spacing:2px;font-weight:bold;border-radius:12px 12px 0 0">OFFICINE SPORTIVE · PRIMA NOTA</div>'
    + '<div style="padding:20px;border:1px solid #DCE6E8;border-top:0;border-radius:0 0 12px 12px;font-size:15px;line-height:1.55"><div style="font-size:19px;font-weight:bold;color:#13556F;margin:0 0 14px">' + titolo + '</div>' + corpo
    + '<table role="presentation" style="margin:18px 0 0"><tr><td style="vertical-align:middle;padding-right:10px"><img src="https://officine-sportive.vercel.app/jarvis-logo.gif" width="56" height="56" alt="Jarvis"></td><td style="vertical-align:middle;font-size:15px">Un caro saluto,<br><b>Jarvis</b></td></tr></table></div></div>';
}

async function chiudiAzione(G, adesso) {
  const fg = (await json('/rest/v1/gas_fogli?foglio=eq.' + AP + '&scheda=eq.Action%20plan&select=valori'))[0];
  if (!fg) return false;
  const v = fg.valori, h = v[0], id = 'cassa-' + G;
  const i = v.findIndex((r, k) => k > 0 && r[0] === id);
  if (i < 0 || /risolta|annullata/i.test(String(v[i][h.indexOf('Stato')]))) return false;
  const r = v[i].slice(), col = x => h.indexOf(x), ora = roma(adesso, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
  const nota = 'Chiusura confermata OK da Jarvis dopo l\'aggiornamento di Playtomic';
  r[col('Stato')] = 'Risolta'; r[col('Ultima nota del direttore')] = nota; r[col('Ultimo aggiornamento')] = ora; r[col('Risolta il')] = ora;
  try {
    const j = JSON.parse(r[col('json (non modificare)')]); const t = adesso.getTime();
    j.status = 'risolta'; j.dnote = nota; j.updated = t; j.doneAt = t; j.log = (j.log || []).concat({ ts: t, s: 'risolta', n: nota });
    r[col('json (non modificare)')] = JSON.stringify(j);
  } catch (e) { /* json illeggibile: aggiorno solo le colonne */ }
  v[i] = r;
  const w = await db('/rest/v1/gas_fogli?foglio=eq.' + AP + '&scheda=eq.Action%20plan', 'PATCH', { valori: v, aggiornato_il: adesso.toISOString() }, { Prefer: 'return=minimal' });
  return w.ok;
}

export async function pnVerificaNotte(chiave, giorno, prova) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  const adesso = new Date();
  const G = giorno || new Date(Date.now() - 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const doc = (await json('/rest/v1/pn_docs?path=eq.cassa/stato&select=data,versione'))[0];
  if (!doc) return { ok: false, errore: 'stato della Prima nota non trovato' };
  const S = JSON.parse(doc.data.json), e = (S.arch || []).find(a => a.day === G);
  if (!e) return { ok: true, esito: 'chiusura del ' + G + ' non trovata' };
  if ((e.esito === 'OK' || e.risolta) && !prova) return { ok: true, esito: 'cassa del ' + G + ' già OK' };
  // Playtomic aggiornato dopo la mezzanotte (dati definitivi del giorno)
  const info = await scheda('Info'), riga = info.find(r => /ultimo aggiornamento/i.test(String(r[0])));
  const quando = riga && riga[1] && riga[1].$d ? new Date(riga[1].$d) : null;
  const domani0 = new Date(G + 'T23:00:00Z').getTime();   // mezzanotte italiana (inverno)
  if (!giorno && (!quando || quando.getTime() < domani0 + 3 * 3600e3)) return { ok: true, esito: 'Playtomic non ancora aggiornato dopo le 4', quando };
  const [pag, pren, corr] = await Promise.all([schedaPT('Pagamenti'), schedaPT('Prenotazioni'), schedaPT('Correzioni K')]);
  const P = calcolaGiorno(G, pag, pren, corr), q = e.q || {};
  const incassi = r2(n(q.wc) + n(q.pc) + n(q.ts) + n(q.bo) + n(P.po) + n(q.st) + n(q.su) + n(q.fp));
  const gestionali = r2(n(q.gw) + n(P.gp));
  const A = Math.abs(incassi - gestionali) <= 0.01, B = Math.abs(n(q.pc) - n(P.pc)) <= 0.01, C = Math.abs(n(q.z) + n(q.an22) - n(q.gi)) <= 0.01;
  const conti = { gpF: P.gp, pcF: P.pc, poF: P.po, incassi, gestionali, A, B, C };
  if (!(A && B && C)) return { ok: true, esito: 'cassa del ' + G + ' resta KO', conti };
  if (prova) return { ok: true, esito: 'tornerebbe OK (prova, niente scritto)', conti };
  // Torna → OK nella Prima nota (rev + 1 così le app aperte non la sovrascrivono)
  const ora = roma(adesso, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
  e.esito = 'OK'; e.risolta = true; q.gp = P.gp; q.po = P.po; e.q = q;
  e.fix = (e.fix || []).concat({ da: 'Jarvis', il: ora, cause: ['Dati Playtomic aggiornati'], nota: 'Confermata OK da Jarvis con i dati definitivi di Playtomic (totale ' + P.gp + ' €)', verifica: 'notturna' });
  S.rev = n(S.rev) + 1;
  const w = await db('/rest/v1/pn_docs?path=eq.cassa/stato&versione=eq.' + doc.versione, 'PATCH',
    { data: { ...doc.data, json: JSON.stringify(S), rev: S.rev, at: adesso.getTime() }, versione: doc.versione + 1, aggiornato_il: adesso.toISOString() }, { Prefer: 'return=representation' });
  const scritto = w.ok && (await w.json()).length === 1;
  if (!scritto) return { ok: false, errore: 'Prima nota cambiata nel frattempo: riprovo al prossimo giro', conti };
  const azione = await chiudiAzione(G, adesso);
  // Mail breve a chi ha chiuso, Alessandro e Andrea
  const gm = G.slice(8) + '/' + G.slice(5, 7), chi = e.da || '';
  const nomi = [...new Set([chi, 'Alessandro', 'Andrea'].filter(x => MAIL[x]))];
  const corpo = '<p style="margin:0 0 12px">Ciao ' + nomi.join(', ').replace(/, ([^,]*)$/, ' e $1') + '! 👋</p>'
    + '<p style="margin:0 0 12px">buone notizie: con i dati aggiornati di Playtomic la cassa del <b>' + gm + '</b> torna ✓ (padel ' + P.gp.toFixed(2).replace('.', ',') + ' €).</p>'
    + '<p style="margin:0">' + (azione ? 'L\'azione nell\'action plan è chiusa e n' : 'N') + 'essuno deve fare niente. 🙌</p>';
  await inviaMail(nomi.map(x => MAIL[x]), '✅ Cassa del ' + gm + ': tornata con i dati aggiornati di Playtomic', mailHtml('✅ Cassa del ' + gm + ' tornata', corpo), 'Jarvis · Officine Sportive');
  return { ok: true, esito: 'cassa del ' + G + ' confermata OK', azione, conti, a: nomi };
}
