// API Vercel: salva una richiesta di Guest Pass in Supabase
// POST /api/prenota  { nome, cognome, email, cellulare }

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kyricrhlqlassvhxqjgf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5cmljcmhscWxhc3N2aHhxamdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2OTU4MjEsImV4cCI6MjExMTI3MTgyMX0.PgX0_48IE63SB7MFEWaRSpMsA7uPqAh2GLQ-X2uNuyU';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, errore: 'Metodo non consentito' });

  try {
    const { nome, cognome, email, cellulare } = req.body || {};

    // Validazione
    if (!nome || !nome.trim()) return res.status(400).json({ ok: false, errore: 'Inserisci il tuo nome' });
    if (!cognome || !cognome.trim()) return res.status(400).json({ ok: false, errore: 'Inserisci il tuo cognome' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, errore: 'Inserisci un indirizzo email valido' });
    if (!cellulare || cellulare.replace(/\D/g, '').length < 8) return res.status(400).json({ ok: false, errore: 'Inserisci un numero di cellulare valido' });

    // Salva in Supabase
    const response = await fetch(`${SUPABASE_URL}/rest/v1/guest_pass`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        nome: nome.trim(),
        cognome: cognome.trim(),
        email: email.trim().toLowerCase(),
        cellulare: cellulare.trim(),
        consenso: true,
        mail_guest_pass_inviata: false
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Errore Supabase:', err);
      return res.status(500).json({ ok: false, errore: 'Errore nel salvataggio. Riprova tra qualche istante.' });
    }

    const [record] = await response.json();

    // Manda la mail col Guest Pass via SendGrid
    try {
      const baseUrl = `https://${req.headers.host}`;
      await fetch(`${baseUrl}/api/mail-guestpass`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome.trim(), cognome: cognome.trim(), email: email.trim().toLowerCase() })
      });
    } catch (mailErr) {
      console.error('Errore invio mail (non bloccante):', mailErr);
    }

    return res.status(200).json({ ok: true, id: record.id });

  } catch (err) {
    console.error('Errore prenota:', err);
    return res.status(500).json({ ok: false, errore: 'Si è verificato un errore. Riprova tra qualche istante.' });
  }
}
