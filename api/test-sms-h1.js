import https from 'node:https';

function req(options, body) {
  return new Promise((resolve, reject) => {
    const r = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data, http: res.httpVersion }));
    });
    r.on('error', reject);
    r.setTimeout(10000, () => { r.destroy(); reject(new Error('timeout')); });
    if (body) r.write(body);
    r.end();
  });
}

export default async function handler(request, response) {
  const tel = request.query.tel || '';
  const user = process.env.SKEBBY_USER || '';
  const pass = process.env.SKEBBY_PASS || '';

  if (!tel) return response.status(400).json({ errore: '?tel=+393...' });
  if (!user || !pass) return response.status(500).json({ errore: 'credenziali mancanti' });

  const auth = Buffer.from(user + ':' + pass).toString('base64');
  const log = [];

  try {
    // Login via node:https (forza HTTP/1.1)
    const r1 = await req({
      hostname: 'api.skebby.it',
      path: '/API/v1.0/REST/login',
      method: 'GET',
      headers: { 'Authorization': 'Basic ' + auth }
    });
    log.push({ step: 'https_login', status: r1.status, http: r1.http, body: r1.body.slice(0, 200) });

    if (r1.status === 200) {
      const keys = r1.body.trim().split(';');
      const smsBody = JSON.stringify({ message_type: 'GP', message: 'Test HTTP/1.1 Officine Sportive', recipient: [tel], returnCredits: true });
      const r2 = await req({
        hostname: 'api.skebby.it',
        path: '/API/v1.0/REST/sms',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'user_key': keys[0], 'Session_key': keys[1], 'Content-Length': Buffer.byteLength(smsBody) }
      }, smsBody);
      log.push({ step: 'https_sms', status: r2.status, body: r2.body.slice(0, 200) });
      return response.json({ ok: r2.status < 300, runtime: 'node_https_h1', log });
    }

    return response.json({ ok: false, runtime: 'node_https_h1', log });
  } catch (e) {
    log.push({ step: 'errore', msg: e.message });
    return response.json({ ok: false, runtime: 'node_https_h1', log });
  }
}
