// API Vercel: manda la mail col Guest Pass al socio via SendGrid
// Chiamata internamente dopo il salvataggio in Supabase
// POST /api/mail-guestpass  { nome, cognome, email }

const RESEND_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = 'info@officinesportive.it';
const FROM_NAME = 'Officine Sportive';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const { nome, cognome, email } = req.body || {};
  if (!nome || !email) return res.status(400).json({ ok: false, errore: 'Dati mancanti' });

  if (!RESEND_KEY) {
    console.log('Resend non configurato, mail non inviata');
    return res.status(200).json({ ok: true, mail: false, motivo: 'Resend non configurato' });
  }

  const htmlBody = buildGuestPassEmail(nome, cognome);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [email],
        reply_to: FROM_EMAIL,
        subject: '🎟️ Il tuo Guest Pass: 2 giorni gratis al circolo Officine Sportive',
        html: htmlBody
      })
    });

    if (response.ok) {
      return res.status(200).json({ ok: true, mail: true });
    } else {
      const err = await response.text();
      console.error('Errore Resend:', response.status, err);
      return res.status(200).json({ ok: true, mail: false, motivo: 'Errore invio' });
    }
  } catch (err) {
    console.error('Errore mail:', err);
    return res.status(200).json({ ok: true, mail: false, motivo: 'Errore connessione' });
  }
}

function buildGuestPassEmail(nome, cognome) {
  return `
<div style="padding:24px 10px;font-family:'Montserrat','Trebuchet MS',Arial,sans-serif;background:#F4F9F9">
<div style="max-width:520px;margin:0 auto;border-radius:16px;overflow:hidden;background:#ffffff">

  <!-- Header con logo -->
  <div style="padding:20px 0 14px;text-align:center;border-bottom:4px solid #0A9BA5">
    <img src="https://www.officinesportive.it/wp-content/uploads/2025/11/logo-officine-sportive-top.png" width="200" alt="Officine Sportive" style="width:200px;max-width:60%;height:auto">
  </div>

  <!-- Banner -->
  <div style="background:#07808A;padding:24px 26px;text-align:center;color:#ffffff">
    <div style="font-size:14px;letter-spacing:2px;text-transform:uppercase;opacity:0.8;margin-bottom:6px">GUEST PASS</div>
    <div style="font-size:28px;font-weight:800;line-height:1.2">Benvenuto al circolo, ${nome}! 🎉</div>
  </div>

  <!-- Guest Pass Card -->
  <div style="padding:24px 26px">
    <div style="background:linear-gradient(135deg,#07808A,#05626A);border-radius:18px;padding:24px;color:#ffffff;text-align:center;margin-bottom:24px">
      <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:0.7;margin-bottom:8px">GUEST PASS</div>
      <div style="font-size:15px;margin-bottom:4px">${nome} ${cognome}</div>
      <div style="font-size:36px;font-weight:800;margin:8px 0">2 giorni</div>
      <div style="font-size:14px;opacity:0.85">Abbonamento Premium · prova gratuita</div>
      <div style="margin-top:14px;font-size:13px;background:rgba(255,255,255,0.15);border-radius:8px;padding:8px 14px;line-height:1.4">Attivabile e utilizzabile<br><b>esclusivamente dal lunedì al giovedì</b></div>
    </div>

    <!-- 3 passi -->
    <div style="margin-bottom:24px">
      <div style="display:flex;align-items:flex-start;margin-bottom:16px">
        <div style="flex:none;width:36px;height:36px;border-radius:50%;background:#0A9BA5;color:#fff;font-weight:700;font-size:16px;line-height:36px;text-align:center;margin-right:14px">1</div>
        <div>
          <div style="font-weight:700;color:#05626A;font-size:16px">Scegli tu quando</div>
          <div style="font-size:14px;color:#6B7477;margin-top:2px">Vieni quando vuoi, dal lunedì al giovedì. Non serve prenotare.</div>
        </div>
      </div>
      <div style="display:flex;align-items:flex-start;margin-bottom:16px">
        <div style="flex:none;width:36px;height:36px;border-radius:50%;background:#0A9BA5;color:#fff;font-weight:700;font-size:16px;line-height:36px;text-align:center;margin-right:14px">2</div>
        <div>
          <div style="font-weight:700;color:#05626A;font-size:16px">Mostra questa mail</div>
          <div style="font-size:14px;color:#6B7477;margin-top:2px">In reception ti accoglieranno e ti faranno visitare il circolo.</div>
        </div>
      </div>
      <div style="display:flex;align-items:flex-start">
        <div style="flex:none;width:36px;height:36px;border-radius:50%;background:#0A9BA5;color:#fff;font-weight:700;font-size:16px;line-height:36px;text-align:center;margin-right:14px">3</div>
        <div>
          <div style="font-weight:700;color:#05626A;font-size:16px">Porta un documento d'identità</div>
          <div style="font-size:14px;color:#6B7477;margin-top:2px">Lo teniamo in reception per tutta la durata dei tuoi allenamenti.</div>
        </div>
      </div>
    </div>

    <!-- Consiglio borsa -->
    <div style="background:#F4F9F9;border-left:4px solid #72C5B5;border-radius:12px;padding:14px 16px;margin-bottom:20px;font-size:14px;color:#6B7477">
      <strong style="color:#05626A">🎒 Cosa portare:</strong> costume, cuffia, ciabatte, asciugamano e abbigliamento sportivo. Troverai armadietti e docce.
    </div>

    <p style="font-size:15px;color:#3A3A3A;line-height:1.6;text-align:center;margin:0">
      Ti aspettiamo al circolo! 💪
    </p>
  </div>

  <!-- Firma -->
  <div style="border-top:1px solid #D4E0E3;padding:16px 26px;font-size:14px;color:#14323F">
    <table><tr>
      <td style="vertical-align:middle;padding-right:14px"><img src="https://www.officinesportive.it/wp-content/uploads/2025/11/logo-officine-sportive-top.png" width="140" alt="Officine Sportive"></td>
      <td style="vertical-align:middle">Un caro saluto,<br><b style="color:#13556F">Il team di Officine Sportive</b></td>
    </tr></table>
    <div style="margin-top:10px;font-size:11.5px;letter-spacing:.5px;color:#5A707A;text-align:center">Palestra · Piscina · Spa · Padel · Centri estivi</div>
  </div>

</div>
</div>`;
}
