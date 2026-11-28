// GmailApp su Jarvis: le mail di info@ lette da Register (tabella info_mail), con la ricerca di Gmail,
// conversazioni, etichette, archivio e cestino tenuti su Jarvis. Le risposte partono da info@ (Resend).
export function creaGmail({ dbSync, enc, mail, Blob, fetchSync, SUPABASE_URL, intestazioni }) {
  const CAMPI = 'id,thread_id,message_id,da,a,cc,reply_to,oggetto,data,testo,html,allegati,etichette,in_inbox,cestino,letto,intestazioni';
  const cache = {};
  const righeThread = tid => (cache['t' + tid] = cache['t' + tid] || dbSync('/rest/v1/info_mail?thread_id=eq.' + enc(tid) + '&select=' + CAMPI + '&order=data.asc'));
  const aggiorna = (filtro, patch) => { dbSync('/rest/v1/info_mail?' + filtro, 'PATCH', patch, { Prefer: 'return=minimal' }); Object.keys(cache).forEach(k => delete cache[k]); };
  const indirizzo = s => { const m = String(s || '').match(/<([^>]+)>/); return (m ? m[1] : String(s || '')).trim().toLowerCase(); };

  // ---------- ricerca con la sintassi di Gmail ----------
  function tokenizza(q) {
    const out = [], re = /\s*(\(|\)|-?[\w.]+:"[^"]*"|-?[\w.]+:\([^)]*\)|-?[\w.]+:[^\s()]+|"[^"]*"|OR\b|AND\b|-?[^\s()]+)/gy; let m;
    while ((m = re.exec(q)) && m[0].trim()) out.push(m[1]);
    return out;
  }
  function analizza(tok) {
    let i = 0;
    function espr() { let a = termine(); while (tok[i] === 'OR') { i++; const b = termine(); const x = a; a = r => x(r) || b(r); } return a; }
    function termine() { const fs = []; while (i < tok.length && tok[i] !== ')' && tok[i] !== 'OR') { if (tok[i] === 'AND') { i++; continue; } fs.push(fattore()); } return r => fs.every(f => f(r)); }
    function fattore() {
      let t = tok[i++];
      if (t === '(') { const e = espr(); if (tok[i] === ')') i++; return e; }
      let neg = false; if (t[0] === '-' && t.length > 1) { neg = true; t = t.slice(1); }
      const f = atomo(t); return neg ? r => !f(r) : f;
    }
    return espr();
  }
  const tolto = v => String(v).replace(/^"|"$/g, '').replace(/^\(|\)$/g, '').toLowerCase();
  function durata(v) { const m = String(v).match(/^(\d+)([dhmy])$/i); if (!m) return 0; return Number(m[1]) * { d: 864e5, h: 36e5, m: 30 * 864e5, y: 365 * 864e5 }[m[2].toLowerCase()]; }
  function atomo(t) {
    const m = t.match(/^([\w.]+):(.*)$/);
    if (!m) { const w = tolto(t); return r => (String(r.oggetto) + ' ' + String(r.testo) + ' ' + String(r.da)).toLowerCase().includes(w); }
    const k = m[1].toLowerCase(), v = tolto(m[2]);
    switch (k) {
      case 'in': return v === 'inbox' ? r => r.in_inbox && !r.cestino : v === 'trash' ? r => r.cestino : v === 'anywhere' ? () => true : v === 'sent' ? () => false : () => true;
      case 'is': return v === 'unread' ? r => !r.letto : v === 'read' ? r => r.letto : v === 'starred' ? () => false : () => true;
      case 'newer_than': { const d = durata(v); return r => new Date(r.data).getTime() >= Date.now() - d; }
      case 'older_than': { const d = durata(v); return r => new Date(r.data).getTime() < Date.now() - d; }
      case 'after': case 'newer': { const d = new Date(v.replace(/\//g, '-')).getTime(); return r => new Date(r.data).getTime() >= d; }
      case 'before': case 'older': { const d = new Date(v.replace(/\//g, '-')).getTime(); return r => new Date(r.data).getTime() < d; }
      case 'from': return r => String(r.da).toLowerCase().includes(v);
      case 'to': return r => (String(r.a) + ' ' + String(r.cc) + ' ' + String((r.intestazioni || {})['delivered-to'] || '')).toLowerCase().includes(v);
      case 'subject': { const parole = v.split(/\s+/).filter(Boolean); return r => parole.every(p => String(r.oggetto).toLowerCase().includes(p)); }
      case 'label': return r => (r.etichette || []).some(e => e.toLowerCase() === v || e.toLowerCase().replace(/[\s/]+/g, '-') === v);
      case 'has': return v === 'attachment' ? r => (r.allegati || []).length > 0 : () => true;
      case 'filename': return r => (r.allegati || []).some(a => String(a.nome).toLowerCase().includes(v));
      default: return () => true;
    }
  }
  function search(q, start, max) {
    q = String(q || ''); start = start || 0; max = max || 500;
    const nt = q.match(/newer_than:(\d+[dhmy])/i), giorni = nt ? Math.ceil(durata(nt[1]) / 864e5) + 1 : 120;
    const righe = dbSync('/rest/v1/info_mail?data=gte.' + enc(new Date(Date.now() - giorni * 864e5).toISOString()) + '&select=' + CAMPI + '&order=data.desc&limit=3000');
    const filtro = analizza(tokenizza(q)), conTrash = /in:(trash|anywhere)/i.test(q);
    const thread = new Map();
    for (const r of righe) { if (!conTrash && r.cestino) continue; if (filtro(r)) { if (!thread.has(r.thread_id)) thread.set(r.thread_id, r); } }
    return [...thread.keys()].slice(start, start + max).map(id => Thread(id));
  }

  // ---------- oggetti come Gmail ----------
  function Allegato(a) {
    let b = null;
    const blob = () => { if (!b) { const x = fetchSync(SUPABASE_URL + '/storage/v1/object/jarvis-file/' + a.path, { headers: intestazioni() }); b = new Blob(x.body, a.tipo, a.nome); } return b; };
    return new Proxy({}, { get: (t, n) => n === 'getName' ? () => a.nome : n === 'getContentType' ? () => a.tipo : n === 'getSize' ? () => a.dim || 0 : n === 'isGoogleType' ? () => false : n === 'getHash' ? () => a.path : n === 'copyBlob' ? () => blob() : (typeof blob()[n] === 'function' ? blob()[n].bind(blob()) : blob()[n]) });
  }
  function Messaggio(r) {
    const self = {
      getId: () => r.id, getDate: () => new Date(r.data), getFrom: () => r.da || '', getTo: () => r.a || '', getCc: () => r.cc || '', getBcc: () => '', getReplyTo: () => r.reply_to || '',
      getSubject: () => r.oggetto || '', getPlainBody: () => r.testo || '', getBody: () => r.html || String(r.testo || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>'),
      getRawContent: () => '', getHeader: n => { const k = String(n).toLowerCase(), h = r.intestazioni || {}; return h[k] || (k === 'message-id' ? '<' + r.message_id + '>' : ''); },
      getAttachments: o => (r.allegati || []).filter(a => !(o && o.includeInlineImages === false && a.cid)).map(Allegato),
      getThread: () => Thread(r.thread_id), getMessageId: () => r.message_id,
      isUnread: () => !r.letto, isInTrash: () => !!r.cestino, isInInbox: () => !!r.in_inbox && !r.cestino, isStarred: () => false, isDraft: () => false, isInChats: () => false, isInPriorityInbox: () => false,
      markRead: () => { aggiorna('id=eq.' + enc(r.id), { letto: true }); r.letto = true; return self; }, markUnread: () => { aggiorna('id=eq.' + enc(r.id), { letto: false }); r.letto = false; return self; },
      moveToTrash: () => { aggiorna('id=eq.' + enc(r.id), { cestino: true }); r.cestino = true; return self; }, star: () => self, unstar: () => self, refresh: () => self,
      reply: (corpo, o) => { rispondi(r, corpo, o, false); return self; }, replyAll: (corpo, o) => { rispondi(r, corpo, o, true); return self; },
      forward: (to, o) => { o = o || {}; mail({ to, subject: o.subject || ('Fwd: ' + (r.oggetto || '')), body: (o.body ? o.body + '\n\n' : '') + '---------- Messaggio inoltrato ----------\nDa: ' + r.da + '\nData: ' + r.data + '\nOggetto: ' + r.oggetto + '\n\n' + (r.testo || ''), htmlBody: o.htmlBody, cc: o.cc, bcc: o.bcc, name: o.name, replyTo: o.replyTo, attachments: (o.attachments || []).concat(self.getAttachments()) }); return self; },
      createDraftReply: (corpo, o) => { rispondi(r, corpo, o, false); return { send: () => self, getMessage: () => self, getId: () => 'bozza' }; },
      getPermalink: () => 'https://officine-sportive.vercel.app/info/' + r.id
    };
    return self;
  }
  function rispondi(r, corpo, o, tutti) {
    o = o || {};
    const a = o.to || r.reply_to || r.da;
    const cc = tutti ? [r.cc].concat(String(r.a || '').split(',').filter(x => !/info@officinesportive\.it/i.test(x))).filter(Boolean).join(',') : o.cc;
    const ogg = o.subject || (/^re:/i.test(r.oggetto || '') ? r.oggetto : 'Re: ' + (r.oggetto || ''));
    mail({ to: a, subject: ogg, body: corpo, htmlBody: o.htmlBody, cc, bcc: o.bcc, name: o.name, replyTo: o.replyTo, attachments: o.attachments, inlineImages: o.inlineImages, inReplyTo: '<' + r.message_id + '>' });
  }
  function Thread(tid) {
    const msgs = () => righeThread(tid);
    const self = {
      getId: () => tid, getMessages: () => msgs().map(Messaggio), getMessageCount: () => msgs().length,
      getFirstMessageSubject: () => (msgs()[0] || {}).oggetto || '', getLastMessageDate: () => new Date((msgs()[msgs().length - 1] || {}).data || Date.now()),
      getLabels: () => [...new Set(msgs().flatMap(r => r.etichette || []))].map(Etichetta),
      addLabel: l => { const n = typeof l === 'string' ? l : l.getName(); msgs().forEach(r => { if (!(r.etichette || []).includes(n)) aggiorna('id=eq.' + enc(r.id), { etichette: (r.etichette || []).concat(n) }); }); return self; },
      removeLabel: l => { const n = typeof l === 'string' ? l : l.getName(); msgs().forEach(r => { if ((r.etichette || []).includes(n)) aggiorna('id=eq.' + enc(r.id), { etichette: r.etichette.filter(x => x !== n) }); }); return self; },
      moveToArchive: () => { aggiorna('thread_id=eq.' + enc(tid), { in_inbox: false }); return self; }, moveToInbox: () => { aggiorna('thread_id=eq.' + enc(tid), { in_inbox: true, cestino: false }); return self; },
      moveToTrash: () => { aggiorna('thread_id=eq.' + enc(tid), { cestino: true }); return self; }, moveToSpam: () => self.moveToTrash(),
      markRead: () => { aggiorna('thread_id=eq.' + enc(tid), { letto: true }); return self; }, markUnread: () => { aggiorna('thread_id=eq.' + enc(tid), { letto: false }); return self; },
      isUnread: () => msgs().some(r => !r.letto), isInInbox: () => msgs().some(r => r.in_inbox && !r.cestino), isInTrash: () => msgs().length > 0 && msgs().every(r => r.cestino), isImportant: () => false, hasStarredMessages: () => false, isInSpam: () => false, isInChats: () => false, isInPriorityInbox: () => false,
      markImportant: () => self, markUnimportant: () => self, refresh: () => self,
      reply: (c, o) => { const l = msgs()[msgs().length - 1]; if (l) rispondi(l, c, o, false); return self; }, replyAll: (c, o) => { const l = msgs()[msgs().length - 1]; if (l) rispondi(l, c, o, true); return self; },
      createDraftReply: (c, o) => { self.reply(c, o); return { send: () => self }; },
      getPermalink: () => 'https://officine-sportive.vercel.app/info/t/' + tid
    };
    return self;
  }
  function Etichetta(nome) {
    const self = { getName: () => nome, addToThread: t => { t.addLabel(nome); return self; }, removeFromThread: t => { t.removeLabel(nome); return self; },
      addToThreads: l => { l.forEach(t => t.addLabel(nome)); return self; }, removeFromThreads: l => { l.forEach(t => t.removeLabel(nome)); return self; },
      getThreads: (s, m) => search('label:"' + nome + '" in:anywhere', s, m), getUnreadCount: () => 0, deleteLabel: () => { } };
    return self;
  }
  const gm = {
    search, getThreadById: id => (righeThread(id).length ? Thread(id) : null),
    getMessageById: id => { const r = dbSync('/rest/v1/info_mail?id=eq.' + enc(id) + '&select=' + CAMPI); return r.length ? Messaggio(r[0]) : null; },
    getMessagesForThreads: l => l.map(t => t.getMessages()), getMessagesForThread: t => t.getMessages(),
    getInboxThreads: (s, m) => search('in:inbox', s, m), getInboxUnreadCount: () => search('in:inbox is:unread').length, getUserLabelByName: n => Etichetta(n), createLabel: n => Etichetta(n),
    getUserLabels: () => [], getAliases: () => ['info@officinesportive.it'], sendEmail: mail, markThreadsRead: l => l.forEach(t => t.markRead()), moveThreadsToArchive: l => l.forEach(t => t.moveToArchive()),
    moveThreadsToTrash: l => l.forEach(t => t.moveToTrash()), getTrashThreads: (s, m) => search('in:trash', s, m), getSpamThreads: () => [], getStarredThreads: () => [], getDrafts: () => [], getChatThreads: () => [], getPriorityInboxThreads: () => [],
    _indirizzo: indirizzo
  };
  return gm;
}
