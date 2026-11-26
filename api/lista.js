// API Vercel: legge la lista dei Guest Pass per lo staff
// GET /api/lista?chiave=CHIAVE

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kyricrhlqlassvhxqjgf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || '';
const CHIAVE_LISTA = process.env.CHIAVE_LISTA || 'ecd56c492f930d32';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, errore: 'Metodo non consentito' });

  const { chiave } = req.query;
  if (chiave !== CHIAVE_LISTA) {
    return res.status(403).json({ ok: false, errore: 'Chiave non valida' });
  }

  try {
    // Ultimi 60 giorni
    const sessantaGiorniFa = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/guest_pass?richiesta_il=gte.${sessantaGiorniFa}&order=richiesta_il.desc`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    if (!response.ok) {
      return res.status(500).json({ ok: false, errore: 'Errore nel caricamento' });
    }

    const righe = await response.json();
    return res.status(200).json({ ok: true, righe });

  } catch (err) {
    console.error('Errore lista:', err);
    return res.status(500).json({ ok: false, errore: 'Errore nel caricamento' });
  }
}
