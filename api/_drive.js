// 28/11/2026 · Copia del Drive di officinesportive3 su Jarvis (Supabase, parte privata «jarvis-file/drive/…»).
// Google elenca i file e li consegna a pezzi; Jarvis li salva e segna in «drive_file» cosa è stato copiato.
// Gira a giri di ~45 secondi (chiamato ogni minuto finché c'è da copiare). Il Drive non viene toccato.
import { db, segreto } from './_jarvis-base.js';

const URL_GM = 'https://script.google.com/macros/s/AKfycbxom9ST_8sRTWmx_Pp18hJpntQAv4rtMcgo8j48vVpgfYvzot1sAcgzpgvYI8OVu3Sn/exec';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kyricrhlqlassvhxqjgf.supabase.co';
const K = process.env.SUPABASE_SERVICE_KEY || '';
const PEZZO = 6 * 1024 * 1024, MAX = 45 * 1024 * 1024;
const SALTA = /^jarvis-codice-/;   // copie dei codici: non servono

async function google(fn, args) {
  const r = await fetch(URL_GM, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: await segreto('gm'), fn, args }), redirect: 'follow' });
  const t = await r.text(); let j;
  try { j = JSON.parse(t); } catch (e) { throw new Error('Risposta non valida da Google: ' + t.slice(0, 120)); }
  if (!j.ok) throw new Error(j.errore || 'errore Google');
  return JSON.parse(j.data);
}
async function stato() { const r = await db('/rest/v1/jarvis_stato?chiave=eq.drive&select=valore'); const x = await r.json(); return (x[0] && x[0].valore) || {}; }
async function salvaStato(v) { await db('/rest/v1/jarvis_stato', 'POST', [{ chiave: 'drive', valore: v }], { Prefer: 'resolution=merge-duplicates,return=minimal' }); }
const pulisci = s => String(s || 'file').replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';

async function copiaUno(f) {
  let parti = [], tot = null, tipo = f.mime, est = '', da = 0;
  while (tot === null || da < tot) {
    const x = await google('esportaFile', [f.drive_id, da, PEZZO]);
    if (x.salta) return { stato: 'saltato', nota: 'tipo Google non copiabile: ' + x.salta };
    tot = x.tot; tipo = x.tipo; est = x.est || '';
    if (tot > MAX) return { stato: 'troppo grande', nota: Math.round(tot / 1048576) + ' MB' };
    const b = Buffer.from(x.b64, 'base64'); parti.push(b); da += b.length;
    if (!b.length) break;
  }
  const nome = pulisci(f.nome) + (est && !f.nome.toLowerCase().endsWith(est) ? est : '');
  const path = 'drive/' + f.drive_id + '/' + nome;
  const up = await fetch(SUPABASE_URL + '/storage/v1/object/jarvis-file/' + encodeURI(path), { method: 'POST',
    headers: { apikey: K, ...(K.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + K }), 'Content-Type': tipo || 'application/octet-stream', 'x-upsert': 'true' }, body: Buffer.concat(parti) });
  if (!up.ok) throw new Error('Salvataggio ' + up.status + ': ' + (await up.text()).slice(0, 150));
  return { stato: 'copiato', path, tipo };
}

export async function driveGiro(chiave) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  const t0 = Date.now(), s = await stato(), fatto = { elencati: 0, copiati: 0, errori: 0 };
  if (s.inCorso && Date.now() - s.inCorso < 70000) return { ok: true, occupato: true };
  s.inCorso = Date.now(); await salvaStato(s);
  try {
    // 1. elenco di tutti i file (a pagine)
    while (!s.elencoFinito && Date.now() - t0 < 25000) {
      const x = await google('elencaFile', [s.token || '']);
      const righe = x.file.filter(f => !SALTA.test(f.nome)).map(f => ({ drive_id: f.id, nome: f.nome, mime: f.mime, dimensione: f.dim, modificato: new Date(f.mod).toISOString(), cartella: f.cartella }));
      if (righe.length) await db('/rest/v1/drive_file?on_conflict=drive_id', 'POST', righe, { Prefer: 'resolution=ignore-duplicates,return=minimal' });
      fatto.elencati += righe.length; s.token = x.token; if (!x.token) s.elencoFinito = Date.now();
      await salvaStato(s);
    }
    // 1b. finito l'elenco completo: ogni giro prende i file nuovi o cambiati (finché i ragazzi caricano anche su Google)
    if (s.elencoFinito && Date.now() - (s.ultimoNuovi || 0) > 9 * 60000) {
      const dopo = new Date((s.ultimoNuovi || s.elencoFinito) - 2 * 36e5).toISOString().slice(0, 19);
      let tok = '', giri = 0;
      do {
        const x = await google('elencaFile', [tok, dopo]);
        const righe = x.file.filter(f => !SALTA.test(f.nome)).map(f => ({ drive_id: f.id, nome: f.nome, mime: f.mime, dimensione: f.dim, modificato: new Date(f.mod).toISOString(), cartella: f.cartella }));
        for (const r of righe) {
          const g = await (await db('/rest/v1/drive_file?drive_id=eq.' + encodeURIComponent(r.drive_id) + '&select=modificato')).json();
          if (!g.length) { await db('/rest/v1/drive_file', 'POST', [r], { Prefer: 'return=minimal' }); fatto.elencati++; }
          else if (new Date(g[0].modificato) < new Date(r.modificato)) { await db('/rest/v1/drive_file?drive_id=eq.' + encodeURIComponent(r.drive_id), 'PATCH', { ...r, stato: 'da copiare', tentativi: 0 }, { Prefer: 'return=minimal' }); fatto.elencati++; }
        }
        tok = x.token; giri++;
      } while (tok && giri < 5 && Date.now() - t0 < 25000);
      s.ultimoNuovi = Date.now(); await salvaStato(s);
    }
    // 2. copia, i più piccoli prima
    while (Date.now() - t0 < 40000) {
      const r = await db('/rest/v1/drive_file?stato=eq.da%20copiare&tentativi=lt.3&order=dimensione.asc.nullsfirst&limit=5&select=drive_id,nome,mime,dimensione,tentativi');
      const lista = await r.json(); if (!lista.length) break;
      for (const f of lista) {
        if (Date.now() - t0 > 42000) break;
        try {
          const e = await copiaUno(f);
          await db('/rest/v1/drive_file?drive_id=eq.' + encodeURIComponent(f.drive_id), 'PATCH', { ...e, copiato_il: e.stato === 'copiato' ? new Date().toISOString() : null }, { Prefer: 'return=minimal' });
          if (e.stato === 'copiato') fatto.copiati++;
        } catch (err) {
          fatto.errori++;
          await db('/rest/v1/drive_file?drive_id=eq.' + encodeURIComponent(f.drive_id), 'PATCH', { tentativi: (f.tentativi || 0) + 1, nota: String(err && err.message || err).slice(0, 300), ...((f.tentativi || 0) >= 2 ? { stato: 'errore' } : {}) }, { Prefer: 'return=minimal' });
        }
      }
    }
  } finally { s.inCorso = 0; s.ultimoGiro = Date.now(); await salvaStato(s); }
  return { ok: true, ...fatto, elencoFinito: !!s.elencoFinito };
}

// Copia un codice di Google (es. casella info) nella parte privata di Jarvis e dice quali funzioni di posta usa.
export async function driveCodice(chiave, id, nome) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  let parti = [], tot = null, da = 0;
  while (tot === null || da < tot) { const x = await google('esportaFile', [id, da, PEZZO]); tot = x.tot; const b = Buffer.from(x.b64, 'base64'); parti.push(b); da += b.length; if (!b.length) break; }
  let testo = Buffer.concat(parti).toString('utf8');
  // progetto Google intero (script+json): il codice va insieme, le pagine HTML a parte
  if (/^\s*\{\s*"files"/.test(testo)) {
    const j = JSON.parse(testo), html = {};
    testo = j.files.filter(f => f.type === 'server_js').map(f => '/* ===== ' + f.name + ' ===== */\n' + f.source).join('\n;\n');
    j.files.filter(f => f.type === 'html').forEach(f => { html[f.name] = f.source; });
    await fetch(SUPABASE_URL + '/storage/v1/object/jarvis-file/codici/' + pulisci(nome) + '.html.json', { method: 'POST',
      headers: { apikey: K, ...(K.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + K }), 'Content-Type': 'application/json', 'x-upsert': 'true', 'cache-control': 'no-cache' }, body: JSON.stringify(html) });
  }
  const up = await fetch(SUPABASE_URL + '/storage/v1/object/jarvis-file/codici/' + pulisci(nome) + '.js', { method: 'POST',
    headers: { apikey: K, ...(K.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + K }), 'Content-Type': 'text/plain', 'x-upsert': 'true', 'cache-control': 'no-cache' }, body: testo });
  const conta = re => { const m = {}; for (const x of testo.matchAll(re)) m[x[0]] = (m[x[0]] || 0) + 1; return m; };
  const funzioni = [...testo.matchAll(/^function\s+([A-Za-z0-9_]+)/gm)].map(x => x[1]);
  return { ok: up.ok, byte: testo.length, servizi: conta(/\b(GmailApp|MailApp|SpreadsheetApp|DriveApp|UrlFetchApp|PropertiesService|CacheService|ScriptApp|FormApp|CalendarApp|HtmlService|LockService|Utilities)\.[A-Za-z]+/g),
    metodiPosta: conta(/\.(getThreads|getMessages|getMessageCount|getFirstMessageSubject|getAttachments|getPlainBody|getBody|getFrom|getTo|getCc|getReplyTo|getSubject|getDate|getId|getThreadById|getMessageById|markRead|markUnread|moveToArchive|moveToTrash|moveToInbox|addLabel|removeLabel|getLabels|reply|replyAll|forward|createDraftReply|isUnread|isInInbox|isInTrash|getLastMessageDate|getHeader|getRawContent|star|unstar|isStarred|getPermalink)\(/g),
    ricerche: [...testo.matchAll(/GmailApp\.search\(([^;\n]{0,160})/g)].map(x => x[1]).slice(0, 40),
    trigger: [...testo.matchAll(/newTrigger\('([^']+)'\)[^;\n]{0,90}/g)].map(x => x[0]), funzioni: funzioni.length, nomiFunzioni: funzioni.filter(f => !/_$/.test(f)) };
}

// Cerca dentro un codice copiato (righe che corrispondono a un'espressione), per leggerlo a pezzi.
export async function codiceCerca(chiave, nome, re, contesto, max) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/jarvis-file/codici/' + pulisci(nome) + '.js?t=' + Date.now(), { headers: { apikey: K, ...(K.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + K }) } });
  const righe = (await r.text()).split('\n'), rx = new RegExp(re), out = []; contesto = contesto || 0;
  for (let i = 0; i < righe.length && out.length < (max || 60); i++) if (rx.test(righe[i])) out.push((i + 1) + ': ' + righe.slice(Math.max(0, i - contesto), i + contesto + 1).join('\n').slice(0, 1500));
  return { righe: righe.length, trovate: out };
}

// Le impostazioni interne (proprietà) di un progetto Google arrivano qui ogni ora, finché il progetto gira su Google.
export async function gasRiceviProp(k, app, props) {
  if (!k || k !== await segreto('ricevi-prop') || !/^[a-z-]+$/.test(String(app)) || !props || typeof props !== 'object') return { ok: false };
  const righe = Object.keys(props).filter(c => c !== 'JARVIS_PROP_ULTIMO').map(c => ({ app, chiave: c, valore: String(props[c]) }));
  await db('/rest/v1/gas_proprieta?app=eq.' + encodeURIComponent(app), 'DELETE', null, { Prefer: 'return=minimal' });
  for (let i = 0; i < righe.length; i += 200) await db('/rest/v1/gas_proprieta', 'POST', righe.slice(i, i + 200), { Prefer: 'return=minimal' });
  return { ok: true, proprieta: righe.length };
}

// Aggiunge al codice di Google (copiato su Jarvis) il pezzo che manda le proprietà a Jarvis, e lo rimette nel Drive dei codici.
export async function codiceAggancia(chiave, nome, app, funzione, archivio) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  const r = await fetch(SUPABASE_URL + '/storage/v1/object/jarvis-file/codici/' + pulisci(nome) + '.js?t=' + Date.now(), { headers: { apikey: K, ...(K.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + K }) } });
  let testo = await r.text();
  testo = testo.replace(/\n\/\* JARVIS · AGGANCIO PROPRIETÀ[\s\S]*$/, '');
  testo += `
/* JARVIS · AGGANCIO PROPRIETÀ (28/11/2026): ogni ora le proprietà di questo progetto vanno anche su Jarvis, per il passaggio. */
function jarvisEsportaProp_() {
  if (String(ScriptApp.getScriptId()).indexOf('jarvis-') === 0) return;
  var p = PropertiesService.getScriptProperties();
  if (Date.now() - Number(p.getProperty('JARVIS_PROP_ULTIMO') || 0) < 3600000) return;
  p.setProperty('JARVIS_PROP_ULTIMO', String(Date.now()));
  UrlFetchApp.fetch('https://officine-sportive.vercel.app/api/jarvis', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ fn: 'gasRiceviProp', args: [${JSON.stringify(await segreto('ricevi-prop'))}, ${JSON.stringify(app)}, p.getProperties()] }) });
}
${archivio ? `
/* JARVIS · STORICO (28/11/2026): copia una volta tutte le mail di questa casella nell'archivio di Jarvis, già gestite (niente risposte, niente sequenze). */
function jarvisEsportaArchivio_() {
  if (String(ScriptApp.getScriptId()).indexOf('jarvis-') === 0) return;
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty('JARVIS_ARCH_FINITO')) return;
  var t0 = Date.now(), start = Number(p.getProperty('JARVIS_ARCH_START') || 0);
  while (Date.now() - t0 < 100000) {
    var th = GmailApp.search('in:anywhere -in:trash -in:spam', start, 8);
    if (!th.length) { p.setProperty('JARVIS_ARCH_FINITO', String(Date.now())); return; }
    var lista = [], totB = 0;
    th.forEach(function (t) {
      var et = t.getLabels().map(function (l) { return l.getName(); }), inb = t.isInInbox();
      t.getMessages().forEach(function (m) {
        var all = [];
        m.getAttachments().forEach(function (a) { var b = a.getBytes(); if (totB + b.length < 2200000) { totB += b.length; all.push({ nome: a.getName(), tipo: a.getContentType(), b64: Utilities.base64Encode(b) }); } else all.push({ nome: a.getName(), tipo: a.getContentType(), saltato: b.length }); });
        lista.push({ id: m.getId(), thread: t.getId(), mid: String(m.getHeader('Message-ID') || ''), da: m.getFrom(), a: m.getTo(), cc: m.getCc(), rt: m.getReplyTo(), ogg: m.getSubject(), data: m.getDate().getTime(),
          testo: String(m.getPlainBody() || '').slice(0, 100000), et: et, inbox: inb, allegati: all });
      });
    });
    UrlFetchApp.fetch('https://officine-sportive.vercel.app/api/jarvis', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ fn: 'infoArchivio', args: [${JSON.stringify(await segreto('ricevi-prop'))}, lista] }) });
    start += th.length; p.setProperty('JARVIS_ARCH_START', String(start));
  }
}` : ''}
var jarvisGiroOriginale_ = ${funzione};
${funzione} = function () { try { jarvisEsportaProp_(); } catch (e) { } var r = jarvisGiroOriginale_.apply(this, arguments);${archivio ? ' try { jarvisEsportaArchivio_(); } catch (e) { }' : ''} return r; };
`;
  const x = await google('scriviCodice', ['jarvis-codice-' + pulisci(nome) + '.js', testo]);
  return { ok: true, ...x };
}

// Corregge un pezzo del codice copiato (deve comparire una volta sola). Dopo, codiceAggancia lo rimette su Google.
export async function codicePatch(chiave, nome, vecchio, nuovo) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  const url = SUPABASE_URL + '/storage/v1/object/jarvis-file/codici/' + pulisci(nome) + '.js', h = { apikey: K, ...(K.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + K }) };
  const testo = await (await fetch(url + '?t=' + Date.now(), { headers: h })).text();
  const n = testo.split(vecchio).length - 1;
  if (n !== 1) return { ok: false, trovate: n };
  const up = await fetch(url, { method: 'POST', headers: { ...h, 'Content-Type': 'text/plain', 'x-upsert': 'true', 'cache-control': 'no-cache' }, body: testo.replace(vecchio, nuovo) });
  return { ok: up.ok };
}
