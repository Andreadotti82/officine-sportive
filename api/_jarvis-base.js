// Pezzi comuni di Jarvis: database (chiave segreta, solo server), mail (Resend), segreti e firme dei link.
import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kyricrhlqlassvhxqjgf.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const RESEND_KEY = process.env.RESEND_API_KEY || '';

export async function db(path, method, body, extraHeaders) {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_KEY non configurata');
  method = method || 'GET';
  const auth = SERVICE_KEY.startsWith('sb_') ? {} : { Authorization: `Bearer ${SERVICE_KEY}` };
  const opts = { method, headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY, ...auth, ...(extraHeaders || {}) } };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const r = await fetch(`${SUPABASE_URL}${path}`, opts);
  if (!r.ok) console.error('[DB] ' + method + ' ' + path.split('?')[0] + ' -> ' + r.status + ' ' + (await r.clone().text()).slice(0, 200));
  return r;
}

export async function inviaMail(to, subject, html, mittente, opz = {}) {
  if (!RESEND_KEY) throw new Error('RESEND_API_KEY non configurata');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: (mittente || 'Officine Sportive') + ' <info@officinesportive.it>', to: Array.isArray(to) ? to : [to], subject, html,
      ...(opz.cc ? { cc: Array.isArray(opz.cc) ? opz.cc : [opz.cc] } : {}), ...(opz.allegati ? { attachments: opz.allegati } : {}) })
  });
  if (!r.ok) throw new Error('Resend ' + r.status + ': ' + (await r.text()).slice(0, 200));
}

export const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const cacheSegreti = {};
export async function segreto(nome) {
  if (cacheSegreti[nome]) return cacheSegreti[nome];
  const r = await db(`/rest/v1/jarvis_segreti?nome=eq.${encodeURIComponent(nome)}&select=valore`);
  const x = await r.json();
  const v = Array.isArray(x) && x[0] ? x[0].valore : '';
  if (v) cacheSegreti[nome] = v;
  return v;
}

export async function firma(testo) {
  const k = await segreto('giro');
  if (!k) throw new Error('Chiave mancante');
  return crypto.createHmac('sha256', k).update(String(testo)).digest('hex').slice(0, 24);
}
