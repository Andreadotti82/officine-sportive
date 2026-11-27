// Utilities di Google Apps Script, rifatte per Jarvis (stesso comportamento)
import crypto from 'crypto';
import zlib from 'zlib';

const GG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const GG_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MM_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function parti(d, tz) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(d).forEach(x => { p[x.type] = x.value; });
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { y: +p.year, M: +p.month, d: +p.day, H: +p.hour, m: +p.minute, s: +p.second, dow, ms: d.getTime() % 1000 };
}
const z = (n, l) => String(n).padStart(l, '0');

// Come Utilities.formatDate (pattern alla Java SimpleDateFormat; i nomi escono in inglese come su Google)
export function formatDate(date, tz, pattern) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d)) throw new Error('Data non valida');
  const p = parti(d, tz);
  let out = '', i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "'") { const j = pattern.indexOf("'", i + 1); if (j === i + 1) { out += "'"; i += 2; continue; } out += pattern.slice(i + 1, j < 0 ? undefined : j); i = j < 0 ? pattern.length : j + 1; continue; }
    if (!/[A-Za-z]/.test(c)) { out += c; i++; continue; }
    let k = i; while (k < pattern.length && pattern[k] === c) k++;
    const n = k - i;
    switch (c) {
      case 'y': out += n === 2 ? z(p.y % 100, 2) : z(p.y, n); break;
      case 'M': out += n >= 4 ? MM_EN[p.M - 1] : n === 3 ? MM_EN[p.M - 1].slice(0, 3) : z(p.M, n); break;
      case 'd': out += z(p.d, n); break;
      case 'H': out += z(p.H, n); break;
      case 'h': out += z(((p.H + 11) % 12) + 1, n); break;
      case 'm': out += z(p.m, n); break;
      case 's': out += z(p.s, n); break;
      case 'S': out += z(p.ms, n); break;
      case 'E': out += n >= 4 ? GG_EN[p.dow] : GG_EN[p.dow].slice(0, 3); break;
      case 'u': out += String(p.dow === 0 ? 7 : p.dow); break;
      case 'a': out += p.H < 12 ? 'AM' : 'PM'; break;
      case 'D': { const s = Date.UTC(p.y, 0, 1), t = Date.UTC(p.y, p.M - 1, p.d); out += z(Math.round((t - s) / 864e5) + 1, n); break; }
      case 'Z': case 'X': case 'z': { const off = Math.round((Date.UTC(p.y, p.M - 1, p.d, p.H, p.m, p.s) - Math.floor(d.getTime() / 1000) * 1000) / 60000); const sg = off >= 0 ? '+' : '-', a = Math.abs(off); out += c === 'z' ? (tz || '') : sg + z(Math.floor(a / 60), 2) + (c === 'X' ? ':' : '') + z(a % 60, 2); break; }
      default: out += pattern.slice(i, k);
    }
    i = k;
  }
  return out;
}

// Blob come su Google
export class Blob {
  constructor(dati, tipo, nome) {
    this._b = dati == null ? Buffer.alloc(0) : Buffer.isBuffer(dati) ? dati : Array.isArray(dati) ? Buffer.from(dati.map(x => x & 255)) : Buffer.from(String(dati), 'utf8');
    this._t = tipo || 'application/octet-stream'; this._n = nome || null;
  }
  getBytes() { return Array.from(this._b).map(x => (x > 127 ? x - 256 : x)); }
  getDataAsString() { return this._b.toString('utf8'); }
  getContentType() { return this._t; }
  setContentType(t) { this._t = t; return this; }
  getName() { return this._n; }
  setName(n) { this._n = n; return this; }
  setDataFromString(s) { this._b = Buffer.from(String(s), 'utf8'); return this; }
  copyBlob() { return new Blob(Buffer.from(this._b), this._t, this._n); }
  getBlob() { return this; }
  getAs(t) { if (t === this._t) return this; throw new Error('Conversione non disponibile su Jarvis: ' + t); }
  isGoogleType() { return false; }
}
export const aBuffer = x => x instanceof Blob ? x._b : Array.isArray(x) ? Buffer.from(x.map(v => v & 255)) : Buffer.from(String(x), 'utf8');
const firmati = b => Array.from(b).map(x => (x > 127 ? x - 256 : x));

export function creaUtilities(tzDefault) {
  return {
    formatDate: (d, tz, p) => formatDate(d, tz || tzDefault, p),
    formatString: (f, ...a) => { let i = 0; return String(f).replace(/%[sdif]/g, () => String(a[i++])); },
    getUuid: () => crypto.randomUUID(),
    sleep: ms => { const t = Date.now() + Math.min(ms, 5000); while (Date.now() < t) { } },
    base64Encode: x => aBuffer(x).toString('base64'),
    base64EncodeWebSafe: x => aBuffer(x).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64Decode: s => firmati(Buffer.from(String(s), 'base64')),
    base64DecodeWebSafe: s => firmati(Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    newBlob: (d, t, n) => new Blob(Array.isArray(d) ? Buffer.from(d.map(v => v & 255)) : d, t, n),
    gzip: (b, n) => new Blob(zlib.gzipSync(aBuffer(b)), 'application/x-gzip', n || (b && b.getName && b.getName() ? b.getName() + '.gz' : 'archive.gz')),
    ungzip: b => new Blob(zlib.gunzipSync(aBuffer(b)), 'application/octet-stream'),
    computeDigest: (alg, s) => firmati(crypto.createHash(alg).update(aBuffer(s)).digest()),
    computeHmacSha256Signature: (v, k) => firmati(crypto.createHmac('sha256', aBuffer(k)).update(aBuffer(v)).digest()),
    computeHmacSignature: (alg, v, k) => firmati(crypto.createHmac(alg === 'HMAC_SHA_256' ? 'sha256' : alg === 'HMAC_SHA_1' ? 'sha1' : alg === 'HMAC_MD5' ? 'md5' : 'sha512', aBuffer(k)).update(aBuffer(v)).digest()),
    parseCsv: (s, sep) => { const sp = sep || ','; return String(s).split(/\r?\n/).filter(Boolean).map(r => r.split(sp)); },
    DigestAlgorithm: { MD5: 'md5', SHA_1: 'sha1', SHA_256: 'sha256', SHA_512: 'sha512' },
    MacAlgorithm: { HMAC_SHA_256: 'HMAC_SHA_256', HMAC_SHA_1: 'HMAC_SHA_1', HMAC_MD5: 'HMAC_MD5', HMAC_SHA_512: 'HMAC_SHA_512' },
    Charset: { UTF_8: 'utf8', US_ASCII: 'ascii' }
  };
}
export { GG };
