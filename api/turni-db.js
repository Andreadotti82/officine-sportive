// API Vercel: ponte tra App Turni e Supabase
// Replica le operazioni del db artifact (doc, collection, onSnapshot)
//
// GET  /api/turni-db?path=...            → legge un documento
// GET  /api/turni-db?collection=...      → lista documenti in una collezione
// POST /api/turni-db  { path, data }     → scrive un documento (upsert)
// DELETE /api/turni-db  { path }         → cancella un documento

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kyricrhlqlassvhxqjgf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5cmljcmhscWxhc3N2aHhxamdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2OTU4MjEsImV4cCI6MjExMTI3MTgyMX0.PgX0_48IE63SB7MFEWaRSpMsA7uPqAh2GLQ-X2uNuyU';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { path, collection } = req.query;

      if (path) {
        // Read one document
        const r = await supaFetch(`/rest/v1/turni_docs?path=eq.${encodeURIComponent(path)}&select=*`);
        const rows = await r.json();
        if (rows.length === 0) return res.json({ exists: false, data: null });
        return res.json({ exists: true, data: rows[0].data, path: rows[0].path });
      }

      if (collection) {
        // List documents in a collection (prefix match)
        const prefix = collection.endsWith('/') ? collection : collection + '/';
        const r = await supaFetch(`/rest/v1/turni_docs?path=like.${encodeURIComponent(prefix + '%')}&select=*&order=path`);
        const rows = await r.json();
        return res.json({
          docs: rows.map(row => ({
            id: row.path.replace(prefix, '').split('/')[0],
            path: row.path,
            data: row.data
          }))
        });
      }

      return res.status(400).json({ ok: false, errore: 'Serve path o collection' });
    }

    if (req.method === 'POST') {
      const { path, data } = req.body || {};
      if (!path || !data) return res.status(400).json({ ok: false, errore: 'Serve path e data' });

      // Upsert
      const r = await supaFetch('/rest/v1/turni_docs', 'POST', {
        path,
        data,
        updated_at: new Date().toISOString()
      }, { 'Prefer': 'resolution=merge-duplicates,return=representation' });

      if (!r.ok) {
        const err = await r.text();
        console.error('Errore upsert turni_docs:', err);
        return res.status(500).json({ ok: false, errore: 'Errore salvataggio' });
      }

      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { path } = req.body || {};
      if (!path) return res.status(400).json({ ok: false, errore: 'Serve path' });

      await supaFetch(`/rest/v1/turni_docs?path=eq.${encodeURIComponent(path)}`, 'DELETE');
      return res.json({ ok: true });
    }

    return res.status(405).json({ ok: false });

  } catch (err) {
    console.error('Errore turni-db:', err);
    return res.status(500).json({ ok: false, errore: err.message });
  }
}

function supaFetch(path, method, body, extraHeaders) {
  method = method || 'GET';
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    ...(extraHeaders || {})
  };
  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  return fetch(`${SUPABASE_URL}${path}`, opts);
}
