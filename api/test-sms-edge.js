export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const numero = url.searchParams.get('tel') || '';
  const SKEBBY_USER = process.env.SKEBBY_USER || '';
  const SKEBBY_PASS = process.env.SKEBBY_PASS || '';

  if (!numero) return new Response(JSON.stringify({ errore: 'Aggiungi ?tel=+393...' }), { headers: { 'Content-Type': 'application/json' } });
  if (!SKEBBY_USER || !SKEBBY_PASS) return new Response(JSON.stringify({ errore: 'Credenziali mancanti' }), { headers: { 'Content-Type': 'application/json' } });

  const auth = btoa(SKEBBY_USER + ':' + SKEBBY_PASS);
  const log = [];

  try {
    // Login
    const r = await fetch('https://api.skebby.it/API/v1.0/REST/login', {
      method: 'GET',
      headers: { 'Authorization': 'Basic ' + auth }
    });
    const body = await r.text();
    log.push({ step: 'login_edge', status: r.status, body: body.slice(0, 200) });

    if (r.status !== 200) {
      // Prova token
      const r2 = await fetch('https://api.skebby.it/API/v1.0/REST/token', {
        method: 'GET',
        headers: { 'Authorization': 'Basic ' + auth }
      });
      const body2 = await r2.text();
      log.push({ step: 'token_edge', status: r2.status, body: body2.slice(0, 200) });
      return new Response(JSON.stringify({ ok: false, runtime: 'edge', log }), { headers: { 'Content-Type': 'application/json' } });
    }

    const keys = body.trim().split(';');
    log.push({ step: 'login_ok', keys: keys[0] ? keys[0].slice(0, 8) + '...' : 'vuota' });

    // SMS
    const smsR = await fetch('https://api.skebby.it/API/v1.0/REST/sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'user_key': keys[0], 'Session_key': keys[1] },
      body: JSON.stringify({ message_type: 'GP', message: 'Test SMS da Vercel Edge - Officine Sportive', recipient: [numero], returnCredits: true })
    });
    const smsBody = await smsR.text();
    log.push({ step: 'sms', status: smsR.status, body: smsBody.slice(0, 200) });
    return new Response(JSON.stringify({ ok: smsR.status < 300, runtime: 'edge', log }), { headers: { 'Content-Type': 'application/json' } });

  } catch (e) {
    log.push({ step: 'errore', message: e.message });
    return new Response(JSON.stringify({ ok: false, runtime: 'edge', log }), { headers: { 'Content-Type': 'application/json' } });
  }
}
