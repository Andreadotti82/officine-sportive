const SKEBBY_USER = process.env.SKEBBY_USER || '';
const SKEBBY_PASS = process.env.SKEBBY_PASS || '';

let _https = null;
async function getHttps() { if (!_https) _https = await import('node:https'); return _https.default; }
function httpsReq(options, body) {
  return getHttps().then(https => new Promise((resolve, reject) => {
    const r = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, http: res.httpVersion }));
    });
    r.on('error', reject);
    r.setTimeout(10000, () => { r.destroy(); reject(new Error('timeout')); });
    if (body) r.write(body);
    r.end();
  }));
}

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

        // Ultimo tentativo: node:https puro (HTTP/1.1 forzato)
        try {
          const h1 = await httpsReq({
            hostname: 'api.skebby.it', path: '/API/v1.0/REST/login', method: 'GET',
            headers: { 'Authorization': 'Basic ' + auth }
          });
          log.push({ step: 'https_h1_login', status: h1.status, http: h1.http, body: h1.body.slice(0, 200) });
          if (h1.status === 200) {
            const k = h1.body.trim().split(';');
            const sb = JSON.stringify({ message_type: 'GP', message: 'Test HTTP/1.1 Officine Sportive', recipient: [numero], returnCredits: true });
            const h2 = await httpsReq({
              hostname: 'api.skebby.it', path: '/API/v1.0/REST/sms', method: 'POST',
              headers: { 'Content-Type': 'application/json', 'user_key': k[0], 'Session_key': k[1], 'Content-Length': Buffer.byteLength(sb) }
            }, sb);
            log.push({ step: 'https_h1_sms', status: h2.status, body: h2.body.slice(0, 200) });
            return res.status(200).json({ ok: h2.status < 300, log });
          }
        } catch (e) { log.push({ step: 'https_h1_errore', msg: e.message }); }

        return res.status(200).json({ ok: false, errore: 'Login Skebby fallito con fetch e https', log });
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
