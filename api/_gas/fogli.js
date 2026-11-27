// SpreadsheetApp di Google, rifatto su Jarvis: i fogli stanno su Supabase (tabella gas_fogli),
// si caricano all'inizio dell'esecuzione e le modifiche si salvano alla fine.

const TZ = 'Europe/Rome';

// Valore scritto in una cella: come Google (testo con apostrofo resta testo, numeri e date diventano numeri e date)
function comeScritto(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'object') return String(v);
  const s = String(v);
  if (s.startsWith("'")) return s.slice(1);
  if (/^-?\d+(\.\d+)?$/.test(s.trim()) && s.trim().length < 16 && !/^0\d/.test(s.trim())) return Number(s.trim());
  if (/^-?\d+,\d+$/.test(s.trim())) return Number(s.trim().replace(',', '.'));
  let m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return dataRoma(+m[1], +m[2], +m[3], 0, 0, 0);
  m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) return dataRoma(+m[3], +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  if (s.toUpperCase() === 'TRUE') return true;
  if (s.toUpperCase() === 'FALSE') return false;
  return s;
}
export function dataRoma(y, M, d, H, mi, s) {
  const guess = Date.UTC(y, M - 1, d, H, mi, s);
  const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess)).forEach(x => { p[x.type] = x.value; });
  const comeUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return new Date(guess - (comeUtc - guess));
}
const copia = v => v instanceof Date ? new Date(v.getTime()) : v;

function a1(a1n) {
  const m = String(a1n).replace(/\$/g, '').match(/^(?:'?([^'!]+)'?!)?([A-Z]+)?(\d+)?(?::([A-Z]+)?(\d+)?)?$/i);
  if (!m) throw new Error('Intervallo non valido: ' + a1n);
  const col = s => s ? s.toUpperCase().split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) : null;
  return { foglio: m[1], c1: col(m[2]), r1: m[3] ? +m[3] : null, c2: col(m[4]), r2: m[5] ? +m[5] : null, range: !!m[4] || !!m[5] };
}
const lettera = n => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

class Range {
  constructor(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = Math.max(1, nr || 1); this.nc = Math.max(1, nc || 1); }
  getRow() { return this.r; } getColumn() { return this.c; } getNumRows() { return this.nr; } getNumColumns() { return this.nc; }
  getLastRow() { return this.r + this.nr - 1; } getLastColumn() { return this.c + this.nc - 1; }
  getSheet() { return this.sh; }
  getA1Notation() { return lettera(this.c) + this.r + (this.nr > 1 || this.nc > 1 ? ':' + lettera(this.c + this.nc - 1) + (this.r + this.nr - 1) : ''); }
  getValues() { const v = this.sh._v, out = []; for (let i = 0; i < this.nr; i++) { const riga = v[this.r - 1 + i] || [], o = []; for (let j = 0; j < this.nc; j++) { const x = riga[this.c - 1 + j]; o.push(x === undefined || x === null ? '' : copia(x)); } out.push(o); } return out; }
  getValue() { return this.getValues()[0][0]; }
  getDisplayValues() { return this.getValues().map(r => r.map(x => x instanceof Date ? this.sh.ss.app.formatDate(x, TZ, 'dd/MM/yyyy') : String(x))); }
  getDisplayValue() { return this.getDisplayValues()[0][0]; }
  getFormulas() { return this.getValues().map(r => r.map(() => '')); }
  getFormula() { return ''; }
  setValues(m) {
    if (!Array.isArray(m) || m.length !== this.nr || m.some(r => !Array.isArray(r) || r.length !== this.nc)) throw new Error('Il numero di righe o colonne dei dati non corrisponde all\'intervallo: ' + this.getA1Notation());
    m.forEach((riga, i) => riga.forEach((x, j) => this.sh._set(this.r + i, this.c + j, comeScritto(x)))); return this;
  }
  setValue(x) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh._set(this.r + i, this.c + j, comeScritto(x)); return this; }
  setFormula(f) { return this.setValue(f); } setFormulas(f) { return this.setValues(f); }
  clear() { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sh._set(this.r + i, this.c + j, ''); return this; }
  clearContent() { return this.clear(); }
  offset(dr, dc, nr, nc) { return new Range(this.sh, this.r + dr, this.c + dc, nr || this.nr, nc || this.nc); }
  getCell(r, c) { return new Range(this.sh, this.r + r - 1, this.c + c - 1, 1, 1); }
  sort(spec) { const v = this.getValues(), col = (typeof spec === 'number' ? spec : spec.column) - this.c, asc = typeof spec === 'number' ? true : spec.ascending !== false; v.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1)); return this.setValues(v); }
  activate() { return this; } protect() { return { setDescription() { return this; }, setWarningOnly() { return this; } }; }
}
// tutte le formattazioni: su Jarvis non servono, non fanno niente
['setFontWeight', 'setFontWeights', 'setBackground', 'setBackgrounds', 'setFontColor', 'setFontColors', 'setNumberFormat', 'setNumberFormats', 'setHorizontalAlignment', 'setVerticalAlignment', 'setWrap', 'setWrapStrategy',
  'setFontSize', 'setFontFamily', 'setBorder', 'merge', 'breakApart', 'setNote', 'setDataValidation', 'clearFormat', 'setFontStyle', 'setFontLine', 'setTextRotation', 'clearDataValidations', 'setRichTextValue', 'clearNote', 'insertCheckboxes', 'setShowHyperlink'].forEach(n => { Range.prototype[n] = function () { return this; }; });

class Sheet {
  constructor(ss, s) { this.ss = ss; this.s = s; this._v = s.valori; }
  _set(r, c, x) { while (this._v.length < r) this._v.push([]); const riga = this._v[r - 1]; while (riga.length < c) riga.push(''); riga[c - 1] = x; this.ss._sporca(this.s.nome); }
  getName() { return this.s.nome; } setName(n) { const vecchio = this.s.nome; this.s.nome = n; this.ss._rinomina(vecchio, n); return this; }
  getSheetId() { return this.ss._schede.indexOf(this.s); } getIndex() { return this.ss._schede.indexOf(this.s) + 1; }
  getParent() { return this.ss; }
  getLastRow() { for (let i = this._v.length - 1; i >= 0; i--) if ((this._v[i] || []).some(x => x !== '' && x !== null && x !== undefined)) return i + 1; return 0; }
  getLastColumn() { let m = 0; this._v.forEach(r => { for (let j = (r || []).length - 1; j >= 0; j--) if (r[j] !== '' && r[j] !== null && r[j] !== undefined) { m = Math.max(m, j + 1); break; } }); return m; }
  getMaxRows() { return Math.max(1000, this._v.length); } getMaxColumns() { return Math.max(26, this.getLastColumn()); }
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const x = a1(a);
      const r1 = x.r1 || 1, c1 = x.c1 || 1;
      const r2 = x.range ? (x.r2 || Math.max(this.getLastRow(), r1)) : r1, c2 = x.range ? (x.c2 || Math.max(this.getLastColumn(), c1)) : c1;
      return new Range(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
    }
    if (a < 1 || b < 1) throw new Error('Le coordinate dell\'intervallo non sono valide.');
    if (c !== undefined && c < 1) throw new Error('Il numero di righe dell\'intervallo deve essere almeno 1.');
    if (d !== undefined && d < 1) throw new Error('Il numero di colonne dell\'intervallo deve essere almeno 1.');
    return new Range(this, a, b, c || 1, d || 1);
  }
  getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  appendRow(riga) { const r = this.getLastRow() + 1; riga.forEach((x, j) => this._set(r, j + 1, comeScritto(x))); if (!riga.length) this._set(r, 1, ''); return this; }
  deleteRow(r) { this._v.splice(r - 1, 1); this.ss._sporca(this.s.nome); return this; }
  deleteRows(r, n) { this._v.splice(r - 1, n); this.ss._sporca(this.s.nome); return this; }
  insertRowBefore(r) { this._v.splice(r - 1, 0, []); this.ss._sporca(this.s.nome); return this; }
  insertRowAfter(r) { this._v.splice(r, 0, []); this.ss._sporca(this.s.nome); return this; }
  insertRowsBefore(r, n) { for (let i = 0; i < n; i++) this._v.splice(r - 1, 0, []); this.ss._sporca(this.s.nome); return this; }
  insertRowsAfter(r, n) { for (let i = 0; i < n; i++) this._v.splice(r, 0, []); this.ss._sporca(this.s.nome); return this; }
  deleteColumn(c) { this._v.forEach(r => r.splice(c - 1, 1)); this.ss._sporca(this.s.nome); return this; }
  insertColumnAfter(c) { this._v.forEach(r => { if (r.length > c) r.splice(c, 0, ''); }); this.ss._sporca(this.s.nome); return this; }
  clear() { this._v.length = 0; this.ss._sporca(this.s.nome); return this; }
  clearContents() { return this.clear(); }
  getFrozenRows() { return this.s.bloccate || 0; } setFrozenRows(n) { this.s.bloccate = n; this.ss._sporca(this.s.nome); return this; }
  getFrozenColumns() { return 0; }
  hideSheet() { this.s.nascosta = true; this.ss._sporca(this.s.nome); return this; } showSheet() { this.s.nascosta = false; this.ss._sporca(this.s.nome); return this; }
  isSheetHidden() { return !!this.s.nascosta; }
  activate() { return this; } getActiveRange() { return null; }
}
['setFrozenColumns', 'setColumnWidth', 'setColumnWidths', 'setRowHeight', 'setRowHeights', 'autoResizeColumn', 'autoResizeColumns', 'setTabColor', 'hideColumns', 'showColumns', 'hideRows', 'showRows', 'setConditionalFormatRules', 'protect', 'setHiddenGridlines', 'clearFormats', 'clearConditionalFormatRules'].forEach(n => { Sheet.prototype[n] = function () { return this; }; });
Sheet.prototype.getConditionalFormatRules = function () { return []; };

export class Spreadsheet {
  constructor(app, id, nome, schede) { this.app = app; this.id = id; this.nome = nome || id; this._schede = schede; this._sp = new Set(); this._cancellate = new Set(); }
  _sporca(n) { this._sp.add(n); this.app._fogliSporchi.add(this.id); }
  _rinomina(v, n) { this._cancellate.add(v); this._sporca(n); }
  getId() { return this.id; } getName() { return this.nome; } getUrl() { return 'https://officine-sportive.vercel.app/foglio/' + this.id; }
  getSheets() { return this._schede.map(s => new Sheet(this, s)); }
  getSheetByName(n) { const s = this._schede.find(x => x.nome === n); return s ? new Sheet(this, s) : null; }
  getSheetById(i) { const s = this._schede[i]; return s ? new Sheet(this, s) : null; }
  insertSheet(n) { if (typeof n !== 'string') n = 'Foglio' + (this._schede.length + 1); if (this._schede.some(x => x.nome === n)) throw new Error('Esiste già un foglio con il nome "' + n + '".'); const s = { nome: n, valori: [], bloccate: 0, nascosta: false }; this._schede.push(s); this._sporca(n); return new Sheet(this, s); }
  deleteSheet(sh) { const i = this._schede.indexOf(sh.s); if (i >= 0) { this._schede.splice(i, 1); this._cancellate.add(sh.s.nome); this.app._fogliSporchi.add(this.id); } }
  getActiveSheet() { return this.getSheets()[0]; } getSheetName() { return this._schede[0] && this._schede[0].nome; }
  getRange(a) { const x = a1(a); const sh = x.foglio ? this.getSheetByName(x.foglio) : this.getActiveSheet(); return sh.getRange(a.replace(/^.*!/, '')); }
  toast() { } getSpreadsheetTimeZone() { return TZ; } setSpreadsheetTimeZone() { } addEditor() { return this; } getEditors() { return []; } getOwner() { return null; }
}

// Converte da/al formato salvato su Supabase (date come {$d: millisecondi})
export const daDb = v => (v && typeof v === 'object' && '$d' in v) ? new Date(v.$d) : v;
export const perDb = v => v instanceof Date ? { $d: v.getTime() } : v;
