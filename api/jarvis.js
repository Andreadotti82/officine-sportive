// Jarvis: un solo indirizzo per i processi spostati da Google (Fit Check, report di Wellness, app nate su Google).
export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };
import { fcDati, fcPrenota, fcAnnulla, fcGiro } from './_fitcheck.js';
import { wCarica } from './_wellness.js';
import { apRun } from './_actionplan.js';
import { gmRun, gmPagina } from './_gm.js';
import { ponteRun, pontePagina, PONTI } from './_ponte.js';
import { gasRun, gasEsegui, gasPagina, gasPost } from './_gas/servizio.js';
import { APPS } from './_gas/app.js';
import { gasImporta } from './_gas/importa.js';
import { db } from './_jarvis-base.js';
import { infoProva } from './_imap.js';
import { mailStaff } from './_staff.js';
import { linkPagina } from './_link.js';
import { testoCarica } from './_testi.js';
import { driveGiro, driveCodice, codiceCerca, gasRiceviProp, codiceAggancia, codicePatch, codiceSpegni } from './_drive.js';
import { infoLeggi, infoArchivio } from './_posta.js';
import { wellnessDaily } from './_daily-wellness.js';
import { mailDati } from './_mail-dati.js';
import { sumupInsoluto, sumupStato } from './_sumup-insoluti.js';
import { contrattiRecenti } from './_contratti-recenti.js';
import { pnImporta, pnGet, pnSet, pnList, pnPoll, pnTurni, pnPagina } from './_primanota.js';

const FUNZIONI = { fcDati, fcPrenota, fcAnnulla, fcGiro, wCarica, apRun, gmRun, ponteRun, gasRun, gasEsegui, gasImporta, infoProva, mailStaff, testoCarica, pnImporta, pnGet, pnSet, pnList, pnPoll, pnTurni, driveGiro, driveCodice, codiceCerca, infoLeggi, gasRiceviProp, codiceAggancia, codicePatch, infoArchivio, codiceSpegni, wellnessDaily, mailDati, sumupInsoluto, sumupStato, contrattiRecenti };
const errorePagina = '<p style="font-family:Arial;padding:30px;text-align:center">Il servizio non risponde in questo momento: riprova tra un attimo.</p>';

async function pagina(res, crea, nome) {
  try {
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(await crea());
  } catch (err) { console.error('Errore pagina ' + nome + ':', err); return res.status(503).send(errorePagina); }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const q = req.query || {};
  if (req.method === 'GET' && q.pagina === 'primanota') return pagina(res, () => pnPagina(q), 'primanota');
  if (req.method === 'GET' && q.pagina === 'link') return pagina(res, () => linkPagina(q), 'link');
  if (req.method === 'GET' && q.pagina === 'gm') return pagina(res, () => gmPagina(q), 'gm');
  if (req.method === 'GET' && PONTI[q.ponte]) return pagina(res, () => pontePagina(q.ponte, q), q.ponte);
  if (req.method === 'GET' && APPS[q.gas]) return pagina(res, () => gasPagina(q.gas, q), q.gas);
  // file salvati dalle app (come i link di Google Drive «chiunque abbia il link»)
  if (req.method === 'GET' && /^jf[0-9a-f]{24}$/.test(String(q.file || ''))) {
    const r = await db('/rest/v1/gas_file?id=eq.' + q.file + '&select=nome,tipo,path');
    const x = (await r.json())[0];
    if (!x) return res.status(404).send('File non trovato');
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kyricrhlqlassvhxqjgf.supabase.co', K = process.env.SUPABASE_SERVICE_KEY || '';
    const f = await fetch(SUPABASE_URL + '/storage/v1/object/jarvis-file/' + x.path, { headers: { apikey: K, ...(K.startsWith('sb_') ? {} : { Authorization: 'Bearer ' + K }) } });
    if (!f.ok) return res.status(404).send('File non trovato');
    res.setHeader('Content-Type', x.tipo || 'application/octet-stream'); res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(x.nome || 'file') + '"');
    return res.status(200).send(Buffer.from(await f.arrayBuffer()));
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  // doPost di un'app nata su Google (altri sistemi che le scrivono)
  if (APPS[q.gaspost]) {
    try { res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.status(200).send(await gasPost(q.gaspost, req.body)); }
    catch (err) { console.error('Errore doPost ' + q.gaspost, err); return res.status(500).send('ERRORE: ' + (err && err.message || err)); }
  }
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
