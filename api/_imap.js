// Lettura della casella info@ (Register) via IMAP, senza librerie esterne.
import tls from 'node:tls';
import { segreto } from './_jarvis-base.js';

const HOST_PROVA = ['imap.securemail.pro', 'mail.securemail.pro', 'imaps.securemail.pro', 'imaps.register.it', 'imap.register.it', 'mail.register.it', 'imap.email-it.webapps.net', 'mail.officinesportive.it'];

// Sessione IMAP minima: invia comandi con tag e raccoglie la risposta fino alla riga taggata.
function sessione(host, port = 993, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: host, timeout: timeoutMs });
    let buf = '', attesa = null, n = 0, pronto = false;
    const fine = (e) => { try { sock.destroy(); } catch (_) {} if (!pronto) reject(e); };
    sock.setEncoding('utf8');
    sock.on('timeout', () => fine(new Error('timeout ' + host)));
    sock.on('error', fine);
    sock.on('data', (d) => {
      buf += d;
      if (!pronto && /^\* (OK|PREAUTH)/m.test(buf)) {
        pronto = true; buf = '';
        resolve({
          cmd(c) {
            return new Promise((ok) => {
              const tag = 'J' + (++n);
              attesa = { tag, ok };
              sock.write(tag + ' ' + c + '\r\n');
            });
          },
          chiudi() { try { sock.write('Z LOGOUT\r\n'); sock.end(); } catch (_) {} },
        });
        return;
      }
      if (attesa) {
        const m = buf.match(new RegExp('^' + attesa.tag + ' (OK|NO|BAD)([^\\r\\n]*)', 'm'));
        if (m) { const a = attesa; attesa = null; const testo = buf; buf = ''; a.ok({ stato: m[1], riga: m[2].trim(), testo }); }
      }
    });
  });
}

const q = (s) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

// Prova di collegamento: quale server risponde, login ok, quante mail ci sono e quali cartelle.
export async function infoProva(chiave) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  const user = String(process.env.INFO_MAIL_USER || '').trim().replace(/\.+$/, ''), pass = String(process.env.INFO_MAIL_PASS || '').replace(/[\r\n]+$/,'');
  if (!user || !pass) return { ok: false, errore: 'variabili mancanti', user: !!user, pass: !!pass };
  const esiti = [];
  for (const host of (process.env.INFO_MAIL_HOST ? [process.env.INFO_MAIL_HOST] : ['mail.securemail.pro'])) {
    try {
      const s = await sessione(host);
      const l = await s.cmd('LOGIN ' + q(user) + ' ' + q(pass));
      if (l.stato !== 'OK') { s.chiudi(); esiti.push({ host, login: l.stato, msg: l.riga.slice(0, 120), utente: user.replace(/^(.{3}).*(@.*)$/, '$1…$2'), lunghezzaPass: pass.length, spaziPass: pass !== pass.trim() }); continue; }
      const sel = await s.cmd('EXAMINE INBOX');
      const ex = (sel.testo.match(/\* (\d+) EXISTS/) || [])[1];
      const lst = await s.cmd('LIST "" "*"');
      const cartelle = [...lst.testo.matchAll(/^\* LIST \([^)]*\) "[^"]*" (.+)$/gm)].map(x => x[1].replace(/^"|"$/g, ''));
      s.chiudi();
      return { ok: true, host, inbox: Number(ex || 0), cartelle, tentativi: esiti };
    } catch (e) { esiti.push({ host, errore: String(e && e.message || e).slice(0, 220) }); }
  }
  return { ok: false, tentativi: esiti };
}
