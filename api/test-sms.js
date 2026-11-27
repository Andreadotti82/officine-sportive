const SKEBBY_USER = process.env.SKEBBY_USER || '';
const SKEBBY_PASS = process.env.SKEBBY_PASS || '';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ errore: 'GET only' });

  const numero = req.query.tel || '';
  if (!numero) return res.status(400).json({ errore: 'Aggiungi ?tel=+393...' });
  if (!SKEBBY_USER || !SKEBBY_PASS) return res.status(500).json({ errore: 'SKEBBY_USER o SKEBBY_PASS mancanti', user: !!SKEBBY_USER, pass: !!SKEBBY_PASS });

  const auth = Buffer.from(SKEBBY_USER + ':' + SKEBBY_PASS).toString('base64');
  const log = [];

  // Test 1: login
  try {
    const r = await fetch('https://api.skebby.it/API/v1.0/REST/login', {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + auth,
        'User-Agent': 'OfficineSportive/1.0',
        'Accept': 'application/json, text/plain, */*'
      }
    });
    const body = await r.text();
    log.push({ step: 'login', status: r.status, body: body.slice(0, 200) });

    if (r.status !== 200) {
      // Prova anche con /token
      const r2 = await fetch('https://api.skebby.it/API/v1.0/REST/token', {
        method: 'GET',
        headers: {
          'Authorization': 'Basic ' + auth,
          'User-Agent': 'OfficineSportive/1.0',
          'Accept': '*/*'
        }
      });
      const body2 = await r2.text();
      log.push({ step: 'token', status: r2.status, body: body2.slice(0, 200) });

      if (r2.status !== 200) {
        // Prova senza User-Agent
        const r3 = await fetch('https://api.skebby.it/API/v1.0/REST/login', {
          method: 'GET',
          headers: { 'Authorization': 'Basic ' + auth }
        });
        const body3 = await r3.text();
        log.push({ step: 'login_no_ua', status: r3.status, body: body3.slice(0, 200) });

        // Prova con Content-Type
        const r4 = await fetch('https://api.skebby.it/API/v1.0/REST/login', {
          method: 'GET',
          headers: {
            'Authorization': 'Basic ' + auth,
            'Content-Type': 'application/json'
          }
        });
        const body4 = await r4.text();
        log.push({ step: 'login_ct', status: r4.status, body: body4.slice(0, 200) });

        return res.status(200).json({ ok: false, errore: 'Login Skebby fallito in tutti i modi', log });
      }
      // Token funziona
      const keys2 = body2.trim().split(';');
      log.push({ step: 'token_ok', user_key: keys2[0] ? keys2[0].slice(0, 8) + '...' : 'vuota' });

      // Invio SMS con access_token
      const smsR = await fetch('https://api.skebby.it/API/v1.0/REST/sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'user_key': keys2[0], 'Access_token': keys2[1],
          'User-Agent': 'OfficineSportive/1.0'
        },
        body: JSON.stringify({ message_type: 'GP', message: 'Test SMS da Officine Sportive Vercel', recipient: [numero], returnCredits: true })
      });
      const smsBody = await smsR.text();
      log.push({ step: 'sms_token', status: smsR.status, body: smsBody.slice(0, 200) });
      return res.status(200).json({ ok: smsR.status < 300, log });
    }

    // Login funziona
    const keys = body.trim().split(';');
    log.push({ step: 'login_ok', user_key: keys[0] ? keys[0].slice(0, 8) + '...' : 'vuota' });

    // Invio SMS
    const smsR = await fetch('https://api.skebby.it/API/v1.0/REST/sms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user_key': keys[0], 'Session_key': keys[1],
        'User-Agent': 'OfficineSportive/1.0'
      },
      body: JSON.stringify({ message_type: 'GP', message: 'Test SMS da Officine Sportive Vercel', recipient: [numero], returnCredits: true })
    });
    const smsBody = await smsR.text();
    log.push({ step: 'sms', status: smsR.status, body: smsBody.slice(0, 200) });
    return res.status(200).json({ ok: smsR.status < 300, log });

  } catch (e) {
    log.push({ step: 'errore', message: e.message });
    return res.status(200).json({ ok: false, log });
  }
}
