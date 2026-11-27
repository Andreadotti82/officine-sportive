// Le app nate su Google che ora girano su Jarvis. Il codice sta cifrato nel repository (api/_codici),
// la chiave è nel database di Jarvis: chi legge il repository non vede codici né indirizzi.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BASE = 'https://officine-sportive.vercel.app';
const LOGO_JARVIS = { nome: 'jarvis.gif', tipo: 'image/gif', locale: 'public/jarvis-logo.gif' };
const FILE_NOTI = { '1DHgfuA8S-FU5cZ_bAwjwwCZRxiMQN1oJ': LOGO_JARVIS };

export const APPS = {
  actionplan: { nome: 'actionplan', url: BASE + '/actionplan', percorso: '/actionplan', mittente: 'Action plan audit', fileNoti: FILE_NOTI },
  gm: { nome: 'gm', url: BASE + '/goodmorning', percorso: '/goodmorning', mittente: 'Good Morning & Good Night', fileNoti: FILE_NOTI,
    rimappa: {
      'https://script.google.com/macros/s/AKfycbw8elh5LTFxELcgKHa7nQum8NPAIafVhn1y6sc1mwfNCs_mCF-DTB9SKiViH5tAaW1_Aw/exec': BASE + '/api/jarvis?gaspost=actionplan',
      'https://script.google.com/macros/s/AKfycbxjfZhlL2WBKQeXZ6lm9mEOZcfQ_SmKw8-w-R4sG4Sb9nJCM4phcU_vm82qTyUuZVKO/exec': null   // il Fit Check su Jarvis legge i turni da solo
    } }
};

const decifrati = {};
function leggi(nome, chiave) {
  if (decifrati[nome]) return decifrati[nome];
  const b = fs.readFileSync(path.join(process.cwd(), 'api', '_codici', nome + '.enc'));
  const iv = b.subarray(0, 12), tag = b.subarray(12, 28), dati = b.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(chiave, 'hex'), iv); d.setAuthTag(tag);
  const j = JSON.parse(Buffer.concat([d.update(dati), d.final()]).toString('utf8'));
  decifrati[nome] = j; return j;
}

export function app(nome, chiave, simulazione) {
  const a = APPS[nome]; if (!a) throw new Error('App sconosciuta: ' + nome);
  const j = leggi(nome, chiave);
  return {
    ...a, simulazione: simulazione || null, html: j.html || {}, nomiFogli: j.nomiFogli || {},
    // jarvisTesto_ (il caricatore di Google) qui legge le pagine salvate insieme al codice
    testo: () => j.codice + '\n;function jarvisTesto_(n){ var h = ' + JSON.stringify(j.html || {}) + '; if (h[n] == null) throw new Error("Pagina non trovata: " + n); return h[n]; }\n'
  };
}
