// Report di Wellness (Jarvis 1…4, Clienti Playtomic): arrivano dalla pagina di caricamento dei ragazzi
// e Jarvis li tiene su Supabase, così sequenze, pigri, insoluti ed ex soci hanno i dati.
import { db, segreto } from './_jarvis-base.js';

// Stessa regola del Good Morning per riconoscere il file
function tipoFile(nome, testa) {
  const n = String(nome || '').toLowerCase();
  const m = n.match(/jarvis[\s_\-–]*([1-5])/); if (m) return 'j' + m[1];
  if (/playtomic|customer|clienti|players|giocatori/i.test(n)) return 'pt';
  const h = String(testa || '');
  if (/Tipo di comunicazione|Tipo comunicazione|Operatore;Media/i.test(h)) return 'j5';
  if (/Termine abilitazione/i.test(h)) return 'j2';
  if (/Pagato il|Transaction_Status/i.test(h)) return 'j4';
  if (/Validit. certificato medico/i.test(h)) return 'j1';
  if (/Data vendita|Prodotto/i.test(h)) return 'j3';
  return '';
}
// CSV di Wellness: separatore «;», campi tra virgolette, valori tipo ="Attivo"
function leggiCsv(testo) {
  testo = testo.replace(/^﻿/, '');
  const sep = (testo.split(/\r?\n/)[0].match(/;/g) || []).length >= (testo.split(/\r?\n/)[0].match(/,/g) || []).length ? ';' : ',';
  const righe = []; let riga = [], campo = '', q = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (q) { if (c === '"') { if (testo[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { riga.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && testo[i + 1] === '\n') i++; riga.push(campo); righe.push(riga); riga = []; campo = ''; }
    else campo += c;
  }
  if (campo || riga.length) { riga.push(campo); righe.push(riga); }
  const pulisci = v => String(v == null ? '' : v).trim().replace(/^="?(.*?)"?$/, '$1').trim();
  const testa = (righe.shift() || []).map(pulisci);
  const visti = {}, chiavi = testa.map(h => { if (!h) return ''; visti[h] = (visti[h] || 0) + 1; return visti[h] > 1 ? h + ' (' + visti[h] + ')' : h; });
  return righe.filter(r => r.some(x => String(x).trim())).map(r => {
    const o = {}; chiavi.forEach((k, i) => { if (k) { const v = pulisci(r[i]); if (v !== '') o[k] = v; } }); return o;
  });
}

export async function wCarica(chiave, nomeFile, base64, origine) {
  if (!chiave || chiave !== await segreto('wellness')) return { ok: false };
  if (!/\.csv$/i.test(String(nomeFile || ''))) return { ok: false, msg: 'Per ora Jarvis legge solo i CSV' };
  const testo = Buffer.from(String(base64 || ''), 'base64').toString('utf8');
  const tipo = tipoFile(nomeFile, testo.split(/\r?\n/)[0]);
  if (!tipo) return { ok: false, msg: 'File non riconosciuto' };
  const righe = leggiCsv(testo);
  if (!righe.length) return { ok: false, msg: 'File vuoto' };
  const ora = new Date().toISOString();
  for (let i = 0; i < righe.length; i += 500) {
    const r = await db('/rest/v1/wellness_righe', 'POST', righe.slice(i, i + 500).map(x => ({ tipo, caricato_il: ora, r: x })), { Prefer: 'return=minimal' });
    if (!r.ok) return { ok: false, msg: 'Salvataggio non riuscito' };
  }
  // tiene solo l'ultimo caricamento di ogni tipo
  await db(`/rest/v1/wellness_righe?tipo=eq.${tipo}&caricato_il=lt.${encodeURIComponent(ora)}`, 'DELETE', null, { Prefer: 'return=minimal' });
  await db('/rest/v1/wellness_caricamenti', 'POST', { tipo, nome_file: String(nomeFile).slice(0, 200), righe: righe.length, origine: origine || 'good morning' }, { Prefer: 'return=minimal' });
  return { ok: true, tipo, righe: righe.length };
}
