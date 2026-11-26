// API Vercel: salva una risposta al test di gradimento
// POST /api/gradimento

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kyricrhlqlassvhxqjgf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5cmljcmhscWxhc3N2aHhxamdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2OTU4MjEsImV4cCI6MjExMTI3MTgyMX0.PgX0_48IE63SB7MFEWaRSpMsA7uPqAh2GLQ-X2uNuyU';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, errore: 'Metodo non consentito' });

  try {
    const { tipo, nome, cognome, email, anonimo, aree, nps, servizio, voti, spogliatoi, spa, commenti, attivita } = req.body || {};

    // Validazione base
    if (!tipo || !['annuale', '7giorni'].includes(tipo)) {
      return res.status(400).json({ ok: false, errore: 'Tipo test non valido' });
    }
    if (nps === null || nps === undefined || nps < 0 || nps > 10) {
      return res.status(400).json({ ok: false, errore: 'NPS non valido' });
    }

    // Costruisci record
    const record = {
      tipo,
      nome: anonimo ? null : (nome || null),
      cognome: anonimo ? null : (cognome || null),
      email: anonimo ? null : (email || null),
      anonimo: !!anonimo,
      aree: aree || [],
      nps,
      servizio: servizio !== null && servizio !== undefined ? servizio : null,
      voti: voti || {},
      spogliatoi: spogliatoi !== null && spogliatoi !== undefined ? spogliatoi : null,
      spa: spa !== null && spa !== undefined ? spa : null,
      commenti: commenti || null,
      attivita: attivita || null
    };

    const response = await fetch(`${SUPABASE_URL}/rest/v1/gradimento`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(record)
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Errore Supabase gradimento:', response.status, errBody);
      return res.status(500).json({ ok: false, errore: 'Errore nel salvataggio' });
    }

    const [saved] = await response.json();
    return res.status(200).json({ ok: true, id: saved.id });

  } catch (err) {
    console.error('Errore gradimento:', err);
    return res.status(500).json({ ok: false, errore: 'Errore nel salvataggio' });
  }
}
