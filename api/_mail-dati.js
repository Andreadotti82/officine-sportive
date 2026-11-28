// Mail «I dati della mattina / della sera» a chi apre / chi chiude il circolo (prima la mandava un compito di Claude da Gmail).
// Turni: app Turni su Jarvis (turni_docs). Mittente: info@ con Resend. Una sola mail al giorno per tipo.
import { db, segreto, inviaMail } from './_jarvis-base.js';

const TEAM = {
  aurora: ['Aurora', 'aurorapt@officinesportive.it'], giorgia: ['Giorgia', 'giorgia@officinesportive.it'],
  francesca: ['Francesca', 'c.francesca@officinesportive.it'], alept: ['Alessandro', 'alessandropt@officinesportive.it'],
  luca: ['Luca', 'm.luca@officinesportive.it'], teresa: ['Teresa', 's.teresa@officinesportive.it']
};
const TIPI = {
  mattina: { titolo: '☀️ I dati della mattina', testa: 'DATI DELLA MATTINA', saluto: 'Buongiorno', frase: 'dati della mattina', file: 'Jarvis 1 · Jarvis 2' },
  sera: { titolo: '🌙 I dati della sera', testa: 'DATI DELLA SERA', saluto: 'Buonasera', frase: 'dati della sera', file: 'Jarvis 3 · Jarvis 4' }
};

function html(t, nome, tipo) {
  const link = 'https://officine-sportive.vercel.app/goodmorning?page=dati&amp;t=' + tipo;
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#14323F;max-width:620px"><div style="background:#13556F;color:#ffffff;padding:16px 20px;font-size:12px;letter-spacing:2px;font-weight:bold;border-radius:12px 12px 0 0">OFFICINE SPORTIVE · ' + t.testa + '</div>'
    + '<div style="padding:20px;border:1px solid #DCE6E8;border-top:0;border-radius:0 0 12px 12px;font-size:15px;line-height:1.55"><div style="font-size:19px;font-weight:bold;color:#13556F;margin:0 0 14px">' + t.titolo + '</div>'
    + '<p style="margin:0 0 12px">' + t.saluto + ' ' + nome + '! 👋</p><p style="margin:0 0 12px">ho bisogno dei consueti ' + t.frase + '. Li trovi su <b>Wellness in Cloud</b>, tra le ricerche veloci già pronte.</p>'
    + '<a href="' + link + '" style="display:block;text-decoration:none;color:#14323F;background:#F3F8F8;border:2px dashed #1A9DA7;border-radius:14px;padding:18px 16px;text-align:center;margin:4px 0 12px"><div style="font-size:26px;line-height:1">📤</div><div style="font-size:18px;font-weight:bold;color:#13556F;margin:6px 0 2px">Carica i file</div><div style="font-size:15px"><b>' + t.file + '</b></div><div style="font-size:13px;color:#5A707A;margin-top:6px">Tocca qui per scegliere i file</div></a>'
    + '<p style="margin:0;font-size:13px;color:#5A707A">Puoi sceglierli tutti insieme: appena li selezioni arrivano a me. Grazie! 🙌</p>'
    + '<table role="presentation" style="margin:18px 0 0"><tr><td style="vertical-align:middle;padding-right:10px"><img src="https://officine-sportive.vercel.app/jarvis-logo.gif" width="56" height="56" alt="Jarvis"></td><td style="vertical-align:middle;font-size:15px;font-family:Arial,Helvetica,sans-serif;color:#14323F">Un caro saluto,<br><b>Jarvis</b></td></tr></table></div></div>';
}

// prova = indirizzo: manda solo lì, con [SIMULAZIONE] nell'oggetto, senza segnare l'invio
export async function mailDati(chiave, tipo, prova) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  const t = TIPI[tipo]; if (!t) return { ok: false, errore: 'tipo sconosciuto' };
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const st = (await (await db('/rest/v1/jarvis_stato?chiave=eq.mail-dati&select=valore')).json())[0];
  const fatto = (st && st.valore) || {};
  if (!prova && fatto[tipo] === oggi) return { ok: true, inviata: false, motivo: 'già mandata oggi' };
  const mese = (await (await db('/rest/v1/turni_docs?path=eq.months/' + oggi.slice(0, 7) + '&select=data')).json())[0];
  const turni = ((mese && mese.data && mese.data.status === 'pubblicato' && mese.data.schedule && mese.data.schedule[oggi]) || []).filter(x => x && TEAM[x.s]);
  if (!turni.length) return { ok: true, inviata: false, motivo: 'nessun turno oggi' };
  const chi = turni.slice().sort((x, y) => tipo === 'mattina' ? (x.a - y.a) : (y.b - x.b))[0];
  const [nome, mail] = TEAM[chi.s];
  await inviaMail(prova || mail, (prova ? '[SIMULAZIONE → ' + nome + '] ' : '') + t.titolo, html(t, nome, tipo), 'Jarvis · Officine Sportive');
  if (!prova) await db('/rest/v1/jarvis_stato', 'POST', { chiave: 'mail-dati', valore: { ...fatto, [tipo]: oggi } }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
  return { ok: true, inviata: true, a: prova || mail, persona: nome };
}
