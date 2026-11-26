// API Vercel: motore della sequenza contatti
// GET /api/sequenza-contatti?chiave=CHIAVE  → processa le mail da inviare
// POST /api/sequenza-contatti  → aggiunge un nuovo contatto alla sequenza

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kyricrhlqlassvhxqjgf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5cmljcmhscWxhc3N2aHhxamdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2OTU4MjEsImV4cCI6MjExMTI3MTgyMX0.PgX0_48IE63SB7MFEWaRSpMsA7uPqAh2GLQ-X2uNuyU';
const RESEND_KEY = process.env.RESEND_API_KEY || '';
const CHIAVE_API = process.env.CHIAVE_LISTA || 'ecd56c492f930d32';
const BASE_URL = 'https://officine-sportive.vercel.app';

// Sequenza: giorno → step
// Step 0: giorno 0 (subito), Step 1: giorno 2, Step 2: giorno 5, Step 3: giorno 7
// Step 4: giorno 15 (con prova gratuita), Step 5+: ogni 5 mesi
const SEQUENZA = [
  { step: 0, giorni: 0, oggetto: '👋 Ciao! Ecco tutto quello che devi sapere su Officine Sportive' },
  { step: 1, giorni: 2, oggetto: 'Hai visto cosa ti aspetta al circolo?' },
  { step: 2, giorni: 5, oggetto: '💪 Il circolo ti aspetta: palestra, piscina, spa e padel' },
  { step: 3, giorni: 7, oggetto: '🎯 Ultima occasione per la promo del mese' },
  { step: 4, giorni: 15, oggetto: '🎁 Stai ancora pensando? Ti regaliamo 2 giorni gratis' },
  // Step 5+ = richiami ogni 5 mesi (gestiti nel codice)
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST = nuovo contatto
  if (req.method === 'POST') return nuovoContatto(req, res);

  // GET = processa sequenza (chiamato da cron)
  if (req.method === 'GET') {
    if (req.query.chiave !== CHIAVE_API) return res.status(403).json({ ok: false });
    return processaSequenza(req, res);
  }

  return res.status(405).json({ ok: false });
}

// === Nuovo contatto ===
async function nuovoContatto(req, res) {
  try {
    const { nome, cognome, email, cellulare, origine } = req.body || {};
    if (!email) return res.status(400).json({ ok: false, errore: 'Email mancante' });

    // Inserisci o aggiorna contatto (upsert su email)
    const r = await supaFetch('/rest/v1/contatti', 'POST', {
      nome, cognome, email: email.toLowerCase().trim(), cellulare,
      origine: origine || 'info'
    }, { 'Prefer': 'return=representation', 'on-conflict': 'email' });

    // Se il contatto esiste già, prendiamo quello
    let contatto;
    if (r.status === 409) {
      // Già esiste, leggiamolo
      const r2 = await supaFetch(`/rest/v1/contatti?email=eq.${encodeURIComponent(email.toLowerCase().trim())}&select=*`, 'GET');
      const rows = await r2.json();
      contatto = rows[0];
    } else if (r.ok) {
      const rows = await r.json();
      contatto = rows[0];
    } else {
      return res.status(500).json({ ok: false, errore: 'Errore salvataggio contatto' });
    }

    if (!contatto) return res.status(500).json({ ok: false, errore: 'Contatto non trovato' });

    // Se è già disiscritto o iscritto, non avviare la sequenza
    if (contatto.disiscritto || contatto.iscritto) {
      return res.status(200).json({ ok: true, id: contatto.id, sequenza: false, motivo: 'disiscritto o già iscritto' });
    }

    // Controlla se ha già una sequenza contatti attiva
    const r3 = await supaFetch(`/rest/v1/sequenze_mail?contatto_id=eq.${contatto.id}&sequenza=eq.contatti&attiva=eq.true`, 'GET');
    const seqEsistenti = await r3.json();
    if (seqEsistenti.length > 0) {
      return res.status(200).json({ ok: true, id: contatto.id, sequenza: false, motivo: 'sequenza già attiva' });
    }

    // Avvia la sequenza: step 0, prossima mail = adesso
    await supaFetch('/rest/v1/sequenze_mail', 'POST', {
      contatto_id: contatto.id,
      sequenza: 'contatti',
      step: 0,
      prossima_mail_il: new Date().toISOString()
    });

    return res.status(200).json({ ok: true, id: contatto.id, sequenza: true });

  } catch (err) {
    console.error('Errore nuovo contatto:', err);
    return res.status(500).json({ ok: false, errore: err.message });
  }
}

// === Processa sequenza (cron) ===
async function processaSequenza(req, res) {
  try {
    const adesso = new Date().toISOString();

    // Trova tutte le sequenze contatti attive con prossima_mail <= adesso
    const r = await supaFetch(
      `/rest/v1/sequenze_mail?sequenza=eq.contatti&attiva=eq.true&prossima_mail_il=lte.${adesso}&select=*,contatti(*)`,
      'GET'
    );
    const daInviare = await r.json();

    let inviate = 0;
    let errori = 0;

    for (const seq of daInviare) {
      const contatto = seq.contatti;
      if (!contatto || contatto.disiscritto || contatto.iscritto) {
        // Ferma la sequenza
        await supaFetch(`/rest/v1/sequenze_mail?id=eq.${seq.id}`, 'PATCH', {
          attiva: false, motivo_stop: contatto?.iscritto ? 'iscritto' : 'disiscritto'
        });
        continue;
      }

      // Trova la mail da mandare
      const stepInfo = SEQUENZA.find(s => s.step === seq.step);
      if (!stepInfo) {
        // Dopo step 4: richiami ogni 5 mesi
        if (seq.step >= 5) {
          const ok = await inviaMailRichiamo(contatto, seq);
          if (ok) inviate++;
          else errori++;
        } else {
          // Sequenza completata
          await supaFetch(`/rest/v1/sequenze_mail?id=eq.${seq.id}`, 'PATCH', {
            attiva: false, motivo_stop: 'completata'
          });
        }
        continue;
      }

      // Invia la mail
      const ok = await inviaMailStep(contatto, seq, stepInfo);
      if (ok) inviate++;
      else errori++;
    }

    return res.status(200).json({ ok: true, inviate, errori, totale: daInviare.length });

  } catch (err) {
    console.error('Errore processaSequenza:', err);
    return res.status(500).json({ ok: false, errore: err.message });
  }
}

// === Invia mail di uno step ===
async function inviaMailStep(contatto, seq, stepInfo) {
  try {
    const nome = contatto.nome || '';
    const html = buildMailSequenza(nome, stepInfo.step, contatto.id);

    if (!RESEND_KEY) {
      console.log(`[DRY] Mail step ${stepInfo.step} a ${contatto.email}`);
      // Aggiorna comunque step e prossima mail per test
      await aggiornaDopoInvio(seq, stepInfo.step);
      return true;
    }

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Officine Sportive <info@officinesportive.it>',
        to: [contatto.email],
        reply_to: 'info@officinesportive.it',
        subject: stepInfo.oggetto,
        html
      })
    });

    if (!r.ok) {
      console.error(`Errore Resend step ${stepInfo.step}:`, await r.text());
      return false;
    }

    const { id: resendId } = await r.json();

    // Log
    await supaFetch('/rest/v1/log_mail', 'POST', {
      contatto_id: contatto.id, sequenza: 'contatti',
      step: stepInfo.step, oggetto: stepInfo.oggetto, resend_id: resendId
    });

    // Aggiorna sequenza
    await aggiornaDopoInvio(seq, stepInfo.step);
    return true;

  } catch (err) {
    console.error('Errore inviaMailStep:', err);
    return false;
  }
}

async function aggiornaDopoInvio(seq, stepCorrente) {
  const prossimoStep = stepCorrente + 1;
  const prossimaInfo = SEQUENZA.find(s => s.step === prossimoStep);

  let prossima;
  if (prossimaInfo) {
    // Calcola giorni dalla data di creazione della sequenza
    const inizio = new Date(seq.creato_il);
    prossima = new Date(inizio.getTime() + prossimaInfo.giorni * 24 * 60 * 60 * 1000);
  } else if (prossimoStep >= 5) {
    // Richiami ogni 5 mesi
    prossima = new Date(Date.now() + 150 * 24 * 60 * 60 * 1000);
  } else {
    // Fine sequenza
    await supaFetch(`/rest/v1/sequenze_mail?id=eq.${seq.id}`, 'PATCH', {
      attiva: false, motivo_stop: 'completata',
      step: prossimoStep, ultima_mail_il: new Date().toISOString()
    });
    return;
  }

  await supaFetch(`/rest/v1/sequenze_mail?id=eq.${seq.id}`, 'PATCH', {
    step: prossimoStep,
    ultima_mail_il: new Date().toISOString(),
    prossima_mail_il: prossima.toISOString()
  });
}

// === Mail richiamo (ogni 5 mesi) ===
async function inviaMailRichiamo(contatto, seq) {
  const nome = contatto.nome || '';
  const oggetto = '💪 Ci manchi! Il circolo ti aspetta';
  const html = buildMailSequenza(nome, 99, contatto.id); // 99 = richiamo generico

  if (!RESEND_KEY) {
    console.log(`[DRY] Richiamo a ${contatto.email}`);
    await supaFetch(`/rest/v1/sequenze_mail?id=eq.${seq.id}`, 'PATCH', {
      step: seq.step + 1, ultima_mail_il: new Date().toISOString(),
      prossima_mail_il: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000).toISOString()
    });
    return true;
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Officine Sportive <info@officinesportive.it>',
        to: [contatto.email],
        reply_to: 'info@officinesportive.it',
        subject: oggetto,
        html
      })
    });

    if (r.ok) {
      const { id: resendId } = await r.json();
      await supaFetch('/rest/v1/log_mail', 'POST', {
        contatto_id: contatto.id, sequenza: 'contatti',
        step: seq.step, oggetto, resend_id: resendId
      });
      await supaFetch(`/rest/v1/sequenze_mail?id=eq.${seq.id}`, 'PATCH', {
        step: seq.step + 1, ultima_mail_il: new Date().toISOString(),
        prossima_mail_il: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000).toISOString()
      });
      return true;
    }
    return false;
  } catch { return false; }
}

// === Template mail ===
function buildMailSequenza(nome, step, contattoId) {
  const saluto = nome ? `Ciao ${nome}` : 'Ciao';
  const disLink = `${BASE_URL}/disiscrizione.html?t=${contattoId}`;
  const iscrittoLink = `${BASE_URL}/disiscrizione.html?t=${contattoId}&a=iscritto`;
  const guestPassLink = `${BASE_URL}`;

  let corpo = '';

  if (step === 0) {
    corpo = `
      <p>${saluto}! 👋</p>
      <p>Grazie per averci scritto! Siamo contenti del tuo interesse per il circolo.</p>
      <p><b>Officine Sportive</b> è un circolo sportivo a Fiumicino con tutto quello che serve per stare bene: <b>sala attrezzi, corsi fitness, piscina, spa e padel</b>.</p>
      <p>Vieni a trovarci e scopri tutti i dettagli di persona: il team ti aspetta per farti fare un giro del circolo e trovare l'abbonamento perfetto per te.</p>
      <p style="text-align:center;margin:24px 0"><a href="${guestPassLink}" style="display:inline-block;padding:14px 32px;background:#07808A;color:#ffffff;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px">Prenota 2 giorni gratis</a></p>
      <p>Oppure chiamaci al <b>06 65047505</b> — siamo aperti tutti i giorni.</p>
    `;
  } else if (step === 1) {
    corpo = `
      <p>${saluto}!</p>
      <p>Ti abbiamo mandato le info sul circolo qualche giorno fa. Hai avuto modo di darci un'occhiata?</p>
      <p>Se hai domande, siamo qui. Oppure vieni direttamente: il modo migliore per capire se fa per te è vederlo con i tuoi occhi.</p>
      <p style="text-align:center;margin:24px 0"><a href="${guestPassLink}" style="display:inline-block;padding:14px 32px;background:#07808A;color:#ffffff;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px">Attiva il tuo Guest Pass gratuito</a></p>
    `;
  } else if (step === 2) {
    corpo = `
      <p>${saluto}!</p>
      <p>Al circolo c'è sempre qualcosa da fare: una lezione di fitness, una nuotata, un po' di relax in spa o una partita a padel con gli amici.</p>
      <p>Passa a trovarci e vedi tu stesso — nessun impegno, solo due giorni per provare tutto.</p>
      <p style="text-align:center;margin:24px 0"><a href="${guestPassLink}" style="display:inline-block;padding:14px 32px;background:#07808A;color:#ffffff;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px">Prenota la tua prova gratuita</a></p>
    `;
  } else if (step === 3) {
    corpo = `
      <p>${saluto}!</p>
      <p>È l'ultimo promemoria, promesso! 😊</p>
      <p>Se stavi pensando di provare il circolo, questo è il momento giusto. Vieni a fare due giorni con noi, gratis, e poi decidi con calma.</p>
      <p style="text-align:center;margin:24px 0"><a href="${guestPassLink}" style="display:inline-block;padding:14px 32px;background:#07808A;color:#ffffff;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px">Attiva 2 giorni gratis</a></p>
    `;
  } else if (step === 4) {
    corpo = `
      <p>${saluto}!</p>
      <p>Stai ancora pensando alla tua palestra? 🤔</p>
      <p>Ti regaliamo <b>2 giorni gratuiti</b> al circolo: palestra, piscina, spa e padel — tutto incluso, senza impegno.</p>
      <p>Vieni quando vuoi, dal lunedì al giovedì. Ti basta prenotare con un clic.</p>
      <p style="text-align:center;margin:24px 0"><a href="${guestPassLink}" style="display:inline-block;padding:14px 32px;background:#F59E0B;color:#ffffff;border-radius:14px;text-decoration:none;font-weight:700;font-size:16px">🎁 Prenota i tuoi 2 giorni gratis</a></p>
    `;
  } else {
    // Richiamo generico (ogni 5 mesi)
    corpo = `
      <p>${saluto}!</p>
      <p>È passato un po' di tempo dall'ultima volta che ci siamo sentiti. Come stai?</p>
      <p>Al circolo ci sono sempre novità: nuovi corsi, nuovi orari e tanta voglia di farti stare bene.</p>
      <p>Se ti va di fare un giro, ti aspettiamo a braccia aperte — con 2 giorni di prova gratuita, così riparti senza pensieri.</p>
      <p style="text-align:center;margin:24px 0"><a href="${guestPassLink}" style="display:inline-block;padding:14px 32px;background:#07808A;color:#ffffff;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px">Prenota 2 giorni gratis</a></p>
    `;
  }

  return `
<div style="padding:24px 10px;font-family:'Montserrat','Trebuchet MS',Arial,sans-serif;background:#F4F9F9">
<div style="max-width:520px;margin:0 auto;border-radius:16px;overflow:hidden;background:#ffffff">
  <div style="padding:20px 0 14px;text-align:center;border-bottom:4px solid #0A9BA5">
    <img src="https://www.officinesportive.it/wp-content/uploads/2025/11/logo-officine-sportive-top.png" width="200" alt="Officine Sportive" style="width:200px;max-width:60%;height:auto">
  </div>
  <div style="padding:24px 26px;font-size:15px;color:#14323F;line-height:1.7">
    ${corpo}
  </div>
  <div style="border-top:1px solid #D4E0E3;padding:16px 26px;font-size:14px;color:#14323F">
    <table><tr>
      <td style="vertical-align:middle;padding-right:14px"><img src="https://www.officinesportive.it/wp-content/uploads/2025/11/logo-officine-sportive-top.png" width="140" alt="Officine Sportive"></td>
      <td style="vertical-align:middle">Un caro saluto,<br><b style="color:#13556F">Il team di Officine Sportive</b></td>
    </tr></table>
    <div style="margin-top:10px;font-size:11.5px;letter-spacing:.5px;color:#5A707A;text-align:center">Palestra · Piscina · Spa · Padel · Centri estivi</div>
  </div>
  <div style="padding:12px 26px 16px;text-align:center;font-size:11px;color:#A0B0B8">
    <a href="${disLink}" style="color:#A0B0B8;text-decoration:underline">Non voglio più ricevere queste email</a>
    &nbsp;·&nbsp;
    <a href="${iscrittoLink}" style="color:#A0B0B8;text-decoration:underline">Mi sono già iscritto</a>
  </div>
</div>
</div>`;
}

function supaFetch(path, method, body, extraHeaders) {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    ...(extraHeaders || {})
  };
  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  return fetch(`${SUPABASE_URL}${path}`, opts);
}
