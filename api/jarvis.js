// Jarvis: un solo indirizzo per i processi spostati da Google (per ora il Fit Check).
import { fcDati, fcPrenota, fcAnnulla, fcGiro } from './_fitcheck.js';

const FUNZIONI = { fcDati, fcPrenota, fcAnnulla, fcGiro };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
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
