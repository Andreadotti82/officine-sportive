// API Vercel: sequenza mail ex soci (chi ha dato disdetta)
// GET /api/sequenza-exsoci?chiave=CHIAVE  → processa le mail da inviare
// POST /api/sequenza-exsoci  → aggiunge un ex socio alla sequenza
//
// Sequenza: entro 15 giorni dalla disdetta una mail per annullarla,
// poi un richiamo ogni 5 mesi finché non si reiscrive o chiede di smettere.
// TUTTE LE MAIL SONO BLOCCATE finché non si attiva l'invio.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kyricrhlqlassvhxqjgf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5cmljcmhscWxhc3N2aHhxamdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2OTU4MjEsImV4cCI6MjExMTI3MTgyMX0.PgX0_48IE63SB7MFEWaRSpMsA7uPqAh2GLQ-X2uNuyU';
const RESEND_KEY = process.env.RESEND_API_KEY || '';
const CHIAVE_API = process.env.CHIAVE_LISTA || 'ecd56c492f930d32';
const BASE_URL = 'https://officine-sportive.vercel.app';

// BLOCCO INVIO: true = nessuna mail parte (dry run)
const INVIO_BLOCCATO = true;

const SEQUENZA = [
  { step: 0, giorni: 15, oggetto: '💚 Ci manchi già — annulla la disdetta a condizioni esclusive' },
  // Step 1+: richiami ogni 5 mesi
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'POST') return nuovoExSocio(req, res);
  if (req.method === 'GET') {
    if (req.query.chiave !== CHIAVE_API) return res.status(403).json({ ok: false });
    return processaSequenza(req, res);
  }
  return res.status(405).json({ ok: false });
}

async function nuovoExSocio(req, res) {
  try {
    const { nome, cognome, email } = req.body || {};
    if (!email) return res.status(400).json({ ok: false, errore: 'Email mancante' });

    // Upsert contatto
    let contatto = await upsertContatto(nome, cognome, email);
    if (!contatto) return res.status(500).json({ ok: false });
    if (contatto.disiscritto) return res.status(200).json({ ok: true, sequenza: false, motivo: 'disiscritto' });

    // Controlla sequenza esistente
    const r = await supaFetch(`/rest/v1/sequenze_mail?contatto_id=eq.${contatto.id}&sequenza=eq.ex_soci&attiva=eq.true`, 'GET');
    const esistenti = await r.json();
    if (esistenti.length > 0) return res.status(200).json({ ok: true, sequenza: false, motivo: 'già attiva' });

    // Avvia sequenza: prima mail tra 15 giorni
    const tra15g = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    await supaFetch('/rest/v1/sequenze_mail', 'POST', {
      contatto_id: contatto.id, sequenza: 'ex_soci', step: 0, prossima_mail_il: tra15g
    });

    return res.status(200).json({ ok: true, sequenza: true });
  } catch (err) {
    console.error('Errore nuovoExSocio:', err);
    return res.status(500).json({ ok: false });
  }
}

async function processaSequenza(req, res) {
  try {
    const adesso = new Date().toISOString();
    const r = await supaFetch(
      `/rest/v1/sequenze_mail?sequenza=eq.ex_soci&attiva=eq.true&prossima_mail_il=lte.${adesso}&select=*,contatti(*)`, 'GET'
    );
    const daInviare = await r.json();
    let inviate = 0;

    for (const seq of daInviare) {
      const c = seq.contatti;
      if (!c || c.disiscritto) {
        await fermaSequenza(seq.id, c?.disiscritto ? 'disiscritto' : 'contatto_mancante');
        continue;
      }
      if (c.iscritto) { await fermaSequenza(seq.id, 'iscritto'); continue; }

      const ok = await inviaMail(c, seq);
      if (ok) inviate++;
    }

    return res.status(200).json({ ok: true, inviate, totale: daInviare.length, bloccato: INVIO_BLOCCATO });
  } catch (err) {
    console.error('Errore processaSequenza ex_soci:', err);
    return res.status(500).json({ ok: false });
  }
}

async function inviaMail(contatto, seq) {
  const nome = contatto.nome || '';
  const disLink = `${BASE_URL}/disiscrizione.html?t=${contatto.id}`;
  let oggetto, corpo;

  if (seq.step === 0) {
    oggetto = SEQUENZA[0].oggetto;
    corpo = `
      <p>Ciao ${nome}!</p>
      <p>Abbiamo ricevuto la tua disdetta e ci dispiace vederti andare.</p>
      <p>Prima di salutarci, volevamo farti sapere una cosa: se cambi idea, puoi <b>annullare la disdetta e mantenere il tuo prezzo attuale</b>.</p>
      <p>I prezzi per i nuovi iscritti sono aumentati, ma per te che sei già stato con noi il tuo abbonamento resta com'era: <b>9 mesi a 9 €</b> al mese e il prezzo attuale confermato.</p>
      <p>Se ti interessa, passa in reception e i ragazzi ti aiutano in un minuto.</p>
    `;
  } else {
    oggetto = '💪 Al circolo c\'è sempre un posto per te';
    corpo = `
      <p>Ciao ${nome}!</p>
      <p>È passato un po' di tempo e volevamo farti sapere che al circolo ti aspettiamo sempre.</p>
      <p>Se ti va di tornare, ti regaliamo <b>2 giorni di prova gratuita</b> per riprendere con calma: palestra, piscina, spa e padel — tutto incluso.</p>
      <p style="text-align:center;margin:24px 0"><a href="${BASE_URL}" style="display:inline-block;padding:14px 32px;background:#07808A;color:#ffffff;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px">Prenota 2 giorni gratis</a></p>
    `;
  }

  const html = wrapMail(corpo, contatto.id);

  if (INVIO_BLOCCATO || !RESEND_KEY) {
    console.log(`[BLOCCATO] Ex soci step ${seq.step} a ${contatto.email}`);
    await avanzaStep(seq);
    return true;
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Officine Sportive <info@officinesportive.it>',
        to: [contatto.email], reply_to: 'info@officinesportive.it',
        subject: oggetto, html
      })
    });
    if (!r.ok) return false;
    const { id: resendId } = await r.json();
    await supaFetch('/rest/v1/log_mail', 'POST', {
      contatto_id: contatto.id, sequenza: 'ex_soci', step: seq.step, oggetto, resend_id: resendId
    });
    await avanzaStep(seq);
    return true;
  } catch { return false; }
}

async function avanzaStep(seq) {
  const prossima = new Date(Date.now() + 150 * 24 * 60 * 60 * 1000).toISOString(); // 5 mesi
  await supaFetch(`/rest/v1/sequenze_mail?id=eq.${seq.id}`, 'PATCH', {
    step: seq.step + 1, ultima_mail_il: new Date().toISOString(), prossima_mail_il: prossima
  });
}

async function fermaSequenza(id, motivo) {
  await supaFetch(`/rest/v1/sequenze_mail?id=eq.${id}`, 'PATCH', { attiva: false, motivo_stop: motivo });
}

async function upsertContatto(nome, cognome, email) {
  const em = email.toLowerCase().trim();
  const r = await supaFetch('/rest/v1/contatti?select=*&email=eq.' + encodeURIComponent(em), 'GET');
  const rows = await r.json();
  if (rows.length > 0) return rows[0];
  const r2 = await supaFetch('/rest/v1/contatti', 'POST', {
    nome, cognome, email: em, origine: 'wellness'
  }, { 'Prefer': 'return=representation' });
  if (r2.ok) { const rows2 = await r2.json(); return rows2[0]; }
  return null;
}

function wrapMail(corpo, contattoId) {
  const disLink = `${BASE_URL}/disiscrizione.html?t=${contattoId}`;
  return `
<div style="padding:24px 10px;font-family:'Montserrat','Trebuchet MS',Arial,sans-serif;background:#F4F9F9">
<div style="max-width:520px;margin:0 auto;border-radius:16px;overflow:hidden;background:#ffffff">
  <div style="padding:20px 0 14px;text-align:center;border-bottom:4px solid #0A9BA5">
    <img src="https://www.officinesportive.it/wp-content/uploads/2025/11/logo-officine-sportive-top.png" width="200" alt="Officine Sportive" style="width:200px;max-width:60%;height:auto">
  </div>
  <div style="padding:24px 26px;font-size:15px;color:#14323F;line-height:1.7">${corpo}</div>
  <div style="border-top:1px solid #D4E0E3;padding:16px 26px;font-size:14px;color:#14323F">
    <table><tr>
      <td style="vertical-align:middle;padding-right:14px"><img src="https://www.officinesportive.it/wp-content/uploads/2025/11/logo-officine-sportive-top.png" width="140" alt="Officine Sportive"></td>
      <td style="vertical-align:middle">Un caro saluto,<br><b style="color:#13556F">Il team di Officine Sportive</b></td>
    </tr></table>
    <div style="margin-top:10px;font-size:11.5px;letter-spacing:.5px;color:#5A707A;text-align:center">Palestra · Piscina · Spa · Padel · Centri estivi</div>
  </div>
  <div style="padding:12px 26px 16px;text-align:center;font-size:11px;color:#A0B0B8">
    <a href="${disLink}" style="color:#A0B0B8;text-decoration:underline">Non voglio più ricevere queste email</a>
  </div>
</div></div>`;
}

function supaFetch(path, method, body, extraHeaders) {
  const headers = { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, ...(extraHeaders || {}) };
  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  return fetch(`${SUPABASE_URL}${path}`, opts);
}
