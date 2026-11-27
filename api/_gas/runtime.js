// Motore di Jarvis per i codici nati su Google Apps Script: li esegue così come sono,
// con i fogli, le proprietà, la cache, i file e le mail su Jarvis (Supabase + Resend).
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fetchSync } from './sync.js';
import { creaUtilities, Blob, aBuffer, formatDate } from './utilita.js';
import { Spreadsheet, daDb, perDb } from './fogli.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kyricrhlqlassvhxqjgf.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_KEY || '';
const RESEND = process.env.RESEND_API_KEY || '';
const TZ = 'Europe/Rome';
const BASE = 'https://officine-sportive.vercel.app';

function intestazioni(extra) { return { apikey: KEY, ...(KEY.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + KEY }), 'Content-Type': 'application/json', ...(extra || {}) }; }
function dbSync(pathq, method, body, extra) {
  const r = fetchSync(SUPABASE_URL + pathq, { method: method || 'GET', headers: intestazioni(extra), body: body === undefined ? undefined : JSON.stringify(body) });
  const t = r.body.toString('utf8');
  if (r.status >= 300) throw new Error('Database: ' + r.status + ' ' + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
}
async function dbAsync(pathq, method, body, extra) {
  const r = await fetch(SUPABASE_URL + pathq, { method: method || 'GET', headers: intestazioni(extra), body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) throw new Error('Database: ' + r.status + ' ' + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
}
const enc = encodeURIComponent;

// Modelli HTML di Google (<?= ?>, <?!= ?>, <? ?>)
function compilaModello(testo) {
  let codice = 'var __o="";', i = 0;
  const re = /<\?(!?=)?([\s\S]*?)\?>/g; let m;
  while ((m = re.exec(testo))) {
    codice += '__o+=' + JSON.stringify(testo.slice(i, m.index)) + ';';
    if (m[1] === '=') codice += '__o+=__esc(' + m[2] + ');';
    else if (m[1] === '!=') codice += '__o+=__str(' + m[2] + ');';
    else codice += m[2] + '\n';
    i = re.lastIndex;
  }
  codice += '__o+=' + JSON.stringify(testo.slice(i)) + ';return __o;';
  return codice;
}
const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class HtmlOutput {
  constructor(html) { this._h = html || ''; this._t = ''; }
  getContent() { return this._h; } setContent(h) { this._h = h; return this; } append(h) { this._h += h; return this; } appendUntrusted(h) { this._h += escHtml(h); return this; }
  setTitle(t) { this._t = t; return this; } getTitle() { return this._t; }
  addMetaTag() { return this; } setXFrameOptionsMode() { return this; } setSandboxMode() { return this; } setFaviconUrl() { return this; } setWidth() { return this; } setHeight() { return this; }
  getBlob() { return new Blob(this._h, 'text/html'); } getAs(t) { return this.getBlob().getAs(t); }
}
class TextOutput {
  constructor(t) { this._t = t || ''; this._m = 'text/plain'; }
  getContent() { return this._t; } setContent(t) { this._t = t; return this; } append(t) { this._t += t; return this; }
  setMimeType(m) { this._m = m; return this; } getMimeType() { return this._m; } downloadAsFile() { return this; }
}

// L'ambiente di un'esecuzione: tutto quello che il codice di Google si aspetta di trovare
export function creaAmbiente(app) {
  const stato = { fogli: {}, _fogliSporchi: new Set(), proprieta: null, propSporche: new Set(), propCancellate: new Set(), cache: {}, cacheScritta: {}, mail: [], fileNuovi: [], lockPreso: false, log: [] };
  stato.formatDate = formatDate;
  const app2 = app;

  function apriFoglio(id) {
    if (stato.fogli[id]) return stato.fogli[id];
    const righe = dbSync('/rest/v1/gas_fogli?foglio=eq.' + enc(id) + '&select=scheda,ordine,bloccate,nascosta,valori&order=ordine');
    if (!righe.length) throw new Error('Foglio non trovato su Jarvis: ' + id);
    const schede = righe.map(r => ({ nome: r.scheda, bloccate: r.bloccate, nascosta: r.nascosta, valori: (r.valori || []).map(riga => (riga || []).map(daDb)) }));
    const ss = new Spreadsheet(stato, id, (app2.nomiFogli || {})[id] || id, schede);
    stato.fogli[id] = ss; return ss;
  }
  const SpreadsheetApp = {
    openById: id => apriFoglio(id),
    openByUrl: u => apriFoglio(String(u).match(/\/d\/([\w-]+)/)[1]),
    getActive: () => app2.foglioAttivo ? apriFoglio(app2.foglioAttivo) : null,
    getActiveSpreadsheet: () => app2.foglioAttivo ? apriFoglio(app2.foglioAttivo) : null,
    create: nome => { const id = 'jv-' + crypto.randomUUID(); const ss = new Spreadsheet(stato, id, nome, [{ nome: 'Foglio1', valori: [], bloccate: 0, nascosta: false }]); stato.fogli[id] = ss; ss._sporca('Foglio1'); return ss; },
    flush: () => { }, getUi: () => { throw new Error('Su Jarvis non c\'è il menu del foglio'); },
    newConditionalFormatRule: () => { const b = new Proxy({}, { get: (t, n) => n === 'build' ? () => ({}) : () => b }); return b; },
    newDataValidation: () => { const b = new Proxy({}, { get: (t, n) => n === 'build' ? () => ({}) : () => b }); return b; },
    BorderStyle: {}, WrapStrategy: {}, DataValidationCriteria: {}
  };

  function props() {
    if (!stato.proprieta) { stato.proprieta = {}; dbSync('/rest/v1/gas_proprieta?app=eq.' + enc(app2.nome) + '&select=chiave,valore').forEach(r => { stato.proprieta[r.chiave] = r.valore; }); }
    return stato.proprieta;
  }
  const P = {
    getProperty: k => { const v = props()[k]; return v === undefined ? null : v; },
    setProperty: (k, v) => { props()[k] = String(v); stato.propSporche.add(k); stato.propCancellate.delete(k); return P; },
    deleteProperty: k => { delete props()[k]; stato.propCancellate.add(k); stato.propSporche.delete(k); return P; },
    getProperties: () => ({ ...props() }), getKeys: () => Object.keys(props()),
    setProperties: (o, cancellaAltre) => { if (cancellaAltre) Object.keys(props()).forEach(k => P.deleteProperty(k)); Object.keys(o).forEach(k => P.setProperty(k, o[k])); return P; },
    deleteAllProperties: () => { Object.keys(props()).forEach(k => P.deleteProperty(k)); return P; }
  };
  const PropertiesService = { getScriptProperties: () => P, getUserProperties: () => P, getDocumentProperties: () => P };

  const C = {
    get: k => { if (k in stato.cacheScritta) return stato.cacheScritta[k]; if (k in stato.cache) return stato.cache[k]; const r = dbSync('/rest/v1/gas_cache?app=eq.' + enc(app2.nome) + '&chiave=eq.' + enc(k) + '&select=valore,scade'); const v = r[0] && (!r[0].scade || new Date(r[0].scade) > new Date()) ? r[0].valore : null; stato.cache[k] = v; return v; },
    put: (k, v, s) => { stato.cacheScritta[k] = String(v); stato.cacheScade = stato.cacheScade || {}; stato.cacheScade[k] = Date.now() + 1000 * Math.min(s || 600, 21600); },
    remove: k => { stato.cacheScritta[k] = null; },
    getAll: ks => { const o = {}; ks.forEach(k => { const v = C.get(k); if (v != null) o[k] = v; }); return o; },
    putAll: (o, s) => Object.keys(o).forEach(k => C.put(k, o[k], s)), removeAll: ks => ks.forEach(C.remove)
  };
  const CacheService = { getScriptCache: () => C, getUserCache: () => C, getDocumentCache: () => C };

  const lock = {
    waitLock: ms => { const fine = Date.now() + (ms || 10000); while (true) { if (lock.tryLock(0)) return; if (Date.now() > fine) throw new Error('Il sistema è occupato: riprova tra un attimo.'); const t = Date.now() + 400; while (Date.now() < t) { } } },
    tryLock: () => { if (stato.lockPreso) return true; const ok = dbSync('/rest/v1/rpc/gas_lock_prendi', 'POST', { p_app: app2.nome, p_secondi: 60, p_chi: String(process.pid) }); if (ok) { stato.lockPreso = true; Object.keys(stato.fogli).forEach(id => { if (!stato._fogliSporchi.has(id)) delete stato.fogli[id]; }); } return !!ok; },
    releaseLock: () => { if (stato.lockPreso) { dbSync('/rest/v1/gas_lock?app=eq.' + enc(app2.nome), 'DELETE'); stato.lockPreso = false; } },
    hasLock: () => stato.lockPreso
  };
  const LockService = { getScriptLock: () => lock, getDocumentLock: () => lock, getUserLock: () => lock };

  function mail(a, b, c, d) {
    const o = typeof a === 'object' ? { ...a } : { to: a, subject: b, body: c, ...(d || {}) };
    stato.mail.push(o);
  }
  const MailApp = { sendEmail: mail, getRemainingDailyQuota: () => 1000 };
  const GmailApp = {
    sendEmail: mail, getAliases: () => [],
    search: () => { throw new Error('La lettura della casella mail non è ancora su Jarvis'); },
    getInboxUnreadCount: () => 0, getUserLabelByName: () => null, createLabel: () => ({ addToThread() { }, removeFromThread() { } })
  };

  // File: su Jarvis stanno nello storage (bucket jarvis-file); i file noti di Google (logo) sono già su Jarvis
  function fileDaRiga(r) {
    return {
      getId: () => r.id, getName: () => r.nome, setName: n => { r.nome = n; return this; }, getUrl: () => BASE + '/file/' + r.id, getDownloadUrl: () => BASE + '/file/' + r.id,
      getMimeType: () => r.tipo, setSharing: function () { return this; }, setTrashed: function () { return this; }, isTrashed: () => false, getLastUpdated: () => new Date(r.creato_il || Date.now()),
      getDateCreated: () => new Date(r.creato_il || Date.now()), getSize: () => 0, getOwner: () => ({ getEmail: () => '' }), addViewer: function () { return this; },
      getBlob: () => { if (r._blob) return r._blob; const x = fetchSync(SUPABASE_URL + '/storage/v1/object/jarvis-file/' + r.path, { headers: intestazioni() }); if (x.status >= 300) throw new Error('File non trovato: ' + r.id); return new Blob(x.body, r.tipo, r.nome); },
      getAs: function (t) { return this.getBlob().getAs(t); }
    };
  }
  function creaFile(blob, cartella, nome, tipo) {
    const b = blob instanceof Blob ? blob : new Blob(blob, tipo || 'text/plain', nome);
    const id = 'jf' + crypto.randomBytes(12).toString('hex');
    const r = { id, nome: nome || b.getName() || id, tipo: b.getContentType(), cartella: cartella || null, path: (app2.nome + '/' + id), _blob: b };
    stato.fileNuovi.push(r); return fileDaRiga(r);
  }
  function cartella(id, nome) {
    return {
      getId: () => id, getName: () => nome || id, getUrl: () => BASE + '/cartella/' + id,
      createFile: (b, c, t) => (typeof b === 'string' ? creaFile(new Blob(c, t || 'text/plain', b), id, b, t) : creaFile(b, id)),
      createFolder: n => cartella('jd' + crypto.randomBytes(8).toString('hex'), n),
      getFilesByName: n => iter(dbSync('/rest/v1/gas_file?cartella=eq.' + enc(id) + '&nome=eq.' + enc(n) + '&select=*&order=creato_il.desc').map(fileDaRiga)),
      getFiles: () => iter(dbSync('/rest/v1/gas_file?cartella=eq.' + enc(id) + '&select=*&order=creato_il.desc').map(fileDaRiga)),
      getFolders: () => iter([]), getFoldersByName: () => iter([]), setSharing: function () { return this; }, addFile: function () { return this; }, removeFile: function () { return this; }
    };
  }
  const iter = l => { let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; };
  const fileNoti = app2.fileNoti || {};
  const DriveApp = {
    getFolderById: id => cartella(id), getRootFolder: () => cartella('root', 'Il mio Drive'), createFolder: n => cartella('jd' + crypto.randomBytes(8).toString('hex'), n),
    createFile: (b, c, t) => (typeof b === 'string' ? creaFile(new Blob(c, t || 'text/plain', b), null, b, t) : creaFile(b)),
    getFileById: id => {
      if (fileNoti[id]) { const f = fileNoti[id]; return fileDaRiga({ id, nome: f.nome, tipo: f.tipo, _blob: new Blob(fs.readFileSync(path.join(process.cwd(), f.locale)), f.tipo, f.nome) }); }
      const r = dbSync('/rest/v1/gas_file?id=eq.' + enc(id) + '&select=*'); if (!r.length) throw new Error('File non trovato: ' + id); return fileDaRiga(r[0]);
    },
    getFilesByName: n => iter(dbSync('/rest/v1/gas_file?nome=eq.' + enc(n) + '&select=*&order=creato_il.desc').map(fileDaRiga)),
    Access: { ANYONE_WITH_LINK: 1, ANYONE: 2, PRIVATE: 3, DOMAIN: 4, DOMAIN_WITH_LINK: 5 }, Permission: { VIEW: 1, EDIT: 2, COMMENT: 3 }
  };

  const UrlFetchApp = {
    fetch: (url, o) => {
      o = o || {};
      const rm = Object.keys(app2.rimappa || {}).find(k => String(url).startsWith(k));
      if (rm) { const dest = app2.rimappa[rm]; if (!dest) return { getResponseCode: () => 200, getContentText: () => 'OK', getBlob: () => new Blob('OK', 'text/plain'), getContent: () => [], getHeaders: () => ({}), getAllHeaders: () => ({}) }; url = dest + String(url).slice(rm.length).replace(/^\?/, dest.includes('?') ? '&' : '?'); }
      const h = { ...(o.headers || {}) };
      if (o.contentType) h['Content-Type'] = o.contentType;
      let body = o.payload;
      if (body && typeof body === 'object' && !(body instanceof Blob)) { if (!o.contentType) { h['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(body).toString(); } }
      else if (body instanceof Blob) body = aBuffer(body);
      const r = fetchSync(url, { method: (o.method || 'get').toUpperCase(), headers: h, body, redirect: o.followRedirects === false ? 'manual' : 'follow' });
      if (r.status >= 400 && !o.muteHttpExceptions) throw new Error('Richiesta fallita (' + r.status + '): ' + url.split('?')[0]);
      return { getResponseCode: () => r.status, getContentText: () => r.body.toString('utf8'), getBlob: () => new Blob(r.body, r.headers['content-type']), getContent: () => Array.from(r.body), getHeaders: () => r.headers, getAllHeaders: () => r.headers };
    },
    fetchAll: l => l.map(x => UrlFetchApp.fetch(typeof x === 'string' ? x : x.url, x))
  };

  const trigger = { atHour() { return trigger; }, nearMinute() { return trigger; }, everyDays() { return trigger; }, everyHours() { return trigger; }, everyMinutes() { return trigger; }, everyWeeks() { return trigger; }, onWeekDay() { return trigger; }, inTimezone() { return trigger; }, timeBased() { return trigger; }, at() { return trigger; }, after() { return trigger; }, onMonthDay() { return trigger; }, forSpreadsheet() { return trigger; }, onEdit() { return trigger; }, onOpen() { return trigger; }, onFormSubmit() { return trigger; }, create() { return { getUniqueId: () => 'jarvis', getHandlerFunction: () => '' }; } };
  const ScriptApp = {
    getService: () => ({ getUrl: () => app2.url, isEnabled: () => true }), getScriptId: () => 'jarvis-' + app2.nome,
    getProjectTriggers: () => [], newTrigger: () => trigger, deleteTrigger: () => { }, getOAuthToken: () => '',
    WeekDay: { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 7 }, AuthMode: {}, getAuthorizationInfo: () => ({ getAuthorizationStatus: () => 'NOT_REQUIRED' }), AuthorizationStatus: { REQUIRED: 'REQUIRED', NOT_REQUIRED: 'NOT_REQUIRED' }
  };

  const HtmlService = {
    createHtmlOutput: h => new HtmlOutput(h && h.getContent ? h.getContent() : h),
    createHtmlOutputFromFile: n => new HtmlOutput(file(n)),
    createTemplate: t => modello(t && t.getDataAsString ? t.getDataAsString() : t),
    createTemplateFromFile: n => modello(file(n)),
    XFrameOptionsMode: { ALLOWALL: 1, DEFAULT: 0 }, SandboxMode: { IFRAME: 1, NATIVE: 2, EMULATED: 3 }
  };
  function file(n) { const f = (app2.html || {})[n] || (app2.html || {})[n + '.html']; if (f == null) throw new Error('Pagina non trovata: ' + n); return f; }
  function modello(testo) {
    const t = {};
    Object.defineProperty(t, 'evaluate', { enumerable: false, value: () => {
      const fn = stato.valuta('(function(__dati,__esc,__str){with(__dati){' + compilaModello(String(testo)) + '}})');
      return new HtmlOutput(fn(t, x => escHtml(x), x => (x == null ? '' : String(x))));
    } });
    Object.defineProperty(t, 'getRawContent', { enumerable: false, value: () => testo });
    return t;
  }
  const ContentService = { createTextOutput: t => new TextOutput(t), MimeType: { JSON: 'application/json', TEXT: 'text/plain', CSV: 'text/csv', JAVASCRIPT: 'application/javascript', XML: 'text/xml', ICAL: 'text/calendar', RSS: 'application/rss+xml', ATOM: 'application/atom+xml', VCARD: 'text/vcard' } };

  const Logger = { log: (...a) => { console.log('[' + app2.nome + ']', ...a); return Logger; } };
  const globali = {
    SpreadsheetApp, PropertiesService, CacheService, LockService, MailApp, GmailApp, DriveApp, UrlFetchApp, ScriptApp, HtmlService, ContentService, Logger,
    Utilities: creaUtilities(TZ),
    FormApp: { openById: () => { throw new Error('Modulo Google non disponibile su Jarvis'); }, getActiveForm: () => null },
    Session: { getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => app2.account || '' }), getScriptTimeZone: () => TZ, getTimeZone: () => TZ, getTemporaryActiveUserKey: () => '' },
    MimeType: { PDF: 'application/pdf', PNG: 'image/png', JPEG: 'image/jpeg', GIF: 'image/gif', CSV: 'text/csv', PLAIN_TEXT: 'text/plain', HTML: 'text/html', MICROSOFT_EXCEL: 'application/vnd.ms-excel', GOOGLE_SHEETS: 'application/vnd.google-apps.spreadsheet' },
    console: { log: (...a) => console.log('[' + app2.nome + ']', ...a), info: (...a) => console.log('[' + app2.nome + ']', ...a), warn: (...a) => console.warn('[' + app2.nome + ']', ...a), error: (...a) => console.error('[' + app2.nome + ']', ...a), time() { }, timeEnd() { } },
    setTimeout, clearTimeout, URL, URLSearchParams, TextEncoder, TextDecoder
  };
  return { globali, stato };
}

// Fine esecuzione: salva fogli, proprietà, cache, file e manda le mail
export async function salva(app, stato) {
  for (const id of stato._fogliSporchi) {
    const ss = stato.fogli[id]; if (!ss) continue;
    for (const nome of ss._cancellate) if (!ss._schede.some(s => s.nome === nome)) await dbAsync('/rest/v1/gas_fogli?foglio=eq.' + enc(id) + '&scheda=eq.' + enc(nome), 'DELETE');
    const righe = ss._schede.map((s, i) => ({ foglio: id, scheda: s.nome, ordine: i, bloccate: s.bloccate || 0, nascosta: !!s.nascosta, valori: s.valori.map(r => (r || []).map(perDb)), aggiornato_il: new Date().toISOString() }))
      .filter(r => ss._sp.has(r.scheda) || true);
    await dbAsync('/rest/v1/gas_fogli?on_conflict=foglio,scheda', 'POST', righe.filter(r => ss._sp.has(r.scheda)), { Prefer: 'resolution=merge-duplicates,return=minimal' });
  }
  if (stato.propSporche.size) await dbAsync('/rest/v1/gas_proprieta?on_conflict=app,chiave', 'POST', [...stato.propSporche].map(k => ({ app: app.nome, chiave: k, valore: stato.proprieta[k] })), { Prefer: 'resolution=merge-duplicates,return=minimal' });
  for (const k of stato.propCancellate) await dbAsync('/rest/v1/gas_proprieta?app=eq.' + enc(app.nome) + '&chiave=eq.' + enc(k), 'DELETE');
  const cs = Object.keys(stato.cacheScritta);
  if (cs.length) await dbAsync('/rest/v1/gas_cache?on_conflict=app,chiave', 'POST', cs.map(k => ({ app: app.nome, chiave: k, valore: stato.cacheScritta[k], scade: stato.cacheScritta[k] == null ? new Date(0).toISOString() : new Date((stato.cacheScade || {})[k] || Date.now() + 6e5).toISOString() })), { Prefer: 'resolution=merge-duplicates,return=minimal' });
  for (const f of stato.fileNuovi) {
    const up = await fetch(SUPABASE_URL + '/storage/v1/object/jarvis-file/' + f.path, { method: 'POST', headers: { ...intestazioni(), 'Content-Type': f.tipo || 'application/octet-stream', 'x-upsert': 'true' }, body: aBuffer(f._blob) });
    if (!up.ok) console.error('[GAS] file non salvato', f.nome, up.status);
    await dbAsync('/rest/v1/gas_file', 'POST', { id: f.id, nome: f.nome, tipo: f.tipo, cartella: f.cartella, path: f.path, app: app.nome }, { Prefer: 'return=minimal' });
  }
  if (stato.lockPreso) { await dbAsync('/rest/v1/gas_lock?app=eq.' + enc(app.nome), 'DELETE'); stato.lockPreso = false; }
  for (const m of stato.mail) await mandaMail(app, m);
}

async function mandaMail(app, m) {
  const lista = x => (x ? String(x).split(',').map(s => s.trim()).filter(Boolean) : []);
  const allegati = [];
  (m.attachments || []).forEach(b => { if (b) allegati.push({ filename: b.getName ? b.getName() || 'allegato' : 'allegato', content: aBuffer(b).toString('base64'), content_type: b.getContentType ? b.getContentType() : undefined }); });
  Object.keys(m.inlineImages || {}).forEach(k => { const b = m.inlineImages[k]; allegati.push({ filename: (b.getName && b.getName()) || k, content: aBuffer(b).toString('base64'), content_type: b.getContentType ? b.getContentType() : 'image/png', content_id: k }); });
  let dest = lista(m.to), cc = lista(m.cc), bcc = lista(m.bcc), oggetto = m.subject || '';
  if (app.simulazione) {   // prima del passaggio: tutto ad Andrea, con l'indicazione di chi l'avrebbe ricevuta
    oggetto = '[SIMULAZIONE → ' + dest.join(', ') + (cc.length ? ' + cc ' + cc.join(', ') : '') + '] ' + oggetto;
    dest = [app.simulazione]; cc = []; bcc = [];
  }
  const corpo = { from: (m.name || app.mittente || 'Officine Sportive') + ' <info@officinesportive.it>', to: dest, subject: oggetto, ...(m.htmlBody ? { html: m.htmlBody } : {}), ...(m.body ? { text: m.body } : {}), ...(cc.length ? { cc } : {}), ...(bcc.length ? { bcc } : {}), ...(m.replyTo ? { reply_to: m.replyTo } : {}), ...(allegati.length ? { attachments: allegati } : {}) };
  if (!dest.length) return;
  const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + RESEND, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  if (!r.ok) console.error('[GAS] mail non partita', r.status, (await r.text()).slice(0, 300));
}

// Carica il codice dell'app (cifrato nel repository) e lo esegue nello stesso "mondo" di Node
const compilati = {};
function compila(app, chiave) {
  if (!compilati[app.nome]) {
    const t = app.testo(chiave);
    compilati[app.nome] = new Function('__g', 'with(__g){' + t + '\n;return function(__n){ return eval(__n); };}');
  }
  return compilati[app.nome];
}

export async function esegui(app, chiave, fn, args) {
  const { globali, stato } = creaAmbiente(app);
  let valore, errore = null;
  try {
    const valuta = compila(app, chiave)(globali);
    stato.valuta = valuta;
    if (!/^[A-Za-z_$][\w$]*$/.test(fn)) throw new Error('Funzione non valida');
    const f = valuta('typeof ' + fn + ' === "function" ? ' + fn + ' : null');
    if (!f) throw new Error('Funzione non trovata: ' + fn);
    valore = f.apply(null, args || []);
  } catch (e) { errore = e; }
  try { await salva(app, stato); } catch (e) { console.error('[GAS] salvataggio', e); if (!errore) errore = e; }
  if (errore) throw errore;
  return valore;
}
export { HtmlOutput, TextOutput };
