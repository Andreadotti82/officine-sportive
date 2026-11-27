// Jarvis: un solo indirizzo per i processi spostati da Google (Fit Check, report di Wellness).
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };
import { fcDati, fcPrenota, fcAnnulla, fcGiro } from './_fitcheck.js';
import { wCarica } from './_wellness.js';
import { apRun } from './_actionplan.js';
import { gmRun, gmPagina } from './_gm.js';
import { ponteRun, pontePagina, PONTI } from './_ponte.js';

const FUNZIONI = { fcDati, fcPrenota, fcAnnulla, fcGiro, wCarica, apRun, gmRun, ponteRun };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET' && req.query && req.query.pagina === 'gm') {
    try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(await gmPagina(req.query));
    } catch (err) {
      console.error('Errore pagina GM:', err);
      return res.status(503).send('<p style="font-family:Arial;padding:30px;text-align:center">Il Good Morning non risponde in questo momento: riprova tra un attimo.</p>');
    }
  }
  if (req.method === 'GET' && req.query && PONTI[req.query.ponte]) {
    try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(await pontePagina(req.query.ponte, req.query));
    } catch (err) {
      console.error('Errore pagina ' + req.query.ponte + ':', err);
      return res.status(503).send('<p style="font-family:Arial;padding:30px;text-align:center">Il servizio non risponde in questo momento: riprova tra un attimo.</p>');
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const { fn, args } = req.body || {};
  const comando = FUNZIONI[fn];
  if (!comando) return res.status(400).json({ ok: false, errore: 'Funzione non trovata' });
  try {
    return res.json({ ok: true, data: await comando(...(Array.isArray(args) ? args : [])) });
  } catch (err) {
    console.error('Errore jarvis/' + fn + ':', err);
    return res.status(500).json({ ok: false, errore: 'Qualcosa è andato storto: riprova tra poco.' });
  }
}
