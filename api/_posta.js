// 28/11/2026 · Jarvis legge la casella info@ (Register, IMAP) e tiene le mail nel suo archivio «info_mail».
// La casella su Register non viene toccata (solo lettura, BODY.PEEK): etichette, archivio e cestino valgono su Jarvis.
import tls from 'node:tls';
import crypto from 'node:crypto';
import { db, segreto } from './_jarvis-base.js';

const HOST = process.env.INFO_MAIL_IMAP || 'pop.securemail.pro';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kyricrhlqlassvhxqjgf.supabase.co';
const K = process.env.SUPABASE_SERVICE_KEY || '';

// ---------- IMAP a byte (i messaggi possono contenere 8bit) ----------
function apri(host = HOST, port = 993, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: host, timeout: timeoutMs });
    let buf = Buffer.alloc(0), attesa = null, n = 0, pronto = false;
    const fine = e => { try { sock.destroy(); } catch (_) { } if (!pronto) reject(e); else if (attesa) { const a = attesa; attesa = null; a.ko(e); } };
    sock.on('timeout', () => fine(new Error('timeout IMAP')));
    sock.on('error', fine);
    sock.on('data', d => {
      buf = Buffer.concat([buf, d]);
      if (!pronto) {
        if (/^\* (OK|PREAUTH)/m.test(buf.toString('latin1'))) {
          pronto = true; buf = Buffer.alloc(0);
          resolve({
            cmd(c) { return new Promise((ok, ko) => { const tag = 'J' + (++n); attesa = { tag, ok, ko }; sock.write(tag + ' ' + c + '\r\n'); }); },
            chiudi() { try { sock.write('Z LOGOUT\r\n'); sock.end(); } catch (_) { } }
          });
        }
        return;
      }
      if (!attesa) return;
      const fineRisp = trovaFine(buf, attesa.tag);
      if (fineRisp) { const a = attesa; attesa = null; const tutto = buf.subarray(0, fineRisp.fine); buf = buf.subarray(fineRisp.fine); a.ok({ stato: fineRisp.stato, riga: fineRisp.riga, dati: tutto }); }
    });
  });
}
// Trova la riga taggata finale saltando i letterali {n}
function trovaFine(buf, tag) {
  let i = 0;
  while (i < buf.length) {
    const nl = buf.indexOf('\r\n', i); if (nl < 0) return null;
    const riga = buf.subarray(i, nl).toString('latin1');
    const lit = riga.match(/\{(\d+)\}$/);
    if (lit) { i = nl + 2 + Number(lit[1]); if (i > buf.length) return null; continue; }
    if (riga.startsWith(tag + ' ')) { const m = riga.slice(tag.length + 1).match(/^(OK|NO|BAD)\s*(.*)$/); return { fine: nl + 2, stato: m ? m[1] : 'BAD', riga: m ? m[2] : riga }; }
    i = nl + 2;
  }
  return null;
}
const q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
async function accedi() {
  const user = String(process.env.INFO_MAIL_USER || '').trim().replace(/\.+$/, ''), pass = String(process.env.INFO_MAIL_PASS || '').replace(/[\r\n]+$/, '');
  if (!user || !pass) throw new Error('Credenziali info@ mancanti');
  const s = await apri();
  const l = await s.cmd('LOGIN ' + q(user) + ' ' + q(pass));
  if (l.stato !== 'OK') { s.chiudi(); throw new Error('Login info@ rifiutato: ' + l.riga.slice(0, 80)); }
  return s;
}
// Estrae i letterali {n} di una risposta FETCH, legandoli all'UID
function letterali(dati) {
  const out = []; let i = 0;
  while (i < dati.length) {
    const nl = dati.indexOf('\r\n', i); if (nl < 0) break;
    const riga = dati.subarray(i, nl).toString('latin1');
    const lit = riga.match(/\{(\d+)\}$/);
    if (lit) { const uid = (riga.match(/UID (\d+)/) || [])[1]; const n = Number(lit[1]); out.push({ uid: Number(uid), byte: dati.subarray(nl + 2, nl + 2 + n) }); i = nl + 2 + n; continue; }
    i = nl + 2;
  }
  return out;
}

// ---------- MIME ----------
function decodificaCharset(buf, cs) {
  cs = String(cs || 'utf-8').toLowerCase().replace(/^"|"$/g, '');
  if (cs === 'us-ascii' || cs === 'ascii') cs = 'utf-8';
  try { return new TextDecoder(cs).decode(buf); } catch (e) { return buf.toString('latin1'); }
}
function qp(s) { // quoted-printable → bytes
  const t = s.replace(/=\r?\n/g, ''); const out = [];
  for (let i = 0; i < t.length; i++) { if (t[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(t.substr(i + 1, 2))) { out.push(parseInt(t.substr(i + 1, 2), 16)); i += 2; } else out.push(t.charCodeAt(i) & 255); }
  return Buffer.from(out);
}
function parolaCodificata(s) { // =?utf-8?B?...?= e =?utf-8?Q?...?=
  return String(s || '').replace(/\?=\s+=\?/g, '?==?').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (m, cs, e, t) => {
    try { const b = /b/i.test(e) ? Buffer.from(t, 'base64') : qp(t.replace(/_/g, ' ')); return decodificaCharset(b, cs); } catch (x) { return m; }
  });
}
function intestazioni(testo) {
  const h = {}, righe = testo.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/);
  for (const r of righe) { const i = r.indexOf(':'); if (i < 1) continue; const k = r.slice(0, i).trim().toLowerCase(), v = r.slice(i + 1).trim(); h[k] = h[k] ? h[k] + ', ' + v : v; }
  return h;
}
function param(v, nome) { const m = String(v || '').match(new RegExp(nome + '\\*?=(?:"([^"]*)"|([^;\\s]*))', 'i')); if (!m) return ''; let x = m[1] != null ? m[1] : m[2]; if (/^[\w-]+''/.test(x)) { try { x = decodeURIComponent(x.replace(/^[\w-]+''/, '')); } catch (e) { } } return parolaCodificata(x); }
function parte(buf, acc) {
  const sep = buf.indexOf('\r\n\r\n'), sep2 = buf.indexOf('\n\n');
  let fineH, inizioC;
  if (sep >= 0 && (sep2 < 0 || sep <= sep2)) { fineH = sep; inizioC = sep + 4; } else if (sep2 >= 0) { fineH = sep2; inizioC = sep2 + 2; } else { fineH = buf.length; inizioC = buf.length; }
  const hb = buf.subarray(0, fineH), hu = hb.toString('utf8');
  const h = intestazioni(hu.includes('\ufffd') ? hb.toString('latin1') : hu);
  const corpo = buf.subarray(inizioC);
  const ct = h['content-type'] || 'text/plain', tipo = ct.split(';')[0].trim().toLowerCase();
  if (!acc.h) acc.h = h;
  if (tipo.startsWith('multipart/')) {
    const b = param(ct, 'boundary'); if (!b) return;
    const s = corpo.toString('latin1'), delim = '--' + b; let pos = s.indexOf(delim);
    while (pos >= 0) {
      const start = s.indexOf('\n', pos) + 1; if (!start) break;
      const nxt = s.indexOf(delim, start); if (nxt < 0) break;
      let fine = nxt; if (s[fine - 1] === '\n') fine--; if (s[fine - 1] === '\r') fine--;
      parte(corpo.subarray(start, fine), acc);
      if (s.substr(nxt + delim.length, 2) === '--') break;
      pos = nxt;
    }
    return;
  }
  const cte = String(h['content-transfer-encoding'] || '').toLowerCase().trim();
  let dati = cte === 'base64' ? Buffer.from(corpo.toString('latin1').replace(/\s+/g, ''), 'base64') : cte === 'quoted-printable' ? qp(corpo.toString('latin1')) : corpo;
  const disp = h['content-disposition'] || '', nomeFile = param(disp, 'filename') || param(ct, 'name');
  if (tipo === 'message/rfc822' && !nomeFile) { acc.allegati.push({ nome: 'messaggio.eml', tipo, dati }); return; }
  if (nomeFile || /^attachment/i.test(disp) || (!tipo.startsWith('text/') && tipo !== 'message/delivery-status')) {
    acc.allegati.push({ nome: nomeFile || ('allegato.' + (tipo.split('/')[1] || 'bin')), tipo, dati, cid: String(h['content-id'] || '').replace(/[<>]/g, '') }); return;
  }
  const testo = decodificaCharset(dati, param(ct, 'charset'));
  if (tipo === 'text/html') { if (!acc.html) acc.html = testo; } else if (!acc.testo) acc.testo = testo;
}
export function leggiMessaggio(raw) {
  const acc = { allegati: [], testo: '', html: '' }; parte(raw, acc);
  const h = acc.h || {};
  if (!acc.testo && acc.html) acc.testo = acc.html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n').trim();
  return { h, testo: acc.testo, html: acc.html, allegati: acc.allegati };
}
const pulisciNome = s => String(s || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 100) || 'file';
const idDa = s => 'im' + crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 22);

// ---------- Lettura: porta su Jarvis le mail nuove degli ultimi giorni ----------
export async function infoLeggi(chiave, giorni) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  const t0 = Date.now(), s = await accedi(); let nuove = 0;
  try {
    await s.cmd('EXAMINE INBOX');
    const dal = new Date(Date.now() - (giorni || 4) * 864e5), mesi = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const r = await s.cmd('UID SEARCH SINCE ' + dal.getUTCDate() + '-' + mesi[dal.getUTCMonth()] + '-' + dal.getUTCFullYear());
    const uids = ((r.dati.toString('latin1').match(/^\* SEARCH([\d ]*)/m) || [])[1] || '').trim().split(/\s+/).filter(Boolean).map(Number);
    if (!uids.length) return { ok: true, nuove: 0 };
    const gia = await (await db('/rest/v1/info_mail?cartella=eq.INBOX&uid=in.(' + uids.join(',') + ')&select=uid')).json();
    const visti = new Set((gia || []).map(x => Number(x.uid)));
    const daLeggere = uids.filter(u => !visti.has(u)).sort((a, b) => a - b);
    for (let i = 0; i < daLeggere.length && Date.now() - t0 < 40000; i += 5) {
      const pezzo = daLeggere.slice(i, i + 5);
      const f = await s.cmd('UID FETCH ' + pezzo.join(',') + ' (UID BODY.PEEK[])');
      for (const { uid, byte } of letterali(f.dati)) {
        if (!uid) continue;
        const m = leggiMessaggio(byte), h = m.h;
        const mid = String(h['message-id'] || '').replace(/[<>\s]/g, '') || ('uid' + uid + '@info');
        const refs = String(h['references'] || '').match(/<[^>]+>/g) || [], irt = String(h['in-reply-to'] || '').match(/<[^>]+>/);
        const radice = (refs[0] || (irt && irt[0]) || mid).replace(/[<>]/g, '');
        const id = idDa('INBOX:' + uid + ':' + mid), allegati = [];
        for (const [j, a] of m.allegati.entries()) {
          const path = 'info/' + id + '/' + j + '-' + pulisciNome(a.nome);
          const up = await fetch(SUPABASE_URL + '/storage/v1/object/jarvis-file/' + encodeURI(path), { method: 'POST', headers: { apikey: K, ...(K.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + K }), 'Content-Type': a.tipo || 'application/octet-stream', 'x-upsert': 'true' }, body: a.dati });
          if (up.ok) allegati.push({ nome: a.nome, tipo: a.tipo, path, dim: a.dati.length, cid: a.cid || undefined });
        }
        const data = new Date(h['date'] || Date.now());
        const riga = { id, uid, cartella: 'INBOX', message_id: mid, thread_id: idDa('T:' + radice), da: parolaCodificata(h['from'] || ''), a: parolaCodificata(h['to'] || ''), cc: parolaCodificata(h['cc'] || ''), reply_to: parolaCodificata(h['reply-to'] || ''),
          oggetto: parolaCodificata(h['subject'] || ''), data: isNaN(data) ? new Date().toISOString() : data.toISOString(), testo: (m.testo || '').slice(0, 200000), html: (m.html || '').slice(0, 400000),
          intestazioni: { 'message-id': mid, 'in-reply-to': irt ? irt[0] : '', references: refs.join(' '), 'list-unsubscribe': h['list-unsubscribe'] || '', 'auto-submitted': h['auto-submitted'] || '', 'x-original-to': h['x-original-to'] || '', 'delivered-to': h['delivered-to'] || '' }, allegati };
        const w = await db('/rest/v1/info_mail?on_conflict=id', 'POST', [riga], { Prefer: 'resolution=ignore-duplicates,return=minimal' });
        if (w.ok) nuove++;
      }
    }
    return { ok: true, nuove, inAttesa: daLeggere.length - nuove };
  } finally { s.chiudi(); }
}

// Storico della vecchia casella Gmail (officneinfo): arriva una volta sola, già gestito (fuori dalla posta in arrivo, letto).
export async function infoArchivio(k, lista) {
  if (!k || k !== await segreto('ricevi-prop') || !Array.isArray(lista)) return { ok: false };
  const mids = lista.map(m => String(m.mid || '').replace(/[<>\s]/g, '')).filter(Boolean);
  const gia = mids.length ? await (await db('/rest/v1/info_mail?message_id=in.(' + mids.map(x => '"' + x.replace(/"/g, '') + '"').join(',') + ')&select=message_id')).json() : [];
  const visti = new Set((gia || []).map(x => x.message_id)); let n = 0;
  for (const m of lista) {
    const mid = String(m.mid || '').replace(/[<>\s]/g, '') || ('gmail-' + m.id);
    if (visti.has(mid)) continue;
    const id = String(m.id).replace(/[^\w-]/g, ''), allegati = [];   // stesso ID di Gmail: le pratiche aperte che lo citano lo ritrovano
    for (const [j, a] of (m.allegati || []).entries()) {
      if (!a.b64) { allegati.push({ nome: a.nome, tipo: a.tipo, nonCopiato: a.saltato || true }); continue; }
      const path = 'info/' + id + '/' + j + '-' + pulisciNome(a.nome), dati = Buffer.from(a.b64, 'base64');
      const up = await fetch(SUPABASE_URL + '/storage/v1/object/jarvis-file/' + encodeURI(path), { method: 'POST', headers: { apikey: K, ...(K.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + K }), 'Content-Type': a.tipo || 'application/octet-stream', 'x-upsert': 'true' }, body: dati });
      if (up.ok) allegati.push({ nome: a.nome, tipo: a.tipo, path, dim: dati.length });
    }
    const riga = { id, uid: null, cartella: 'GMAIL', message_id: mid, thread_id: String(m.thread).replace(/[^\w-]/g, ''), da: m.da || '', a: m.a || '', cc: m.cc || '', reply_to: m.rt || '', oggetto: m.ogg || '',
      data: new Date(Number(m.data) || Date.now()).toISOString(), testo: String(m.testo || ''), html: '', intestazioni: { 'message-id': mid, storico: 'officneinfo' }, allegati,
      etichette: (m.et || []).concat('Storico Gmail'), in_inbox: false, cestino: false, letto: true };
    const w = await db('/rest/v1/info_mail?on_conflict=id', 'POST', [riga], { Prefer: 'resolution=ignore-duplicates,return=minimal' });
    if (w.ok) { n++; visti.add(mid); }
  }
  return { ok: true, salvate: n };
}
