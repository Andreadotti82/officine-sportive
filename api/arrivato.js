// API Vercel: segna un Guest Pass come "arrivato"
// POST /api/arrivato  { chiave, id }

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kyricrhlqlassvhxqjgf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';
const CHIAVE_LISTA = process.env.CHIAVE_LISTA || 'ecd56c492f930d32';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, errore: 'Metodo non consentito' });

  const { chiave, id } = req.body || {};
  if (chiave !== CHIAVE_LISTA) {
    return res.status(403).json({ ok: false, errore: 'Chiave non valida' });
  }
  if (!id) {
    return res.status(400).json({ ok: false, errore: 'ID mancante' });
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/guest_pass?id=eq.${id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          arrivato: true,
          arrivato_il: new Date().toISOString()
        })
      }
    );

    if (!response.ok) {
      return res.status(500).json({ ok: false, errore: 'Errore nell\'aggiornamento' });
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('Errore arrivato:', err);
    return res.status(500).json({ ok: false, errore: 'Errore nell\'aggiornamento' });
  }
}
