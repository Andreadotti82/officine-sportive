// API Vercel: gestisce disiscrizione e "mi sono già iscritto"
// POST /api/disiscrizione  { contatto_id, azione: 'disiscrivi' | 'iscritto' }

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kyricrhlqlassvhxqjgf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5cmljcmhscWxhc3N2aHhxamdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2OTU4MjEsImV4cCI6MjExMTI3MTgyMX0.PgX0_48IE63SB7MFEWaRSpMsA7uPqAh2GLQ-X2uNuyU';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });

  const { contatto_id, azione } = req.body || {};
  if (!contatto_id || !['disiscrivi', 'iscritto'].includes(azione)) {
    return res.status(400).json({ ok: false, errore: 'Parametri non validi' });
  }

  try {
    if (azione === 'disiscrivi') {
      // Segna il contatto come disiscritto
      const r1 = await supaFetch(`/rest/v1/contatti?id=eq.${contatto_id}`, 'PATCH', {
        disiscritto: true,
        disiscritto_il: new Date().toISOString(),
        aggiornato_il: new Date().toISOString()
      });
      if (!r1.ok) {
        console.error('Errore disiscrizione contatto:', r1.status);
        return res.status(500).json({ ok: false });
      }

      // Ferma tutte le sequenze attive
      await supaFetch(`/rest/v1/sequenze_mail?contatto_id=eq.${contatto_id}&attiva=eq.true`, 'PATCH', {
        attiva: false,
        motivo_stop: 'disiscritto'
      });

    } else if (azione === 'iscritto') {
      // Segna come iscritto
      const r1 = await supaFetch(`/rest/v1/contatti?id=eq.${contatto_id}`, 'PATCH', {
        iscritto: true,
        aggiornato_il: new Date().toISOString()
      });
      if (!r1.ok) {
        console.error('Errore iscritto contatto:', r1.status);
        return res.status(500).json({ ok: false });
      }

      // Ferma tutte le sequenze attive
      await supaFetch(`/rest/v1/sequenze_mail?contatto_id=eq.${contatto_id}&attiva=eq.true`, 'PATCH', {
        attiva: false,
        motivo_stop: 'iscritto'
      });
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('Errore disiscrizione:', err);
    return res.status(500).json({ ok: false });
  }
}

function supaFetch(path, method, body) {
  return fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(body)
  });
}
