// Link SumUp per le mail degli insoluti (prima li creava l'App Contratti su Google): importo esatto e stato del pagamento.
import { segreto } from './_jarvis-base.js';
const SUMUP_KEY = process.env.SUMUP_API_KEY || '';
const SUMUP_MERCHANT = process.env.SUMUP_MERCHANT_CODE || '';

export async function sumupInsoluto(chiave, riferimento, importo, descrizione) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  const imp = Math.round(Number(importo) * 100) / 100;
  if (!(imp > 0) || !SUMUP_KEY || !SUMUP_MERCHANT) return { ok: false, errore: 'importo o configurazione SumUp mancante' };
  const r = await fetch('https://api.sumup.com/v0.1/checkouts', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SUMUP_KEY },
    body: JSON.stringify({ merchant_code: SUMUP_MERCHANT, amount: imp, currency: 'EUR', checkout_reference: String(riferimento).slice(0, 90),
      description: String(descrizione || 'Officine Sportive').slice(0, 120), redirect_url: 'https://www.officinesportive.it', hosted_checkout: { enabled: true } })
  });
  if (!r.ok) return { ok: false, errore: 'SumUp ' + r.status + ': ' + (await r.text()).slice(0, 200) };
  const d = await r.json();
  return { ok: true, id: d.id, url: d.hosted_checkout_url || ('https://checkout.sumup.com/pay/c-' + d.id) };
}

export async function sumupStato(chiave, id) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  const r = await fetch('https://api.sumup.com/v0.1/checkouts/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + SUMUP_KEY } });
  if (!r.ok) return { ok: false, errore: 'SumUp ' + r.status };
  const d = await r.json();
  return { ok: true, stato: d.status };
}
