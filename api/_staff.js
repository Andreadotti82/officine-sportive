// Mail di Jarvis allo staff (stessa grafica e firma di tutte le mail al team).
import { segreto, inviaMail } from './_jarvis-base.js';
import { cornice, firmaJarvis } from './_fitcheck.js';

export async function mailStaff(chiave, to, oggetto, titolo, corpo, replyTo) {
  if (!chiave || chiave !== await segreto('giro')) return { ok: false };
  await inviaMail(to, oggetto, cornice(titolo, corpo + firmaJarvis), 'Jarvis · Officine Sportive', { replyTo: replyTo || 'officinesportive3@gmail.com' });
  return { ok: true };
}
