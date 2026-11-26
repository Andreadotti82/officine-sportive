// API Vercel: sincronizza i dati dall'artifact Claude verso Supabase
// Chiamata periodica (ogni ora) per tenere allineati i due database
// GET /api/sync-artifact?chiave=CHIAVE → esegue sync

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kyricrhlqlassvhxqjgf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5cmljcmhscWxhc3N2aHhxamdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2OTU4MjEsImV4cCI6MjExMTI3MTgyMX0.PgX0_48IE63SB7MFEWaRSpMsA7uPqAh2GLQ-X2uNuyU';
const CHIAVE_API = process.env.CHIAVE_LISTA || 'ecd56c492f930d32';

// Questo endpoint viene chiamato da un cron/scheduled task
// Il task legge i dati dall'artifact via ArtifactData e li manda qui
// POST /api/sync-artifact { chiave, docs: [{path, data}] }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    const { chiave, docs } = req.body || {};
    if (chiave !== CHIAVE_API) return res.status(403).json({ ok: false });
    if (!docs || !Array.isArray(docs)) return res.status(400).json({ ok: false, errore: 'docs mancanti' });

    let aggiornati = 0, errori = 0;
    for (const doc of docs) {
      if (!doc.path || !doc.data) continue;
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/turni_docs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({
            path: doc.path,
            data: doc.data,
            updated_at: new Date().toISOString()
          })
        });
        if (r.ok) aggiornati++;
        else errori++;
      } catch { errori++; }
    }

    return res.json({ ok: true, aggiornati, errori });
  }

  // GET = info
  if (req.method === 'GET') {
    return res.json({ ok: true, info: 'POST con {chiave, docs: [{path, data}]} per sincronizzare' });
  }

  return res.status(405).json({ ok: false });
}
