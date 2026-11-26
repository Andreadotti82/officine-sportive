/* JARVIS · codice di App Contratti (caricato dal caricatore). Versione 2026-11-21.1: cessione dell'abbonamento dal back office. */
/**
 * App Contratti · Officine Sportive
 * Calcoli puri (nessuna API Google): codice fiscale, date, pro rata, piano di pagamento.
 * Questo file viene testato anche fuori da Google (Node) per verificare i calcoli.
 */

var MESI_IT = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];

/* ------------------------------------------------------------------ */
/* Date                                                                */
/* ------------------------------------------------------------------ */
function dt_(y, m, d) { return new Date(y, m, d, 12, 0, 0); }               // mezzogiorno: evita salti d'ora
function giorniNelMese_(y, m) { return new Date(y, m + 1, 0).getDate(); }
function ultimoGiorno_(y, m) { return dt_(y, m, giorniNelMese_(y, m)); }
function aggiungiMesi_(d, n) { return dt_(d.getFullYear(), d.getMonth() + n, 1); }
function aggiungiGiorni_(d, n) { return dt_(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function fmtData_(d) {
  if (!d) return '';
  return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
}
function fmtDataLunga_(d) { return d.getDate() + ' ' + MESI_IT[d.getMonth()] + ' ' + d.getFullYear(); }
function euro_(n) {
  var v = Math.round(Number(n || 0) * 100) / 100;
  var s = v.toFixed(2).replace('.', ',');
  return '€ ' + s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function arrotonda_(n) { return Math.round(Number(n) * 100) / 100; }
/** Pro rata: sempre arrotondato per difetto all'euro intero (es. 38,71 → 38,00). */
function euroInteri_(n) { return Math.floor(arrotonda_(n) + 1e-9); }

/* ------------------------------------------------------------------ */
/* Codice fiscale                                                      */
/* ------------------------------------------------------------------ */
var CF_MESI = 'ABCDEHLMPRST';
var CF_OMOCODIA = 'LMNPQRSTUV';
var CF_DISPARI = {
  '0':1,'1':0,'2':5,'3':7,'4':9,'5':13,'6':15,'7':17,'8':19,'9':21,
  'A':1,'B':0,'C':5,'D':7,'E':9,'F':13,'G':15,'H':17,'I':19,'J':21,'K':2,'L':4,'M':18,'N':20,
  'O':11,'P':3,'Q':6,'R':8,'S':12,'T':14,'U':16,'V':10,'W':22,'X':25,'Y':24,'Z':23
};

function cfPulisci_(cf) { return String(cf || '').toUpperCase().replace(/\s+/g, ''); }

function cfControllo_(cf15) {
  var s = 0;
  for (var i = 0; i < 15; i++) {
    var c = cf15.charAt(i);
    if ((i + 1) % 2 === 1) s += CF_DISPARI[c];
    else s += /[0-9]/.test(c) ? Number(c) : c.charCodeAt(0) - 65;
  }
  return String.fromCharCode(65 + (s % 26));
}

/** Toglie l'omocodia (lettere al posto delle cifre nelle posizioni numeriche). */
function cfNormalizza_(cf) {
  var pos = [6, 7, 9, 10, 12, 13, 14];
  var a = cf.split('');
  pos.forEach(function (p) {
    var k = CF_OMOCODIA.indexOf(a[p]);
    if (k >= 0) a[p] = String(k);
  });
  return a.join('');
}

/**
 * Analizza un codice fiscale. Restituisce { valido, errore, sesso, nascita (Date), codiceComune }.
 * oggi: data di riferimento per capire il secolo di nascita.
 */
function analizzaCF(cf, oggi) {
  cf = cfPulisci_(cf);
  oggi = oggi || new Date();
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) {
    return { valido: false, errore: 'Il codice fiscale non ha un formato valido.' };
  }
  if (cfControllo_(cf.substr(0, 15)) !== cf.charAt(15)) {
    return { valido: false, errore: 'Il codice fiscale non è corretto: controlla di averlo scritto bene.' };
  }
  var n = cfNormalizza_(cf);
  var yy = Number(n.substr(6, 2));
  var mese = CF_MESI.indexOf(n.charAt(8));
  var gg = Number(n.substr(9, 2));
  var sesso = gg > 40 ? 'F' : 'M';
  if (gg > 40) gg -= 40;
  var annoOggi = oggi.getFullYear() % 100;
  var anno = (yy > annoOggi ? 1900 : 2000) + yy;
  var nascita = dt_(anno, mese, gg);
  if (nascita.getMonth() !== mese || gg < 1) {
    return { valido: false, errore: 'La data di nascita nel codice fiscale non è valida.' };
  }
  return { valido: true, cf: cf, sesso: sesso, nascita: nascita, codiceComune: n.substr(11, 4) };
}

function cfConsonanti_(s) { return s.replace(/[^BCDFGHJKLMNPQRSTVWXYZ]/g, ''); }
function cfVocali_(s) { return s.replace(/[^AEIOU]/g, ''); }
function cfPrepara_(s) {
  return String(s || '').toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z]/g, '');
}
function cfCodiceCognome_(cognome) {
  var s = cfPrepara_(cognome);
  return (cfConsonanti_(s) + cfVocali_(s) + 'XXX').substr(0, 3);
}
function cfCodiceNome_(nome) {
  var s = cfPrepara_(nome);
  var c = cfConsonanti_(s);
  if (c.length >= 4) return c.charAt(0) + c.charAt(2) + c.charAt(3);
  return (c + cfVocali_(s) + 'XXX').substr(0, 3);
}

/** Controlla che nome e cognome corrispondano al codice fiscale. */
function verificaNomeCF(nome, cognome, cf) {
  cf = cfPulisci_(cf);
  return cfCodiceCognome_(cognome) === cf.substr(0, 3) && cfCodiceNome_(nome) === cf.substr(3, 3);
}

function etaAl_(nascita, data) {
  var e = data.getFullYear() - nascita.getFullYear();
  if (data.getMonth() < nascita.getMonth() ||
      (data.getMonth() === nascita.getMonth() && data.getDate() < nascita.getDate())) e--;
  return e;
}

/* ------------------------------------------------------------------ */
/* Piano dell'abbonamento                                              */
/* ------------------------------------------------------------------ */

/**
 * abb: riga del listino
 *   { id, nome, area, tipo: 'lungo'|'breve'|'giornaliero', durataMesi, prezzo, iscrizione,
 *     pagamento: 'mensile'|'annuale'|'unico', rinnovo: true|false, fineStagione: 'MM-GG'|'' ,
 *     fasciaOraria, junior }
 * promo: { codice, descrizione, mesiProrataExtra, importoProrataMese (null = calcolo normale),
 *          primaRataAllaFirma (true/false/null) } oppure null
 * firma: Date del primo giorno di accesso (da qui parte il pro rata)
 * opz: { penale, includiGiornoIscrizione (default true), primaRataAllaFirma (default true),
 *        dataFirma: Date della firma (per la garanzia 14 giorni; default = primo giorno) }
 */
function calcolaPiano(abb, promo, firma, opz) {
  opz = opz || {};
  var dataFirma = opz.dataFirma || firma;
  var includi = opz.includiGiornoIscrizione !== false;
  var omaggio = !!(promo && promo.omaggio);
  var prezzo = omaggio ? 0 : Number(abb.prezzo) || 0;
  // Convenzioni: prezzo della rata fisso oppure sconto in percentuale (valgono per tutta la durata)
  if (!omaggio && promo && promo.prezzoRata !== null && promo.prezzoRata !== undefined && promo.prezzoRata !== '' && !isNaN(Number(promo.prezzoRata))) prezzo = Number(promo.prezzoRata);
  else if (!omaggio && promo && Number(promo.scontoPercento) > 0) prezzo = arrotonda_(prezzo * (1 - Number(promo.scontoPercento) / 100));
  var iscrizione = omaggio ? 0 : Number(abb.iscrizione) || 0;
  var p = {
    abbonamento: abb.nome, area: abb.area, tipo: abb.tipo,
    firma: dataFirma, primoGiorno: firma,
    garanziaFino: abb.tipo === 'lungo' && String(abb.area).toLowerCase() !== 'centro estivo' ? aggiungiGiorni_(dataFirma, 14) : null,
    iscrizione: arrotonda_(iscrizione), prezzo: arrotonda_(prezzo), pagamento: abb.pagamento,
    rinnovo: !!abb.rinnovo, fasciaOraria: abb.fasciaOraria || '',
    prorata: [], prorataTotale: 0, primaRataAllaFirma: false,
    totaleFirma: 0, righeFirma: [], promo: promo ? promo.descrizione || promo.codice : '',
    penale: opz.penale
  };

  /* Upgrade (solo dal back office): parte il 1° del mese dopo la firma, tiene la scadenza
     dell'abbonamento che sostituisce, nessun pagamento alla firma, nuova rata dal mese dopo. */
  if (opz.upgrade && opz.upgrade.scadenza) {
    var iniU = dt_(dataFirma.getFullYear(), dataFirma.getMonth() + 1, 1);
    p.upgrade = true; p.inizio = iniU; p.primoGiorno = iniU; p.scadenza = opz.upgrade.scadenza;
    p.garanziaFino = null; p.primaRataAllaFirma = false; p.totaleFirma = 0;
    p.pianoRate = 'Rata mensile di ' + euro_(prezzo) + ' addebitata il giorno 1 di ogni mese dal ' + fmtData_(iniU) +
      ', fino alla scadenza' + (p.rinnovo ? ' e a ogni rinnovo' : '');
    if (opz.upgrade.cessione) {   // cessione: accesso da subito, le rate proseguono quelle del socio che cede
      p.cessione = true; p.primoGiorno = dataFirma;
      p.pianoRate = 'Rata mensile di ' + euro_(prezzo) + ' addebitata il giorno 1 di ogni mese dal ' + fmtData_(iniU) +
        ', in prosecuzione delle rate dell\'abbonamento ceduto, fino alla scadenza' + (p.rinnovo ? ' e a ogni rinnovo' : '');
    }
    p.mesiDurata = mesiTra_(iniU, p.scadenza);
    if (p.rinnovo && abb.tipo !== 'breve') {
      var mpU = aggiungiMesi_(dt_(p.scadenza.getFullYear(), p.scadenza.getMonth(), 1), -1);
      p.disdettaEntro = dt_(mpU.getFullYear(), mpU.getMonth(), 5);
    } else {
      p.disdettaEntro = null;
    }
    return p;
  }

  /* Giornaliero: un giorno, niente pro rata, rinnovo, disdetta. */
  if (abb.tipo === 'giornaliero') {
    p.inizio = firma; p.scadenza = firma; p.rinnovo = false; p.disdettaEntro = null;
    p.totaleFirma = arrotonda_(prezzo + iscrizione);
    if (iscrizione) p.righeFirma.push({ voce: 'Iscrizione', importo: iscrizione });
    p.righeFirma.push({ voce: 'Abbonamento giornaliero del ' + fmtData_(firma), importo: prezzo });
    p.pianoRate = 'Pagamento unico alla firma';
    return p;
  }

  var rataMese = abb.pagamento === 'annuale' ? prezzo / 12 : prezzo;

  /* Pro rata: dal giorno di accesso a fine mese (+ eventuali mesi extra di promo). */
  var y = firma.getFullYear(), m = firma.getMonth(), d = firma.getDate();
  var extra = promo && promo.mesiProrataExtra ? Number(promo.mesiProrataExtra) : 0;
  // Importi del pro rata: un numero (uguale per tutti i mesi) o un elenco "0;9;9" (uno per mese, l'ultimo si ripete)
  var importi = null;
  if (omaggio) importi = [0];
  else if (promo && promo.importoProrataMese !== null && promo.importoProrataMese !== undefined && promo.importoProrataMese !== '') {
    importi = String(promo.importoProrataMese).split(/[;\/]/).map(function (x) { return Number(String(x).replace(',', '.').trim()); })
      .filter(function (x) { return !isNaN(x); });
    if (!importi.length) importi = null;
  }
  var importoFisso = importi ? importi[0] : null;
  function importoMese_(i) { return importi ? importi[Math.min(i, importi.length - 1)] : null; }
  var inizio;
  var fisso = promo && promo.inizioFisso ? promo.inizioFisso : null;
  if (fisso && typeof fisso.getFullYear !== 'function') { fisso = new Date(fisso); }   // dopo il salvataggio in cache è una stringa
  if (fisso) fisso = dt_(fisso.getFullYear(), fisso.getMonth(), 1);
  if (fisso) {
    // Promozione a calendario: l'abbonamento parte sempre dalla data fissa; il mese della firma
    // vale il primo importo, i mesi seguenti fino alla partenza l'ultimo importo dell'elenco.
    var nMesi = (fisso.getFullYear() * 12 + fisso.getMonth()) - (y * 12 + m);
    for (var q = 0; q < nMesi; q++) {
      var mq = aggiungiMesi_(dt_(y, m, 1), q);
      var gq = giorniNelMese_(mq.getFullYear(), mq.getMonth());
      var daq = q === 0 ? firma : mq;
      var giorniQ = q === 0 ? gq - d + (includi ? 1 : 0) : gq;
      var impQ = importi ? importoMese_(q) : (q === 0 ? rataMese / gq * giorniQ : rataMese);
      p.prorata.push({ periodo: fmtData_(daq) + ' – ' + fmtData_(ultimoGiorno_(mq.getFullYear(), mq.getMonth())),
                       mese: MESI_IT[mq.getMonth()] + ' ' + mq.getFullYear(), giorni: giorniQ, importo: euroInteri_(impQ) });
    }
    inizio = dt_(fisso.getFullYear(), fisso.getMonth(), 1);
  } else if (d === 1 && !extra) {
    inizio = dt_(y, m, 1);
  } else {
    if (d !== 1) {
      var gm = giorniNelMese_(y, m);
      var giorni = gm - d + (includi ? 1 : 0);
      var imp = importi ? importoMese_(0) : rataMese / gm * giorni;
      p.prorata.push({ periodo: fmtData_(firma) + ' – ' + fmtData_(ultimoGiorno_(y, m)),
                       mese: MESI_IT[m] + ' ' + y, giorni: giorni, importo: euroInteri_(imp) });
    }
    var primoExtra = d === 1 ? 0 : 1;
    for (var k = 0; k < extra; k++) {
      var mm = aggiungiMesi_(dt_(y, m, 1), primoExtra + k);
      var imp2 = importi ? importoMese_(primoExtra + k) : rataMese;
      p.prorata.push({ periodo: fmtData_(mm) + ' – ' + fmtData_(ultimoGiorno_(mm.getFullYear(), mm.getMonth())),
                       mese: MESI_IT[mm.getMonth()] + ' ' + mm.getFullYear(), giorni: giorniNelMese_(mm.getFullYear(), mm.getMonth()),
                       importo: euroInteri_(imp2) });
    }
    inizio = aggiungiMesi_(dt_(y, m, 1), primoExtra + extra);
  }
  p.inizio = inizio;
  p.prorataTotale = arrotonda_(p.prorata.reduce(function (s, r) { return s + r.importo; }, 0));

  /* Scadenza */
  if (abb.fineStagione) {
    var fs = String(abb.fineStagione).split('-');            // 'MM-GG'
    var fm = Number(fs[0]) - 1, fg = Number(fs[1]);
    var annoFine = inizio.getMonth() > fm ? inizio.getFullYear() + 1 : inizio.getFullYear();
    p.scadenza = dt_(annoFine, fm, fg);
  } else {
    var ultimoMese = aggiungiMesi_(inizio, (Number(abb.durataMesi) || 1) - 1);
    p.scadenza = ultimoGiorno_(ultimoMese.getFullYear(), ultimoMese.getMonth());
  }

  /* Disdetta: entro il 5 del mese precedente la scadenza (solo se c'è rinnovo). */
  if (p.rinnovo && abb.tipo === 'breve') {
    p.disdettaEntro = null;                                // breve termine: art. 3.3, nessuna data fissa
  } else if (p.rinnovo) {
    var mesePrima = aggiungiMesi_(dt_(p.scadenza.getFullYear(), p.scadenza.getMonth(), 1), -1);
    p.disdettaEntro = dt_(mesePrima.getFullYear(), mesePrima.getMonth(), 5);
    p.disdettaOgniAnno = abb.tipo === 'breve' || Number(abb.durataMesi) !== 12 ? '' : '5 ' + MESI_IT[mesePrima.getMonth()];   // "di ogni anno" solo per i 12 mesi
  } else {
    p.disdettaEntro = null;
  }

  /* Cosa si paga alla firma */
  if (iscrizione) p.righeFirma.push({ voce: 'Quota di iscrizione', importo: iscrizione });
  p.prorata.forEach(function (r) {
    p.righeFirma.push({ voce: 'Pro rata ' + r.mese + (importoFisso !== null ? ' (promozione)' : ' (' + r.giorni + ' giorni)'), importo: r.importo });
  });
  var primaRata = promo && promo.primaRataAllaFirma !== null && promo.primaRataAllaFirma !== undefined && promo.primaRataAllaFirma !== ''
    ? !!promo.primaRataAllaFirma : (opz.primaRataAllaFirma !== false);
  var meseInizio = MESI_IT[inizio.getMonth()] + ' ' + inizio.getFullYear();

  if (abb.pagamento === 'annuale') {
    p.primaRataAllaFirma = true;
    p.righeFirma.push({ voce: 'Abbonamento annuale anticipato (' + meseInizio + ' – ' + MESI_IT[p.scadenza.getMonth()] + ' ' + p.scadenza.getFullYear() + ')', importo: prezzo });
    p.pianoRate = 'Pagamento annuale anticipato di ' + euro_(prezzo) + (p.rinnovo ? ', a ogni rinnovo' : '');
  } else if (abb.pagamento === 'unico') {
    p.primaRataAllaFirma = true;
    p.righeFirma.push({ voce: 'Abbonamento', importo: prezzo });
    p.pianoRate = 'Pagamento unico';
  } else {
    p.primaRataAllaFirma = primaRata;
    var mesiDurata = mesiTra_(inizio, p.scadenza);
    if (primaRata) {
      p.righeFirma.push({ voce: 'Prima rata (' + meseInizio + ')', importo: prezzo });
      var daRata = aggiungiMesi_(inizio, 1);
      var restanti = mesiDurata - 1;
      p.pianoRate = restanti > 0
        ? 'Rata mensile di ' + euro_(prezzo) + ' addebitata il giorno 1 di ogni mese dal ' + fmtData_(daRata) + ', fino alla scadenza' + (p.rinnovo ? ' e a ogni rinnovo' : '')
        : 'Nessuna altra rata nel periodo';
    } else {
      p.pianoRate = 'Rata mensile di ' + euro_(prezzo) + ' addebitata il giorno 1 di ogni mese dal ' + fmtData_(inizio) + ', fino alla scadenza' + (p.rinnovo ? ' e a ogni rinnovo' : '');
    }
    p.mesiDurata = mesiDurata;
  }
  if (omaggio) {
    p.righeFirma = [{ voce: 'Abbonamento omaggio', importo: 0 }];
    p.pianoRate = 'Abbonamento omaggio: nessun pagamento';
    p.primaRataAllaFirma = false;
  }
  p.omaggio = omaggio;
  p.totaleFirma = arrotonda_(p.righeFirma.reduce(function (s, r) { return s + Number(r.importo); }, 0));
  return p;
}

function mesiTra_(inizio, scadenza) {
  return (scadenza.getFullYear() - inizio.getFullYear()) * 12 + (scadenza.getMonth() - inizio.getMonth()) + 1;
}

/* Per i test in Node */
if (typeof module !== 'undefined') {
  module.exports = { analizzaCF: analizzaCF, verificaNomeCF: verificaNomeCF, calcolaPiano: calcolaPiano,
                     fmtData_: fmtData_, euro_: euro_, etaAl_: etaAl_, cfControllo_: cfControllo_, dt_: dt_ };
}/**
 * App Contratti · Officine Sportive
 * Web app pubblica: crea e firma i contratti (OTP).
 * Back office nascosto: accesso solo con PIN verificato sul server.
 *
 * Pubblicazione: Distribuisci > Nuova distribuzione > App web
 *   Esegui come: Me · Chi ha accesso: Chiunque
 */

var VERSIONE = '1.0';
var MITTENTE = 'Officine Sportive – No reply';   // nome mittente di tutte le mail
var URL_LOGO = 'https://www.officinesportive.it/wp-content/uploads/2025/11/logo-officine-sportive-top.png';
var URL_COMUNI = 'https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json';

var OTP_VALIDITA_MIN = 10;
var OTP_TENTATIVI = 5;
var OTP_INVII_MAX = 3;
var BO_TENTATIVI_DISPOSITIVO = 5;
var BO_TENTATIVI_GLOBALI_ORA = 20;
var BO_SESSIONE_SEC = 2 * 60 * 60;

/* ================================================================== */
/* Installazione (una sola volta, dall'editor)                         */
/* ================================================================== */

function setup() {
  soloProprietario_();
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SHEET_ID')) {
    Logger.log('App già installata. Foglio: ' + SpreadsheetApp.openById(props.getProperty('SHEET_ID')).getUrl());
    return;
  }
  var ss = SpreadsheetApp.create('App Contratti · Officine Sportive · DATI (riservato)');
  var cartella = DriveApp.createFolder('App Contratti · PDF firmati (riservato)');
  props.setProperty('SHEET_ID', ss.getId());
  props.setProperty('FOLDER_ID', cartella.getId());

  var f = ss.getSheets()[0]; f.setName('Impostazioni');
  scriviTabella_(f, ['Chiave', 'Valore', 'Nota'], [
    ['NomeCircolo', 'Officine Sportive', ''],
    ['Societa', 'Gate Fitness S.S.D. a r.l.', ''],
    ['Sede', 'Via Fratelli Wright, 00054 Fiumicino (RM)', ''],
    ['EmailCircolo', 'info@officinesportive.it', 'Indirizzo per la disdetta e le risposte dei soci'],
    ['EmailStaff', '', 'Se compilato, riceve una copia di ogni contratto firmato (per Wellness in Cloud)'],
    ['EmailAllarmi', Session.getEffectiveUser().getEmail(), 'Riceve gli allarmi di accesso al back office'],
    ['Penale', 6, 'Euro, riportata nel Riepilogo (art. 4.3)'],
    ['PEC', '', 'Riportata nell\'informativa privacy'],
    ['DataInformativa', '16/11/2026', ''],
    ['PrimaRataAllaFirma', 'SI', 'SI = alla firma si pagano pro rata + prima rata'],
    ['GiornoIscrizioneNelProRata', 'SI', 'SI = il giorno della firma si conta nel pro rata'],
    ['CanaleOTP', 'EMAIL', 'EMAIL (prova) oppure SMS quando il provider è attivo'],
    ['MittenteSMS', '', 'Vuoto = mittente standard di Skebby'],
    ['ModalitaPagamento', METODI_DEFAULT, 'Modalità per pagare alla firma, separate da ;']
  ]);

  scriviTabella_(ss.insertSheet('Listino'),
    ['Attivo', 'ID', 'Area', 'Nome', 'Tipo', 'DurataMesi', 'Prezzo', 'Iscrizione', 'Pagamento', 'Rinnovo', 'FineStagione', 'FasciaOraria', 'Junior', 'Descrizione'], [
    ['SI', 'OPEN12', 'Fitness', 'Open 12', 'lungo', 12, 55, 0, 'mensile', 'SI', '', '', 'NO', 'Tutto il Circolo, 12 mesi'],
    ['SI', 'MORNING', 'Fitness', 'Open 12 Morning', 'lungo', 12, 49, 0, 'mensile', 'SI', '', '7:00 – 13:30', 'NO', 'Tutto il Circolo la mattina, 12 mesi'],
    ['SI', 'PREPAY', 'Fitness', 'Open 12 Prepay', 'lungo', 12, 620, 0, 'annuale', 'SI', '', '', 'NO', 'Tutto il Circolo, 12 mesi pagati in anticipo'],
    ['SI', 'DQV', 'Fitness', 'Disdici quando vuoi', 'breve', 1, 79, 0, 'mensile', 'SI', '', '', 'NO', 'Mensile senza vincolo'],
    ['SI', 'GIORNALIERO', 'Fitness', 'Giornaliero', 'giornaliero', 0, 29, 0, 'unico', 'NO', '', '', 'NO', 'Un giorno'],
    ['SI', 'GENITORE', 'Fitness', 'Open 12 Genitore', 'lungo', 12, 39, 0, 'mensile', 'SI', '', '', 'NO', 'Tutto il Circolo, 12 mesi · prezzo riservato al genitore con un figlio iscritto alla scuola nuoto (art. 3.5)'],
    ['SI', 'PADELOPEN', 'Padel', 'Open 12 + Padel Illimitato', 'lungo', 12, 69, 0, 'mensile', 'SI', '', '', 'NO', 'Tutto il Circolo + padel, 12 mesi'],
    ['SI', 'PADELUNL', 'Padel', 'Padel Unlimited', 'lungo', 12, 29, 0, 'mensile', 'SI', '', '', 'NO', 'Padel, 12 mesi'],
    ['SI', 'NUOTO2', 'Scuola nuoto', 'Stagionale bisettimanale', 'lungo', 0, 75, 49, 'mensile', 'NO', '05-31', '', 'SI', 'Due lezioni a settimana fino a fine stagione'],
    ['SI', 'NUOTO1', 'Scuola nuoto', 'Stagionale monosettimanale', 'lungo', 0, 60, 49, 'mensile', 'NO', '05-31', '', 'SI', 'Una lezione a settimana fino a fine stagione'],
    ['SI', 'NUOTODQV', 'Scuola nuoto', 'Disdici quando vuoi', 'breve', 1, 99, 49, 'mensile', 'NO', '05-31', '', 'SI', 'Mensile senza vincolo, fino a fine stagione']
  ]);

  scriviTabella_(ss.insertSheet('Promo'),
    ['Attivo', 'Codice', 'ValidoDal', 'ValidoAl', 'Abbonamenti', 'Descrizione', 'MesiProrataExtra', 'ImportoProrataMese', 'PrimaRataAllaFirma', 'Omaggio', 'InizioAbbonamento', 'PrezzoRata', 'ScontoPercento'], [
    ['SI', 'PRORATA0', '', '', 'TUTTI', 'Pro rata gratuito', 0, 0, '', 'NO', '', '', ''],
    ['NO', 'PROMO1', '', '', 'TUTTI', 'Promozione del mese (da compilare)', 0, '', '', 'NO', '', '', ''],
    ['SI', 'VIP82', '', '', 'TUTTI', 'Abbonamento omaggio', 0, 0, '', 'SI', '', '', '']
  ]);

  scriviTabella_(ss.insertSheet('PIN'), ['Attivo', 'Nome', 'PIN'], [['NO', 'Esempio', '0000']]);

  scriviTabella_(ss.insertSheet('Contratti'),
    ['Numero', 'Firmato il', 'Stato', 'Area', 'Abbonamento', 'Intestatario', 'Codice fiscale', 'Email', 'Cellulare',
     'Junior', 'CF Junior', 'Inizio', 'Scadenza', 'Disdetta entro', 'Pagato alla firma', 'Rata', 'Promo', 'PDF', 'ID file', 'Impronta SHA-256', 'Dati (JSON)'], []);

  scriviTabella_(ss.insertSheet('Registro'), ['Data e ora', 'Riferimento', 'Evento', 'Dettaglio'], []);
  scriviTabella_(ss.insertSheet('Comuni'), ['Codice', 'Comune', 'Provincia', 'CAP'], []);

  caricaComuni();
  Logger.log('Installazione completata. Foglio dati: ' + ss.getUrl());
}

/** Scarica l'elenco dei comuni italiani (codice catastale → nome). Si può rilanciare per aggiornarlo. */
function caricaComuni() {
  soloProprietario_();
  var dati = JSON.parse(UrlFetchApp.fetch(URL_COMUNI).getContentText());
  var righe = dati.map(function (c) {
    return [c.codiceCatastale, c.nome, c.sigla, (c.cap || []).join(' ')];
  });
  var sh = foglio_('Comuni');
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 4).clearContent();
  sh.getRange(2, 1, righe.length, 4).setValues(righe);
  Logger.log('Comuni caricati: ' + righe.length);
}

/** Da eseguire una volta dall'editor: attiva gli automatismi di ogni mattina (mail di benvenuto ai nuovi soci, avviso promozioni in scadenza). */
function attivaAutomatismi() {
  soloProprietario_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'controllaPromoInScadenza' || f === 'inviaInfoUtili' || f === 'inviaContrattiSoci') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('inviaInfoUtili').timeBased().everyDays(1).atHour(9).inTimezone('Europe/Rome').create();
  ScriptApp.newTrigger('controllaPromoInScadenza').timeBased().everyDays(1).atHour(9).inTimezone('Europe/Rome').create();
  ScriptApp.newTrigger('inviaContrattiSoci').timeBased().everyMinutes(10).create();
  Logger.log('Automatismi attivati: contratto al socio 30 minuti dopo la firma; ogni mattina alle 9 mail di benvenuto e controllo delle promozioni in scadenza.');
}
function attivaPromemoriaPromo() { attivaAutomatismi(); }

/** Ogni mattina: avvisa due giorni prima della data di fine (ValidoAl) di ogni promozione attiva. */
function controllaPromoInScadenza() {
  var tra2 = aggiungiGiorni_(oggi_(), 2);
  var a = impostazioni_().EmailAllarmi;
  if (!a) return;
  righe_('Promo').forEach(function (r) {
    if (!si_(r.Attivo) || si_(r.Omaggio) || normalizzaCodice_(r.Codice) === 'PRORATA0') return;
    var al = dataDa_(r.ValidoAl);
    if (!al || al.getTime() !== tra2.getTime()) return;
    MailApp.sendEmail({
      to: a, name: MITTENTE, inlineImages: { jarvis: logoJarvis_() }, subject: '⏰ La promozione ' + r.Codice + ' scade dopodomani',
      htmlBody: cornice_('<p style="margin:0 0 14px">La promozione <b>' + esc_(r.Codice) + '</b> (' + esc_(r.Descrizione) + ') scade <b>dopodomani, ' + fmtDataLunga_(al) + '</b>.</p>' +
        '<p style="margin:0 0 14px">Dal giorno dopo il codice non funzionerà più e i ragazzi non potranno usarlo. Prepara la nuova promozione e aggiungila nel foglio, scheda Promo, con il suo nome.</p>' +
        '<p style="margin:0 0 14px">Il codice <b>PRORATA0</b> resta sempre valido: con quello il socio non paga il pro rata del mese in cui si iscrive.</p>' +
        firmaJarvis_())
    });
    registra_('PROMO', 'Avviso scadenza', r.Codice + ' scade il ' + fmtData_(al));
  });
}

function soloProprietario_() {
  var attivo = Session.getActiveUser().getEmail();
  if (!attivo || attivo !== Session.getEffectiveUser().getEmail()) throw new Error('Operazione non consentita.');
}

function scriviTabella_(sh, intestazione, righe) {
  sh.clear();
  sh.getRange(1, 1, 1, intestazione.length).setValues([intestazione])
    .setFontWeight('bold').setBackground('#13556F').setFontColor('#FFFFFF');
  if (righe.length) sh.getRange(2, 1, righe.length, intestazione.length).setValues(righe);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, intestazione.length);
}

/* ================================================================== */
/* Accesso ai dati                                                     */
/* ================================================================== */

function ss_() { return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')); }
function foglio_(nome) { return ss_().getSheetByName(nome); }

function righe_(nome) {
  var v = foglio_(nome).getDataRange().getValues();
  var h = v.shift();
  return v.filter(function (r) { return r.join('') !== ''; }).map(function (r) {
    var o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o;
  });
}

function impostazioni_() {
  var c = CacheService.getScriptCache().get('IMPOSTAZIONI');
  if (c) return JSON.parse(c);
  var o = {};
  righe_('Impostazioni').forEach(function (r) { o[r.Chiave] = r.Valore; });
  CacheService.getScriptCache().put('IMPOSTAZIONI', JSON.stringify(o), 300);
  return o;
}

function si_(v) { return String(v).trim().toUpperCase() === 'SI'; }

function listino_() {
  var cache = CacheService.getScriptCache(), c = cache.get('LISTINO');
  if (c) return JSON.parse(c);
  var lista = righe_('Listino').filter(function (r) { return si_(r.Attivo) && r.ID; }).map(function (r) {
    return {
      id: String(r.ID).trim(), area: r.Area, nome: r.Nome, tipo: String(r.Tipo).trim().toLowerCase(),
      durataMesi: Number(r.DurataMesi) || 0, prezzo: Number(r.Prezzo) || 0, iscrizione: Number(r.Iscrizione) || 0,
      pagamento: String(r.Pagamento || 'mensile').trim().toLowerCase(), rinnovo: si_(r.Rinnovo),
      fineStagione: String(r.FineStagione || '').trim(), fasciaOraria: String(r.FasciaOraria || '').trim(),
      junior: si_(r.Junior), descrizione: r.Descrizione || ''
    };
  });
  try { cache.put('LISTINO', JSON.stringify(lista), 300); } catch(e) {}
  return lista;
}

function dataDa_(v) {
  if (v instanceof Date) return dt_(v.getFullYear(), v.getMonth(), v.getDate());
  var m = String(v || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? dt_(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

function oggi_() { var n = new Date(); return dt_(n.getFullYear(), n.getMonth(), n.getDate()); }

function registra_(rif, evento, dettaglio) {
  foglio_('Registro').appendRow([new Date(), rif, evento, dettaglio || '']);
}

/* ================================================================== */
/* Pagina pubblica                                                     */
/* ================================================================== */

function doGet(e) {
  var t = HtmlService.createTemplate(jarvisTesto_('jarvis-contratti-pagina.html'));   // la pagina la scrive Jarvis nel Drive (caricatore)
  t.staff = !!(e && e.parameter && ('staff' in e.parameter));   // link diretto per lo staff: apre subito il PIN
  t.pagato = e && e.parameter && e.parameter.pagato ? String(e.parameter.pagato).replace(/[^a-f0-9]/gi, '').slice(0, 40) : '';   // ritorno da SumUp
  t.catalogoJSON = JSON.stringify(catalogo()).replace(/<\//g, '<\\/');   // catalogo inline: la pagina si apre senza attesa
  return t.evaluate()
    .setTitle('Contratto · Officine Sportive')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setFaviconUrl('https://www.officinesportive.it/wp-content/uploads/2025/11/cropped-favicon-270x270.png');
}

var _INCLUDE_ = { 'Condizioni': "<div class=\"cg\">\n<h3>Premessa</h3>\n<p>La Societ\u00e0 offre a chiunque, in via alternativa, l'<strong>Abbonamento a breve termine</strong> (\"Disdici quando vuoi\"), a prezzo pieno di listino e recedibile alla scadenza di ciascun periodo, e l'<strong>Abbonamento a lungo termine</strong>, a corrispettivo sensibilmente ridotto. La riduzione del corrispettivo costituisce la controprestazione dell'impegno assunto dal Tesserato di corrispondere tutte le mensilit\u00e0 della durata pattuita (ad esempio 12 rate), indipendentemente dalla fruizione del servizio.</p>\n<p>Il Tesserato che opta per l'Abbonamento a lungo termine lo fa per libera e consapevole scelta, rinunciando alla facolt\u00e0 di recesso propria del breve termine a fronte del minor corrispettivo. Conseguentemente, decorso il termine per il recesso convenzionale di cui all'art. 14.1, l'Abbonamento a lungo termine non \u00e8 recedibile prima della scadenza e le mensilit\u00e0 restano integralmente dovute anche in caso di malattia, infortunio, trasferimento o mancata fruizione. Non sono previsti recuperi n\u00e9 sospensioni. Le presenti Condizioni si interpretano alla luce della presente Premessa, che ne costituisce parte integrante.</p>\n\n<h3>Art. 1 \u2013 Parti, documenti contrattuali e tipologie di abbonamento</h3>\n<p>1.1 <strong>Parti.</strong> Il presente contratto \u00e8 stipulato tra Gate Fitness S.S.D. a r.l., societ\u00e0 sportiva dilettantistica senza scopo di lucro che non distribuisce utili ai sensi del D.Lgs. 36/2021, con sede in Via Fratelli Wright, 00054 Fiumicino (RM), gestore del Circolo Officine Sportive (di seguito \"la Societ\u00e0\" o \"il Circolo\"), e il soggetto indicato nel Riepilogo (di seguito \"il Tesserato\").</p>\n<p>1.2 <strong>Tesseramento.</strong> La partecipazione alle attivit\u00e0 \u00e8 subordinata al tesseramento presso l'Ente di promozione sportiva cui la Societ\u00e0 \u00e8 affiliata. Con la sottoscrizione il Tesserato richiede e autorizza il proprio tesseramento e dichiara di accettare lo statuto e i regolamenti della Societ\u00e0 e dell'Ente.</p>\n<p>1.3 <strong>Documenti contrattuali.</strong> Il contratto \u00e8 composto dal Riepilogo dell'iscrizione (abbonamento e attivit\u00e0 incluse, corrispettivi, pro rata, piano di pagamento, scadenza, termine per la disdetta, penale ed eventuale promozione), dalle presenti Condizioni generali, comprensive del Regolamento interno di cui all'art. 7, e dagli avvisi esposti nelle bacheche ai sensi dell'art. 6. In caso di contrasto prevale il Riepilogo. Il sito internet e il materiale promozionale hanno valore meramente informativo.</p>\n<p>1.4 <strong>Tipologie di abbonamento.</strong> Le presenti Condizioni si applicano uniformemente a ogni abbonamento e attivit\u00e0, comunque denominati. \u00c8 <em>a breve termine</em> esclusivamente l'abbonamento mensile senza vincolo di durata (\"Disdici quando vuoi\"), a prezzo pieno. Sono <em>a lungo termine</em>, e soggetti alla relativa disciplina, l'abbonamento annuale, l'abbonamento stagionale della scuola nuoto, la settimana del centro estivo e ogni abbonamento avente durata determinata, qualunque sia la frequenza settimanale. L'abbonamento \u00e8 strettamente personale e non \u00e8 cedibile.</p>\n<p>1.5 <strong>Abbonamenti Open.</strong> Tutti gli abbonamenti fitness sono di tipo Open e non sono previsti abbonamenti di settore: essi consentono l'accesso a tutte le aree e attivit\u00e0 del Circolo (sala pesi, corsi, idrobike, piscina, idromassaggio, sauna e spa) nel rispetto degli orari e delle modalit\u00e0 di prenotazione vigenti, senza alcuna garanzia in ordine alla disponibilit\u00e0 di specifiche aree, corsi, istruttori, orari o posti. Gli abbonamenti di paddle, scuola nuoto e centro estivo consentono l'accesso alle sole attivit\u00e0 indicate nel Riepilogo. Gli abbonamenti a fascia oraria (ad esempio Morning) consentono l'ingresso esclusivamente nella fascia indicata nel Riepilogo; al di fuori di essa l'accesso non \u00e8 consentito.</p>\n<p>1.6 <strong>Abbonamento giornaliero.</strong> L'abbonamento giornaliero d\u00e0 diritto alla frequenza per il solo giorno indicato nel Riepilogo; non prevede pro rata, rinnovo n\u00e9 disdetta e non pu\u00f2 essere differito ad altra data.</p>\n\n<h3>Art. 2 \u2013 Scelta dell'abbonamento e obbligo di pagamento</h3>\n<p>2.1 <strong>Scelta.</strong> Prima della sottoscrizione il Tesserato prende visione del contratto integrale e pu\u00f2 scaricarlo; la sottoscrizione non \u00e8 consentita senza previa visualizzazione. Ove per un'attivit\u00e0 siano disponibili entrambe le formule, la Societ\u00e0 propone l'abbonamento a breve e quello a lungo termine con i rispettivi prezzi di listino; il sistema registra le offerte proposte, i prezzi e la scelta effettuata.</p>\n<p>2.2 <strong>Lungo termine.</strong> Optando per l'abbonamento a lungo termine il Tesserato dichiara di aver liberamente rifiutato l'abbonamento a breve termine e riconosce che il minor corrispettivo costituisce la controprestazione del proprio impegno a corrispondere tutte le mensilit\u00e0 della durata pattuita e degli eventuali rinnovi.</p>\n<p>2.3 <strong>Obbligo di pagamento.</strong> Per qualsiasi abbonamento il Tesserato \u00e8 tenuto a corrispondere l'intero corrispettivo per tutta la durata, indipendentemente dalla frequenza. Il pagamento rateale costituisce una mera dilazione e non muta la natura dell'abbonamento. La mancata fruizione non integra mancata erogazione del servizio, che resta a disposizione del Tesserato per l'intera durata.</p>\n\n<h3>Art. 3 \u2013 Durata, rinnovo tacito e disdetta</h3>\n<p>3.1 <strong>Durata e pro rata.</strong> Durata, decorrenza e scadenza sono indicate nel Riepilogo. Qualora il primo accesso non coincida con il giorno 1 del mese, il periodo fino al termine del mese costituisce pro rata e non \u00e8 computato nella durata; il relativo importo si determina dividendo la rata mensile per i giorni del mese e moltiplicando il risultato per i giorni residui, salvo diversa condizione promozionale (importo ridotto, gratuit\u00e0 o pro rata di maggiore durata). Alla sottoscrizione sono dovuti il pro rata e, ove indicato nel Riepilogo, la prima rata. L'abbonamento decorre dal giorno 1 del mese successivo al pro rata e scade l'ultimo giorno dell'ultimo mese di durata. A titolo esemplificativo: primo accesso il 15 novembre, abbonamento di 12 mesi dal 1\u00b0 dicembre al 30 novembre successivo, termine per la disdetta il 5 ottobre.</p>\n<p>3.2 <strong>Rinnovo tacito. Alla scadenza l'abbonamento si rinnova automaticamente per un periodo di pari durata e alle medesime condizioni, e cos\u00ec di seguito a ogni successiva scadenza, salvo disdetta del Tesserato.</strong> Non si rinnovano gli abbonamenti per i quali il Riepilogo esclude il rinnovo. In tempo utile prima del termine per la disdetta la Societ\u00e0 invia automaticamente al Tesserato, via email, l'avviso di rinnovo previsto dall'art. 65-bis del Codice del Consumo.</p>\n<p>3.3 <strong>Disdetta. La disdetta deve pervenire alla Societ\u00e0 entro il giorno 5 del mese precedente la scadenza; il termine \u00e8 riportato in evidenza nella prima pagina del contratto.</strong> La disdetta \u00e8 valida esclusivamente se inviata tramite l'apposita funzione del sito, via email all'indirizzo info@officinesportive.it, via PEC o a mezzo raccomandata A/R. <strong>\u00c8 priva di qualsiasi effetto la disdetta comunicata verbalmente, telefonicamente o tramite WhatsApp.</strong> La disdetta pervenuta oltre il termine ha effetto dalla scadenza successiva.</p>\n<p>3.4 <strong>Esclusione del recesso anticipato.</strong> L'abbonamento a lungo termine non \u00e8 recedibile prima della scadenza per alcuna causa, ivi comprese malattia, infortunio, trasferimento o mancata fruizione, fatto salvo il recesso convenzionale di cui all'art. 14.1.</p>\n<p>3.5 <strong>Condizioni agevolate.</strong> Il prezzo agevolato subordinato a una condizione indicata nel Riepilogo (ad esempio la tariffa riservata al genitore di un iscritto alla scuola nuoto) si applica finch\u00e9 la condizione sussiste. Qualora alla data del rinnovo la condizione non sussista pi\u00f9, l'abbonamento si rinnova al prezzo pieno di listino, salvo disdetta.</p>\n<p>3.6 <strong>Mancata frequenza e mancato pagamento.</strong> L'interruzione della frequenza, il mancato pagamento, il blocco della carta o la revoca dell'autorizzazione all'addebito non equivalgono a disdetta: l'abbonamento resta in vigore fino alla scadenza, si rinnova in assenza di disdetta comunicata nei modi e nei termini di cui all'art. 3.3 e le rate restano dovute ai sensi dell'art. 4.4.</p>\n\n<h3>Art. 4 \u2013 Pagamenti</h3>\n<p>4.1 <strong>Modalit\u00e0 di pagamento.</strong> Il Tesserato corrisponde gli importi secondo il piano indicato nel Riepilogo; salvo diversa indicazione, le rate sono addebitate il giorno 1 di ciascun mese. Il metodo di pagamento (carta o IBAN intestati al Tesserato) \u00e8 acquisito e perfezionato dal software gestionale della Societ\u00e0 tramite la piattaforma TSPay o altra piattaforma da essa individuata, che raccoglie l'autorizzazione all'addebito per l'intera durata e per i rinnovi. I dati di pagamento non sono riportati nel presente contratto.</p>\n<p>4.2 <strong>Aggiornamento dei dati di pagamento.</strong> Il Tesserato \u00e8 tenuto a comunicare tempestivamente alla Societ\u00e0, e comunque prima della successiva scadenza di pagamento, la scadenza, il rinnovo, la sostituzione o il blocco della carta, la variazione dell'IBAN o l'estinzione del conto, nonch\u00e9 ogni altra circostanza ostativa all'addebito, provvedendo ad autorizzare il nuovo metodo di pagamento tramite la piattaforma. <strong>Il mancato addebito imputabile a dati di pagamento non aggiornati costituisce inadempimento del Tesserato e comporta l'applicazione della penale di cui all'art. 4.3 e delle conseguenze previste in caso di morosit\u00e0 dall'art. 4.4.</strong></p>\n<p>4.3 <strong>Penale.</strong> Qualora il pagamento della rata non risulti accreditato entro il giorno 5 del mese, \u00e8 dovuta la penale indicata nel Riepilogo per ciascun mese di ritardo.</p>\n<p>4.4 <strong>Morosit\u00e0.</strong> A decorrere dalla terza rata insoluta l'accesso al Circolo \u00e8 sospeso fino all'integrale pagamento, fermo restando l'obbligo di corrispondere il corrispettivo, e il Tesserato decade dal beneficio del termine ai sensi dell'art. 1186 c.c.: la Societ\u00e0 ha facolt\u00e0 di esigere in un'unica soluzione le rate scadute e tutte quelle a scadere fino al termine del contratto, oltre a penali e spese, anche affidando il recupero del credito al proprio legale e mediante ricorso per decreto ingiuntivo.</p>\n\n<h3>Art. 5 \u2013 Esclusione di recuperi e rimborsi</h3>\n<p>5.1 <strong>Esclusione dei recuperi.</strong> Per qualsiasi abbonamento, ingressi, lezioni, giornate o periodi non fruiti non sono recuperabili, differibili n\u00e9 rimborsabili, e non sono previste sospensioni, ivi compresi l'abbonamento stagionale della scuola nuoto e le settimane del centro estivo. Assenze, ferie, impegni, trasferimenti, malattie, infortuni, mancanza del certificato medico e ogni altra causa riferibile al Tesserato non danno diritto a recuperi, rimborsi, riduzioni o differimenti della scadenza.</p>\n<p>5.2 <strong>Chiusure parziali.</strong> La chiusura di una parte del Circolo (un'area, la piscina, la sauna, un campo, un corso o un'attivit\u00e0) non d\u00e0 diritto a recuperi o rimborsi, restando l'abbonamento Open fruibile nelle restanti aree ai sensi dell'art. 1.5.</p>\n<p>5.3 <strong>Chiusura totale.</strong> Esclusivamente la chiusura dell'intera struttura, per qualsiasi causa, d\u00e0 luogo a compensazione: per chiusure fino a 60 giorni consecutivi la scadenza \u00e8 differita di un numero di giorni pari a quello di chiusura e, per chiusure superiori a 30 giorni, gli addebiti sono sospesi dal 31\u00b0 giorno fino alla riapertura; per chiusure superiori a 60 giorni sono sospesi gli addebiti e l'esecuzione del contratto fino alla riapertura. L'abbonamento non si estingue, non \u00e8 recedibile anticipatamente e nessuna rata \u00e8 annullata o rimborsata. Le chiusure festive ed estive comunicate in bacheca non danno diritto a compensazioni.</p>\n\n<h3>Art. 6 \u2013 Comunicazioni e bacheche</h3>\n<p>6.1 Le comunicazioni della Societ\u00e0 al Tesserato avvengono via email, all'indirizzo indicato nel contratto, e mediante avvisi esposti nelle bacheche del Circolo. Le email si intendono ricevute il giorno dell'invio; il Tesserato \u00e8 tenuto a consultare la propria casella di posta e a comunicare ogni variazione dell'indirizzo email o del numero di cellulare.</p>\n<p>6.2 Gli avvisi esposti in bacheca (orari, chiusure, variazioni, regolamenti) hanno valore contrattuale. Il Tesserato \u00e8 tenuto a prenderne visione a ogni accesso e gli avvisi esposti si intendono da lui conosciuti.</p>\n\n<h3>Art. 7 \u2013 Regolamento interno</h3>\n<p>Il Regolamento interno costituisce parte integrante del contratto; il personale ha facolt\u00e0 di negare l'accesso o di allontanare chi non lo osservi.</p>\n<p>7.1 <strong>Certificato medico.</strong> L'accesso alle attivit\u00e0 \u00e8 subordinato al possesso di un certificato medico in corso di validit\u00e0; l'utilizzo di sauna e bagno turco \u00e8 consentito solo previo nulla osta medico. In mancanza del certificato l'accesso \u00e8 negato, senza effetti sugli obblighi di pagamento.</p>\n<p>7.2 <strong>Accesso e orari.</strong> L'accesso \u00e8 consentito esclusivamente con il proprio braccialetto o badge, strettamente personale e non cedibile a terzi, che resta di propriet\u00e0 del Tesserato e non deve essere restituito alla cessazione del rapporto. In caso di smarrimento o danneggiamento il nuovo braccialetto \u00e8 addebitato secondo listino. Gli orari del Circolo sono esposti in bacheca e il Circolo deve essere lasciato entro l'orario di chiusura.</p>\n<p>7.3 <strong>Prenotazioni.</strong> Campi da paddle e corsi si prenotano mediante i sistemi indicati dalla Societ\u00e0, nei limiti dei posti disponibili; prima di ogni partita \u00e8 necessario registrarsi in reception. La cancellazione \u00e8 gratuita fino a 24 ore prima; dopo due cancellazioni tardive o mancate presentazioni la Societ\u00e0 pu\u00f2 sospendere la facolt\u00e0 di prenotazione. Lezioni e tornei di paddle non sono inclusi.</p>\n<p>7.4 <strong>Abbigliamento.</strong> Sono obbligatori abbigliamento sportivo pulito, calzature da ginnastica destinate esclusivamente all'uso interno e asciugamano da stendere su panche e attrezzi. In piscina sono obbligatori costume, cuffia, ciabatte e doccia prima dell'ingresso in vasca; al paddle, calzature idonee al campo. \u00c8 vietato allenarsi a torso nudo, scalzi, in ciabatte o in abiti da strada.</p>\n<p>7.5 <strong>Spogliatoi.</strong> L'uso delle ciabatte \u00e8 sempre obbligatorio. Le borse devono essere riposte sulle cappelliere e mai sulle panche, che devono restare libere. Dopo la doccia \u00e8 necessario asciugarsi senza bagnare i pavimenti, in quanto il personale addetto alle pulizie interviene a orari prestabiliti. Negli spogliatoi, nelle docce e nei locali della spa \u00e8 vietato radersi, depilarsi ed effettuare trattamenti estetici.</p>\n<p>7.6 <strong>Armadietti e oggetti di valore.</strong> Gli armadietti possono essere utilizzati solo durante la permanenza nel Circolo e devono essere liberati all'uscita; gli oggetti di valore devono essere custoditi con il proprio lucchetto. La Societ\u00e0 non risponde degli oggetti lasciati incustoditi o riposti negli armadietti e pu\u00f2 liberare quelli occupati oltre l'orario di chiusura.</p>\n<p>7.7 <strong>Sauna e bagno turco.</strong> Devono essere osservati i regolamenti specifici affissi. \u00c8 fatto assoluto divieto di toccare o alterare sonde, sensori, termostati e impianti: il trasgressore risponde dei danni e pu\u00f2 essere allontanato.</p>\n<p>7.8 <strong>Piscina e corsi.</strong> Devono essere osservate le indicazioni degli istruttori e le corsie assegnate. Nei corsi il livello \u00e8 assegnato dai tecnici e non \u00e8 negoziabile. La temperatura dell'acqua \u00e8 garantita a 28 \u00b0C, \u00e8 fissa e non \u00e8 modificabile su richiesta; chi la ritenga insufficiente pu\u00f2 utilizzare magliette termiche o mute extra leggere.</p>\n<p>7.9 <strong>Divieti.</strong> All'interno del Circolo \u00e8 vietato: fumare, anche sigarette elettroniche; introdurre alcolici, sostanze stupefacenti o dopanti, contenitori di vetro e animali; svolgere lezioni o attivit\u00e0 di personal training non autorizzate; vendere o pubblicizzare prodotti; fotografare o riprendere altri frequentatori senza il loro consenso, e in ogni caso negli spogliatoi e nelle aree benessere.</p>\n<p>7.10 <strong>Parcheggio.</strong> Il parcheggio pu\u00f2 essere utilizzato solo durante l'allenamento e deve essere liberato al termine. \u00c8 fatto assoluto divieto di accodarsi a un altro veicolo in corrispondenza della sbarra: ogni ingresso e uscita \u00e8 consentito esclusivamente con il proprio badge o gettone. In caso di abuso il veicolo pu\u00f2 essere rimosso a spese del proprietario; la Societ\u00e0 non assume obblighi di custodia dei veicoli.</p>\n<p>7.11 <strong>Centro estivo.</strong> Il centro estivo ha natura sportiva e consiste nella pratica di attivit\u00e0 sportiva dilettantistica. Le settimane possono essere modificate soltanto prima del loro inizio. La settimana acquistata non \u00e8 rimborsabile n\u00e9 recuperabile, neppure in caso di malattia del minore: come per un viaggio, si acquista un periodo determinato e i posti degli altri giorni e delle altre settimane sono gi\u00e0 assegnati ad altri partecipanti.</p>\n\n<h3>Art. 8 \u2013 Danni, custodia e assicurazione</h3>\n<p>8.1 Il Tesserato \u00e8 tenuto a risarcire integralmente ogni danno arrecato a strutture, impianti e attrezzature, anche se involontario e cagionato nel normale svolgimento del gioco o dell'attivit\u00e0, ivi compresa la rottura delle vetrate dei campi da paddle.</p>\n<p>8.2 La Societ\u00e0 non presta servizio di custodia e non risponde di furti, smarrimenti o danni a beni e veicoli dei Tesserati, salvo il caso di dolo o colpa grave.</p>\n<p>8.3 La Societ\u00e0 \u00e8 assicurata per la responsabilit\u00e0 civile per i danni a essa imputabili; il Tesserato beneficia della copertura assicurativa prevista dal tesseramento all'Ente. La Societ\u00e0 non risponde dei danni derivanti da uso improprio di attrezzi e impianti o dalla violazione del Regolamento.</p>\n\n<h3>Art. 9 \u2013 Comportamento, allontanamento e risoluzione</h3>\n<p>9.1 Il Tesserato \u00e8 tenuto a mantenere un comportamento corretto e rispettoso nei confronti di frequentatori, istruttori e personale.</p>\n<p>9.2 Il personale pu\u00f2 disporre l'immediato allontanamento di chi violi il Regolamento o arrechi disturbo. In caso di comportamento grave (a titolo esemplificativo: violenza, minacce, molestie, furti, danneggiamenti, cessione del proprio accesso, manomissione degli impianti, uso di sostanze vietate, violazioni reiterate dopo un richiamo) ovvero di morosit\u00e0 pari o superiore a tre rate, la Societ\u00e0 ha facolt\u00e0 di risolvere il contratto ai sensi dell'art. 1456 c.c., mediante comunicazione via email, senza preavviso e senza obbligo di rimborso delle somme corrisposte.</p>\n\n<h3>Art. 10 \u2013 Minori</h3>\n<p>Qualora il Tesserato sia minorenne (\"Junior\"), il contratto \u00e8 intestato e sottoscritto con OTP dal genitore o dal soggetto esercente la responsabilit\u00e0 genitoriale, i cui dati figurano nel Riepilogo unitamente a quelli dello Junior. Il sottoscrittore dichiara di agire anche con il consenso dell'altro genitore, assume in proprio tutte le obbligazioni economiche e risponde dei danni cagionati dal minore.</p>\n\n<h3>Art. 11 \u2013 Immagini e riprese</h3>\n<p>Il Tesserato acconsente a che la Societ\u00e0 realizzi fotografie, video e reel di ambienti, attivit\u00e0, corsi ed eventi, nei quali possono comparire i frequentatori anche in primo piano, e li pubblichi a titolo gratuito e senza limiti di tempo sul sito, sui canali social e nel materiale promozionale del Circolo, non essendo possibile selezionare di volta in volta i soggetti ripresi. Quanto precede vale anche per i minori. Non sono effettuate riprese negli spogliatoi, nelle docce e nelle aree benessere. Restano salvi i diritti previsti dal Regolamento (UE) 2016/679.</p>\n\n<h3>Art. 12 \u2013 Organizzazione e tutela dei tesserati</h3>\n<p>12.1 La Societ\u00e0 ha facolt\u00e0 di modificare orari di apertura e chiusura, calendari e orari dei corsi, nonch\u00e9 di differirli, ridurli o sopprimerli, sostituire istruttori, attrezzature e macchinari, modificare o suddividere gli ambienti, nel rispetto dell'offerta complessiva del Circolo, senza che ci\u00f2 dia diritto a rimborsi o a recesso anticipato.</p>\n<p>12.2 La Societ\u00e0 adotta il Modello organizzativo e il Codice di condotta per la tutela dei minori e la prevenzione di abusi e discriminazioni ai sensi dell'art. 16 del D.Lgs. 39/2021, esposti in bacheca e pubblicati sul sito, che il Tesserato si impegna a rispettare.</p>\n\n<h3>Art. 13 \u2013 Sottoscrizione con firma elettronica (OTP)</h3>\n<p>13.1 Il contratto \u00e8 un documento informatico sottoscritto con firma elettronica ai sensi del Regolamento (UE) 910/2014 e del D.Lgs. 82/2005. Il Tesserato approva le presenti Condizioni e, specificamente, le clausole indicate nelle apposite spunte, quindi inserisce il codice monouso (OTP) inviato via SMS al proprio cellulare o, qualora l'invio dell'SMS non sia possibile o l'SMS non pervenga, via email all'indirizzo indicato nel contratto.</p>\n<p>13.2 L'inserimento del codice OTP equivale alla sottoscrizione del contratto e di ciascuna clausola specificamente approvata. Anche quando la compilazione avviene con l'assistenza del personale, il codice \u00e8 inviato al cellulare o all'email del Tesserato (per i minori, del genitore) ed \u00e8 da questi inserito. Il Tesserato dichiara che il numero di cellulare e l'indirizzo email indicati sono propri ed esclusivamente nella sua disponibilit\u00e0, ne garantisce la correttezza, si obbliga a non comunicare il codice a terzi e risponde di ogni conseguenza derivante da dati non veritieri.</p>\n<p>13.3 La Societ\u00e0 registra data e ora di ciascun passaggio, il numero o l'indirizzo email cui \u00e8 inviato il codice, il dispositivo e la connessione utilizzati e l'impronta informatica del documento, riportati nel \"Registro della firma\" in calce al contratto, che il Tesserato riconosce quale prova della sottoscrizione e del contenuto. Il contratto sottoscritto \u00e8 trasmesso in formato PDF all'indirizzo email del Tesserato ed \u00e8 conservato dalla Societ\u00e0 per la durata del rapporto e per i 10 anni successivi.</p>\n\n<h3>Art. 14 \u2013 Recesso convenzionale, trattamento dei dati e foro competente</h3>\n<p>14.1 <strong>Recesso convenzionale.</strong> Ai sensi dell'art. 1373 c.c. il Tesserato titolare di un abbonamento a lungo termine, esclusa la settimana del centro estivo, ha facolt\u00e0 di recedere dal contratto senza indicarne il motivo entro 14 giorni dalla sottoscrizione, con le modalit\u00e0 di cui all'art. 3.3; in tal caso la Societ\u00e0 restituisce gli importi corrisposti entro 14 giorni dal ricevimento della comunicazione di recesso. Tale facolt\u00e0 non spetta per l'abbonamento a breve termine, per l'abbonamento giornaliero e per il centro estivo. Resta salvo il diritto di recesso previsto dalla legge per i contratti conclusi a distanza, nei soli casi in cui esso spetti.</p>\n<p>14.2 <strong>Trattamento dei dati personali.</strong> I dati personali sono trattati ai sensi del Regolamento (UE) 2016/679 e dell'informativa privacy, che il Tesserato dichiara di aver letto.</p>\n<p>14.3 <strong>Conservazione del contratto.</strong> L'eventuale invalidit\u00e0 o inefficacia di una clausola non comporta l'invalidit\u00e0 delle restanti. Restano salvi i diritti riconosciuti inderogabilmente al consumatore dalla legge.</p>\n<p>14.4 <strong>Legge applicabile e foro competente.</strong> Il contratto \u00e8 regolato dalla legge italiana. Per le controversie con il Tesserato consumatore \u00e8 competente il foro del luogo di sua residenza o domicilio; negli altri casi \u00e8 competente in via esclusiva il foro di Civitavecchia.</p>\n</div>\n", 'Informativa': "<div class=\"cg\">\n<h3>Informativa sul trattamento dei dati personali</h3>\n<p>Ai sensi degli artt. 13 e 14 del Regolamento (UE) 2016/679 (GDPR).</p>\n<p><strong>1. Titolare del trattamento.</strong> Gate Fitness S.S.D. a r.l., Via Fratelli Wright, 00054 Fiumicino (RM), che gestisce il Circolo Officine Sportive. Contatti: info@officinesportive.it, PEC (in aggiornamento). Non \u00e8 nominato un Responsabile della protezione dei dati (DPO).</p>\n<p><strong>2. Dati trattati.</strong> Dati anagrafici e di contatto del Tesserato e, per i minori, del genitore e dello Junior: nome, cognome, data e luogo di nascita, codice fiscale, residenza, email, cellulare. Dati di idoneit\u00e0 medica (certificato medico), che sono dati relativi alla salute. Dati contrattuali e di frequenza: abbonamento, pagamenti, accessi, prenotazioni. Dati della firma elettronica: data e ora delle approvazioni, numero di cellulare o indirizzo email a cui \u00e8 inviato il codice OTP, dispositivo e indirizzo IP, impronta del documento. Immagini e video realizzati nel Circolo. I dati della carta o del conto sono trattati esclusivamente dalla piattaforma di pagamento e non sono conservati dalla Societ\u00e0.</p>\n<p><strong>3. Finalit\u00e0 e basi giuridiche.</strong></p>\n<table class=\"tab\">\n<tr><th>Finalit\u00e0</th><th>Base giuridica</th></tr>\n<tr><td>Gestione dell'iscrizione, dell'abbonamento, degli accessi e dei pagamenti</td><td>Esecuzione del contratto (art. 6.1.b GDPR)</td></tr>\n<tr><td>Tesseramento all'Ente di promozione sportiva e relativa copertura assicurativa</td><td>Esecuzione del contratto e obblighi dell'ordinamento sportivo</td></tr>\n<tr><td>Verifica dell'idoneit\u00e0 medica all'attivit\u00e0 sportiva</td><td>Obbligo di legge in materia di tutela sanitaria dell'attivit\u00e0 sportiva (art. 9.2.b e 9.2.h GDPR)</td></tr>\n<tr><td>Adempimenti contabili, fiscali e di legge</td><td>Obbligo legale (art. 6.1.c GDPR)</td></tr>\n<tr><td>Prova della firma elettronica e tutela dei diritti della Societ\u00e0, anche in giudizio e per il recupero dei crediti</td><td>Legittimo interesse (art. 6.1.f GDPR)</td></tr>\n<tr><td>Sicurezza del Circolo e tutela dei minori (safeguarding)</td><td>Obbligo legale e legittimo interesse</td></tr>\n<tr><td>Foto e video di ambienti, attivit\u00e0 ed eventi per la comunicazione del Circolo su sito e social</td><td>Esecuzione del contratto e legittimo interesse (art. 6.1.b e 6.1.f GDPR)</td></tr>\n<tr><td>Comunicazioni di servizio (avvisi di rinnovo, variazioni, scadenze)</td><td>Esecuzione del contratto e obbligo legale</td></tr>\n</table>\n<p>Il conferimento dei dati \u00e8 necessario per concludere il contratto: senza di essi non \u00e8 possibile l'iscrizione.</p>\n<p><strong>4. Destinatari.</strong> I dati possono essere comunicati, per le sole finalit\u00e0 indicate, a: Ente di promozione sportiva a cui la Societ\u00e0 \u00e8 affiliata; fornitore del software gestionale; piattaforma di pagamento; fornitore del servizio di invio SMS ed email; compagnia assicurativa; consulenti fiscali e legali; autorit\u00e0 pubbliche quando previsto dalla legge. I fornitori agiscono come responsabili del trattamento. I dati non sono diffusi, salvo le immagini pubblicate sui canali del Circolo, e non sono trasferiti fuori dall'Unione europea senza le garanzie previste dal GDPR.</p>\n<p><strong>5. Conservazione.</strong> Contratto, registro della firma e dati contabili: per la durata del rapporto e per 10 anni dalla sua cessazione. Certificato medico: per il periodo di validit\u00e0 e per il tempo necessario agli obblighi di legge. Immagini pubblicate: fino all'eventuale opposizione dell'interessato o alla rimozione da parte della Societ\u00e0.</p>\n<p><strong>6. Diritti dell'interessato.</strong> L'interessato pu\u00f2 chiedere in ogni momento l'accesso ai propri dati, la rettifica, la cancellazione, la limitazione del trattamento, la portabilit\u00e0 e opporsi al trattamento basato sul legittimo interesse (artt. 15-22 GDPR), scrivendo a info@officinesportive.it. Ha inoltre diritto di proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).</p>\n<p>Data di aggiornamento: 16/11/2026.</p>\n</div>\n" };
function include_(nome) { return _INCLUDE_[nome] || ''; }

/** Listino pubblico (gli stessi prezzi del sito). Cache 5 min: il listino non cambia ogni minuto. */
function catalogo() {
  var cache = CacheService.getScriptCache(), PEZZO = 25000, chiave = 'CATALOGO';
  var dallaCache = function () {
    try { var k = Number(cache.get(chiave + 'n') || 0), chiavi = []; for (var j = 0; j < k; j++) chiavi.push(chiave + j);
      var v = cache.getAll(chiavi); if (k && chiavi.every(function (x) { return v[x]; })) return JSON.parse(chiavi.map(function (x) { return v[x]; }).join(''));
    } catch (e) {}
    return null;
  };
  var r = dallaCache();
  if (r && r.oggi === fmtData_(oggi_())) return r;
  var imp = impostazioni_();
  var nascoste = centroEstivoNascosto_(imp) ? ['Centro estivo'] : [];
  r = {
    abbonamenti: listino_().filter(function (a) { return nascoste.indexOf(a.area) < 0; }),
    areeNascoste: nascoste,
    circolo: imp.NomeCircolo,
    emailCircolo: imp.EmailCircolo,
    condizioni: include_('Condizioni'),
    informativa: informativa_(imp),
    spunte: SPUNTE,
    metodi: metodiPagamento_(imp),
    oggi: fmtData_(oggi_())
  };
  try { var s = JSON.stringify(r), n = Math.ceil(s.length / PEZZO), m = {}; m[chiave + 'n'] = String(n);
    for (var q = 0; q < n; q++) m[chiave + q] = s.substr(q * PEZZO, PEZZO); cache.putAll(m, 300);
  } catch (e) {}
  return r;
}

/** Giorno e mese da Impostazioni: "15 settembre", "15/09" o una data. Ritorna [mese 0-11, giorno] o null. */
function giornoMese_(v) {
  if (v instanceof Date) return [v.getMonth(), v.getDate()];
  var s = String(v || '').toLowerCase().trim(), m;
  if ((m = s.match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})/))) return [Number(m[2]) - 1, Number(m[1])];
  var mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  if ((m = s.match(/^(\d{1,2})\s+([a-zà]+)/))) { var i = mesi.indexOf(m[2]); if (i >= 0) return [i, Number(m[1])]; }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { var d = new Date(s); return [d.getMonth(), d.getDate()]; }
  return null;
}

/** Centro estivo oscurato nel periodo indicato in Impostazioni (di serie dal 15 settembre al 31 gennaio). */
function centroEstivoNascosto_(imp) {
  var dal = giornoMese_(imp.CentroEstivoNascostoDal || '15 settembre'), al = giornoMese_(imp.CentroEstivoNascostoAl || '31 gennaio');
  if (!dal || !al) return false;
  var o = oggi_(), x = o.getMonth() * 100 + o.getDate(), a = dal[0] * 100 + dal[1], b = al[0] * 100 + al[1];
  return a <= b ? (x >= a && x <= b) : (x >= a || x <= b);   // il periodo può scavalcare la fine dell'anno
}

function informativa_(imp) {
  return include_('Informativa')
    .replace('%%PEC%%', imp.PEC || '(in aggiornamento)')
    .replace('%%DATAINFORMATIVA%%', imp.DataInformativa instanceof Date ? fmtData_(imp.DataInformativa) : (imp.DataInformativa || ''));
}

function normalizzaCodice_(c) { return String(c || '').replace(/\s+/g, '').toUpperCase(); }

function promo_(codice, abbId) {
  codice = normalizzaCodice_(codice);
  if (!codice) return null;
  var oggi = oggi_();
  var r = righe_('Promo').filter(function (p) { return si_(p.Attivo) && normalizzaCodice_(p.Codice) === codice; })[0];
  if (!r) return { errore: 'Codice promozione non valido.' };
  var dal = dataDa_(r.ValidoDal), al = dataDa_(r.ValidoAl);
  if ((dal && oggi < dal) || (al && oggi > al)) return { errore: 'Il codice promozione non è più valido.' };
  var ammessi = String(r.Abbonamenti || 'TUTTI').toUpperCase().split(/[,;\s]+/).filter(String);
  if (ammessi.indexOf('TUTTI') < 0 && ammessi.indexOf(String(abbId).toUpperCase()) < 0) {
    return { errore: 'Il codice non vale per l\'abbonamento scelto.' };
  }
  var fissoP = dataDa_(r.InizioAbbonamento);
  if (fissoP && (oggi_().getFullYear() * 12 + oggi_().getMonth()) >= (fissoP.getFullYear() * 12 + fissoP.getMonth())) {
    return { errore: 'Il codice promozione non è più valido.' };
  }
  var pr = String(r.PrimaRataAllaFirma || '').trim().toUpperCase();
  return {
    codice: codice, descrizione: r.Descrizione || codice,
    mesiProrataExtra: Number(r.MesiProrataExtra) || 0,
    importoProrataMese: r.ImportoProrataMese === '' ? null : String(r.ImportoProrataMese),
    primaRataAllaFirma: pr === 'SI' ? true : pr === 'NO' ? false : null,
    omaggio: si_(r.Omaggio),
    inizioFisso: dataDa_(r.InizioAbbonamento),
    prezzoRata: r.PrezzoRata === undefined || r.PrezzoRata === '' ? null : Number(String(r.PrezzoRata).replace(',', '.')),
    scontoPercento: Number(String(r.ScontoPercento || 0).replace(',', '.').replace('%', '')) || 0,
    durataMesi: Number(r.DurataMesi) || 0,                 // convenzioni con durata propria (es. HILTON5: 5 mesi)
    nomeAbbonamento: String(r.NomeAbbonamento || '').trim()
  };
}

/** Promo con durata o nome propri: l'abbonamento del contratto diventa quello della convenzione. */
function abbConPromo_(abb, promo) {
  if (!promo || promo.errore || !(promo.durataMesi || promo.nomeAbbonamento)) return abb;
  var a = JSON.parse(JSON.stringify(abb));
  if (promo.durataMesi) a.durataMesi = promo.durataMesi;
  if (promo.nomeAbbonamento) a.nome = promo.nomeAbbonamento;
  return a;
}

/** Primo giorno di accesso: da oggi all'ultimo giorno del mese corrente. */
function primoGiorno_(v) {
  var d = dataDa_(v) || oggi_();
  if (d < oggi_()) d = oggi_();
  var o = oggi_(), max = ultimoGiorno_(o.getFullYear(), o.getMonth());
  if (d > max) d = max;
  return d;
}

function opzioniPiano_(imp) {
  return {
    penale: Number(imp.Penale) || 0,
    includiGiornoIscrizione: !(String(imp.GiornoIscrizioneNelProRata).toUpperCase() === 'NO'),
    primaRataAllaFirma: !(String(imp.PrimaRataAllaFirma).toUpperCase() === 'NO')
  };
}

/** Controllo del codice promozione dal browser. */
function verificaPromo(codice, abbId) {
  var p = promo_(codice, abbId);
  if (!p) return { ok: false, errore: 'Inserisci un codice.' };
  if (p.errore) return { ok: false, errore: p.errore };
  return { ok: true, descrizione: p.descrizione };
}

/** Dati ricavati dal codice fiscale. */
function datiDaCF(cf, nome, cognome) {
  var a = analizzaCF(cf, oggi_());
  if (!a.valido) return { ok: false, errore: a.errore };
  var luogo = luogoNascita_(a.codiceComune);
  return { ok: true, sesso: a.sesso, nascita: fmtData_(a.nascita), eta: etaAl_(a.nascita, oggi_()),
           luogo: luogo.nome, provincia: luogo.provincia,
           nomeOk: nome && cognome ? (eProva_(cognome) || verificaNomeCF(nome, cognome, a.cf)) : null };
}

function luogoNascita_(codice) {
  if (codice.charAt(0) === 'Z') return { nome: 'Stato estero (' + codice + ')', provincia: 'EE' };
  var sh = foglio_('Comuni');
  var cella = sh.getRange('A:A').createTextFinder(codice).matchEntireCell(true).findNext();
  if (!cella) return { nome: 'Comune ' + codice, provincia: '' };
  var r = sh.getRange(cella.getRow(), 1, 1, 3).getValues()[0];
  return { nome: r[1], provincia: r[2] };
}

/** Anteprima del piano mostrata nel Riepilogo. */
function preventivo(abbId, codicePromo, primoGiorno, upg) {
  var imp = impostazioni_();
  var abb = listino_().filter(function (a) { return a.id === abbId; })[0];
  if (!abb) return { ok: false, errore: 'Abbonamento non disponibile.' };
  if (upg) {
    var u = validaUpgrade_(upg, abb);
    if (u.errore) return { ok: false, errore: u.errore };
    if (u.cessione) abb = abbCessione_(abb, u);
    var oU = opzioniPiano_(imp); oU.dataFirma = oggi_(); oU.upgrade = { scadenza: u.scadenza, cessione: !!u.cessione };
    return { ok: true, piano: pianoPerClient_(calcolaPiano(abb, null, oggi_(), oU)) };
  }
  var promo = codicePromo ? promo_(codicePromo, abbId) : null;
  if (promo && promo.errore) return { ok: false, errore: promo.errore };
  abb = abbConPromo_(abb, promo);
  var o = opzioniPiano_(imp); o.dataFirma = oggi_();
  return { ok: true, piano: pianoPerClient_(calcolaPiano(abb, promo, primoGiorno_(primoGiorno), o)) };
}

/** Rate mensili addebitate in automatico (serve la carta registrata al circolo). */
function ricorrente_(p) { return /^Rata mensile/.test(String(p.pianoRate || '')); }

function pianoPerClient_(p) {
  return {
    abbonamento: p.abbonamento, area: p.area, tipo: p.tipo, rinnovo: p.rinnovo, fasciaOraria: p.fasciaOraria,
    firma: fmtData_(p.firma), primoGiorno: fmtData_(p.primoGiorno), prorata: p.prorata.map(function (r) { return r.periodo; }).join(' e '), inizio: fmtData_(p.inizio), scadenza: fmtData_(p.scadenza),
    disdettaEntro: p.disdettaEntro ? fmtData_(p.disdettaEntro) : '', disdettaOgniAnno: p.disdettaOgniAnno || '',
    garanziaFino: p.garanziaFino ? fmtData_(p.garanziaFino) : '', righeFirma: p.righeFirma.map(function (r) { return { voce: r.voce, importo: euro_(r.importo) }; }),
    totaleFirma: euro_(p.totaleFirma), pianoRate: p.pianoRate, ricorrente: ricorrente_(p), penale: p.penale ? euro_(p.penale) : '', promo: p.promo
  };
}

/** Contratto di prova: il cognome è "Prova". */
function eProva_(cognome) { return String(cognome || '').trim().toLowerCase() === 'prova'; }
function prefissoProva_(numero) { return String(numero).indexOf('PROVA') === 0 ? '[PROVA] ' : ''; }

/* ================================================================== */
/* Validazione dei dati                                                */
/* ================================================================== */

var DOMINI_EMAIL = ['gmail.com', 'hotmail.com', 'hotmail.it', 'libero.it', 'yahoo.com', 'yahoo.it', 'icloud.com',
  'outlook.com', 'outlook.it', 'live.com', 'live.it', 'alice.it', 'tiscali.it', 'virgilio.it', 'tim.it', 'me.com', 'fastwebnet.it', 'email.it', 'msn.com'];

function pulisciTesto_(s, max) { return String(s || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().substr(0, max || 80); }
function maiuscoleNome_(s) { return pulisciTesto_(s).toLowerCase().replace(/(^|[\s'’-])([a-zà-ù])/g, function (m, a, b) { return a + b.toUpperCase(); }); }

function normalizzaCell_(s) {
  var n = String(s || '').replace(/[\s.\-\/()]/g, '');
  if (n.indexOf('0039') === 0) n = '+39' + n.substr(4);
  if (n.charAt(0) !== '+') n = '+39' + n;
  return n;
}

function emailValida_(e) { return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e); }

function validaPersona_(p, etichetta, conContatti, secondoObbligatorio) {
  var e = [];
  var out = { nome: maiuscoleNome_(p.nome), cognome: maiuscoleNome_(p.cognome), cf: cfPulisci_(p.cf) };
  if (!out.nome || !out.cognome) e.push(etichetta + ': inserisci nome e cognome.');
  var a = analizzaCF(out.cf, oggi_());
  if (eProva_(out.cognome) && !a.valido) {
    // Prova: il codice fiscale non si controlla
    out.cf = out.cf || 'PROVA';
    out.sesso = 'M'; out.nascita = ''; out.luogoNascita = '(prova)';
    out.eta = etichetta === 'Junior' ? 10 : 30;
  } else if (!a.valido) e.push(etichetta + ': ' + a.errore);
  else {
    if (out.nome && out.cognome && !eProva_(out.cognome) && !verificaNomeCF(out.nome, out.cognome, out.cf)) {
      e.push(etichetta + ': nome e cognome non corrispondono al codice fiscale.');
    }
    var l = luogoNascita_(a.codiceComune);
    out.sesso = a.sesso; out.nascita = fmtData_(a.nascita); out.eta = etaAl_(a.nascita, oggi_());
    out.luogoNascita = l.nome + (l.provincia ? ' (' + l.provincia + ')' : '');
  }
  if (conContatti) {
    out.via = pulisciTesto_(p.via); out.civico = pulisciTesto_(p.civico, 10);
    out.cap = String(p.cap || '').replace(/\D/g, ''); out.comune = maiuscoleNome_(p.comune);
    out.provincia = String(p.provincia || '').toUpperCase().replace(/[^A-Z]/g, '').substr(0, 2);
    out.cellulare = normalizzaCell_(p.cellulare); out.telefono2 = secondoObbligatorio ? normalizzaCell_(p.telefono2) : '';
    out.email = String(p.email || '').trim().toLowerCase();
    if (!out.via || !out.civico) e.push('Inserisci via e numero civico.');
    if (!/^\d{5}$/.test(out.cap)) e.push('Il CAP deve avere 5 cifre.');
    if (!out.comune || out.provincia.length !== 2) e.push('Inserisci comune e provincia (2 lettere).');
    if (!/^\+393\d{8,9}$/.test(out.cellulare)) e.push('Il cellulare non è valido: serve un cellulare italiano per ricevere il codice.');
    if (secondoObbligatorio) {
      if (!/^\+\d{8,14}$/.test(out.telefono2)) e.push('Inserisci un secondo recapito telefonico valido.');
      else if (out.telefono2 === out.cellulare) e.push('Il secondo recapito deve essere diverso dal cellulare.');
    }
    if (!emailValida_(out.email)) e.push('L\'email non è valida.');
    else if (out.email !== String(p.email2 || '').trim().toLowerCase()) e.push('Le due email non coincidono.');
  }
  return { dati: out, errori: e };
}

/* ================================================================== */
/* Firma con OTP                                                       */
/* ================================================================== */

/**
 * dati: { abbId, promo, junior: bool, titolare:{...}, minore:{nome,cognome,cf}, spunte:[true,true,true],
 *         offerte: [...], lettura: {aperto, scorrimento}, client:{ua, ip, schermo} }
 */
function avviaFirma(dati) {
  var imp = impostazioni_();
  var abb = listino_().filter(function (a) { return a.id === dati.abbId; })[0];
  if (!abb) return { ok: false, errori: ['Abbonamento non disponibile.'] };
  var junior = !!abb.junior || !!dati.perMinore;     // scuola nuoto/centro estivo, oppure minorenne in fitness/padel
  var errori = [];
  var upg = null;
  if (dati.upgrade) {                                       // upgrade: solo dal back office, con il PIN dello staff
    try { upg = validaUpgrade_(dati.upgrade, abb); } catch (eU) { return { ok: false, errori: ['Sessione dello staff scaduta: rientra con il PIN e ricomincia l\'upgrade.'] }; }
    if (upg.errore) return { ok: false, errori: [upg.errore] };
    dati.promo = '';
    if (upg.cessione) abb = abbCessione_(abb, upg);
  }
  var promo = dati.promo ? promo_(dati.promo, abb.id) : null;
  if (promo && promo.errore) errori.push(promo.errore);
  else abb = abbConPromo_(abb, promo);

  var t = validaPersona_(dati.titolare || {}, junior ? 'Genitore' : 'Dati', true, junior);
  errori = errori.concat(t.errori);
  if (t.dati.eta !== undefined && t.dati.eta < 18) {
    errori.push(junior ? 'Il genitore deve essere maggiorenne.' : 'Il titolare risulta minorenne: attiva "L\'abbonamento è per un minorenne" e compila i dati del genitore.');
  }
  var m = null;
  if (junior) {
    m = validaPersona_(dati.minore || {}, 'Junior', false);
    errori = errori.concat(m.errori);
    if (m.dati.eta !== undefined && m.dati.eta >= 18) errori.push('Lo Junior risulta maggiorenne: scegli un abbonamento adulti.');
    if (m.dati.cf && m.dati.cf === t.dati.cf) errori.push('Il codice fiscale dello Junior è uguale a quello del genitore.');
  }
  var sp = dati.spunte || [];
  if (!(sp[0] && sp[1] && sp[2])) errori.push('Per firmare servono tutte e tre le spunte.');
  if (!dati.lettura || !dati.lettura.aperto) errori.push('Prima di firmare apri e leggi il contratto completo.');
  if (errori.length) return { ok: false, errori: errori };

  // Limite di invii per cellulare (anti abuso)
  var cache = CacheService.getScriptCache();
  var kCell = 'NCELL_' + t.dati.cellulare;
  var nCell = eProva_(t.dati.cognome) ? 0 : Number(cache.get(kCell) || 0);
  if (nCell >= 6) return { ok: false, errori: ['Troppe richieste per questo cellulare. Riprova tra un\'ora.'] };
  cache.put(kCell, String(nCell + 1), 3600);

  var primo = primoGiorno_(dati.primoGiorno);
  var opzP = opzioniPiano_(imp); opzP.dataFirma = oggi_();
  if (upg) opzP.upgrade = { scadenza: upg.scadenza, cessione: !!upg.cessione };
  var piano = calcolaPiano(abb, promo, primo, opzP);
  var metodo = '';
  if (piano.totaleFirma > 0) {
    metodo = String(dati.metodo || '').trim();
    if (metodiPagamento_(imp).indexOf(metodo) < 0) return { ok: false, errori: ['Seleziona la modalità di pagamento alla firma.'] };
  }
  var id = Utilities.getUuid();
  var otp = nuovoOtp_();
  var sessione = {
    id: id, creato: new Date().toISOString(), primoGiorno: fmtData_(primo), abb: abb, promo: promo,
    titolare: t.dati, minore: m ? m.dati : null, junior: junior, metodo: metodo,
    upgrade: upg ? { scadenza: fmtData_(upg.scadenza), vecchio: upg.vecchio, staff: upg.staff, cessione: !!upg.cessione, cedente: upg.cedente || '', rata: upg.rata || 0 } : null,
    offerte: (dati.offerte || []).slice(0, 20).map(function (o) { return pulisciTesto_(o, 120); }),
    lettura: dati.lettura, client: pulisciClient_(dati.client),
    spunteAlle: new Date().toISOString(),
    otpHash: hash_(id + otp), otpChiaro: otp, otpScade: Date.now() + OTP_VALIDITA_MIN * 60000, invii: 1, tentativi: 0,
    eventi: [[new Date().toISOString(), 'Contratto visualizzato e spunte 1, 2, 3 approvate']]
  };
  var canale = inviaOtp_(sessione, otp, imp);
  sessione.canale = canale;
  sessione.eventi.push([new Date().toISOString(), 'Codice OTP inviato via ' + canale + ' a ' + destinatarioOtp_(sessione, canale) +
    (sessione.smsFallito ? ' (SMS non disponibile)' : '')]);
  cache.put('S_' + id, JSON.stringify(sessione), 21600);
  registra_(id, 'OTP inviato', canale + ' · ' + destinatarioOtp_(sessione, canale) + ' · ' + abb.nome);
  return { ok: true, id: id, canale: canale, a: mascherato_(destinatarioOtp_(sessione, canale)), piano: pianoPerClient_(piano) };
}

function reinviaOtp(id) {
  var cache = CacheService.getScriptCache();
  var s = sessione_(id);
  if (!s) return { ok: false, errore: 'Sessione scaduta: ricomincia.' };
  if (s.invii >= OTP_INVII_MAX) return { ok: false, errore: 'Hai già richiesto il codice ' + OTP_INVII_MAX + ' volte. Ricomincia tra qualche minuto.' };
  var otp = nuovoOtp_();
  s.otpHash = hash_(s.id + otp); s.otpChiaro = otp; s.otpScade = Date.now() + OTP_VALIDITA_MIN * 60000; s.invii++; s.tentativi = 0;
  s.canale = inviaOtp_(s, otp, impostazioni_());
  if (s.canale === 'SMS' && s.emailBackup) inviaOtpEmail_(s, otp);
  s.eventi.push([new Date().toISOString(), 'Codice OTP inviato di nuovo via ' + s.canale + ' a ' + destinatarioOtp_(s, s.canale)]);
  cache.put('S_' + id, JSON.stringify(s), 21600);
  registra_(id, 'OTP reinviato', s.canale);
  return { ok: true, canale: s.canale, a: mascherato_(destinatarioOtp_(s, s.canale)) };
}

function confermaFirma(id, codice) {
  var cache = CacheService.getScriptCache();
  var s = sessione_(id);
  if (!s) return { ok: false, errore: 'Sessione scaduta: ricomincia.' };
  if (s.firmato) return { ok: true, numero: s.firmato };
  if (Date.now() > s.otpScade) return { ok: false, errore: 'Il codice è scaduto: chiedine uno nuovo.' };
  if (s.tentativi >= OTP_TENTATIVI) return { ok: false, errore: 'Troppi tentativi: chiedi un nuovo codice.' };
  codice = String(codice || '').replace(/\D/g, '');
  if (hash_(s.id + codice) !== s.otpHash) {
    s.tentativi++;
    cache.put('S_' + id, JSON.stringify(s), 21600);
    registra_(id, 'OTP errato', 'tentativo ' + s.tentativi);
    return { ok: false, errore: 'Codice non corretto. Tentativi rimasti: ' + (OTP_TENTATIVI - s.tentativi) };
  }
  s.eventi.push([new Date().toISOString(), 'Codice OTP inserito correttamente: contratto firmato']);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var numero = eProva_(s.titolare.cognome) ? nuovoNumero_('PROVA') : nuovoNumero_();
    var esito = creaContratto_(s, numero);
    s.firmato = numero;
    cache.put('S_' + id, JSON.stringify(s), 21600);
    var out = { ok: true, numero: numero };
    if (s.metodo === METODO_CARTA && esito.totaleFirma > 0) {
      try { s.ricorrente = esito.ricorrente; out.pagamento = nuovoPagamentoCarta_(numero, esito.riga, esito.totaleFirma, s); }
      catch (e) {
        registra_(numero, 'ERRORE pagamento SumUp', String(e)); out.pagamento = { errore: true };
        try { var shE = foglio_('Contratti'); shE.getRange(esito.riga, colonna_(shE, 'Pagamento con carta') + 1).setValue('Pagamento non creato'); } catch (e3) {}
      }
    }
    return out;
  } finally {
    lock.releaseLock();
  }
}

function sessione_(id) {
  var v = CacheService.getScriptCache().get('S_' + String(id || '').replace(/[^a-f0-9-]/gi, ''));
  return v ? JSON.parse(v) : null;
}

function nuovoOtp_() { return ('00000' + Math.floor(Math.random() * 1000000)).slice(-6); }

function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

function mascherato_(s) {
  s = String(s);
  if (s.indexOf('@') > 0) { var p = s.split('@'); return p[0].substr(0, 2) + '•••@' + p[1]; }
  return s.substr(0, 4) + ' ••• •• ' + s.slice(-3);
}

function pulisciClient_(c) {
  c = c || {};
  return { ua: pulisciTesto_(c.ua, 300), ip: pulisciTesto_(c.ip, 60), schermo: pulisciTesto_(c.schermo, 30), lingua: pulisciTesto_(c.lingua, 20) };
}

function destinatarioOtp_(s, canale) { return canale === 'SMS' ? s.titolare.cellulare : s.titolare.email; }

/**
 * Invia il codice: via SMS se attivo; se l'SMS non parte (credito finito, guasto) passa da solo all'email.
 * Ritorna il canale usato: 'SMS' oppure 'email'.
 */
function inviaOtp_(s, otp, imp) {
  var props = PropertiesService.getScriptProperties();
  var testo = 'Officine Sportive: il tuo codice per firmare il contratto è ' + otp + '. Vale ' + OTP_VALIDITA_MIN + ' minuti. Non comunicarlo a nessuno.';
  if (String(imp.CanaleOTP).toUpperCase() === 'SMS' && props.getProperty('SMS_USER')) {
    try {
      inviaSms_(s.titolare.cellulare, testo, imp);
      return 'SMS';
    } catch (e) {
      registra_(s.id, 'SMS non inviato: passo all\'email', String(e));
      s.smsFallito = true;
    }
  }
  inviaOtpEmail_(s, otp);
  return 'email';
}

function inviaOtpEmail_(s, otp) {
  MailApp.sendEmail({
    to: s.titolare.email, name: MITTENTE,
    subject: (eProva_(s.titolare.cognome) ? '[PROVA] ' : '') + 'Il tuo codice per firmare il contratto: ' + otp,
    htmlBody: cornice_('<p style="margin:0 0 14px">Ciao ' + esc_(s.titolare.nome) + ',</p>' +
      '<p style="margin:0 0 18px">ecco il codice per firmare il contratto con Officine Sportive:</p>' +
      '<div style="font-size:34px;letter-spacing:10px;font-weight:700;color:#13556F;text-align:center;padding:18px;background:#EEF4F5;border-radius:12px">' + otp + '</div>' +
      '<p style="margin:18px 0 0;color:#5A707A;font-size:13px">Il codice vale ' + OTP_VALIDITA_MIN + ' minuti. Non comunicarlo a nessuno: equivale alla tua firma.</p>' + firmaTeam_()),
    body: 'Officine Sportive: il tuo codice per firmare il contratto è ' + otp + '. Vale ' + OTP_VALIDITA_MIN + ' minuti. Non comunicarlo a nessuno.'
  });
}

/** Se l'SMS non arriva: la pagina, dopo un po', chiede di mandare lo stesso codice anche via email (una volta). */
function otpViaEmail(id) {
  var cache = CacheService.getScriptCache();
  var s = sessione_(id);
  if (!s) return { ok: false, errore: 'Sessione scaduta: ricomincia.' };
  if (s.firmato) return { ok: true, a: mascherato_(s.titolare.email) };
  if (s.canale !== 'SMS' || s.emailBackup || Date.now() > s.otpScade) return { ok: false };
  inviaOtpEmail_(s, s.otpChiaro);
  s.emailBackup = true;
  s.eventi.push([new Date().toISOString(), 'SMS non ricevuto: stesso codice OTP inviato anche via email a ' + s.titolare.email]);
  cache.put('S_' + id, JSON.stringify(s), 21600);
  registra_(id, 'OTP anche via email', s.titolare.email);
  return { ok: true, a: mascherato_(s.titolare.email) };
}

/** Invio SMS tramite Skebby (credenziali nelle Proprietà dello script: SMS_USER, SMS_PASSWORD). */
function loginSkebby_() {
  var props = PropertiesService.getScriptProperties();
  var auth = Utilities.base64Encode(props.getProperty('SMS_USER') + ':' + props.getProperty('SMS_PASSWORD'), Utilities.Charset.UTF_8);
  var r = UrlFetchApp.fetch('https://api.skebby.it/API/v1.0/REST/login', {
    headers: { Authorization: 'Basic ' + auth }, muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) throw new Error('Accesso a Skebby non riuscito (' + r.getResponseCode() + '): ' + r.getContentText());
  return r.getContentText().trim().split(';');
}

/** Invio SMS tramite Skebby (Proprietà dello script: SMS_USER = email di registrazione, SMS_PASSWORD = password API). */
function inviaSms_(numero, testo, imp) {
  var k = loginSkebby_();
  var r = UrlFetchApp.fetch('https://api.skebby.it/API/v1.0/REST/sms', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { user_key: k[0], Session_key: k[1] },
    payload: JSON.stringify({ message_type: 'GP', message: testo, recipient: [numero], sender: imp.MittenteSMS ? String(imp.MittenteSMS).trim() : undefined, returnCredits: true })
  });
  if (r.getResponseCode() >= 300) throw new Error('Invio SMS non riuscito: ' + r.getContentText());
  try { controllaCreditoSms_(k); } catch (e) { registra_('SMS', 'Controllo credito non riuscito', String(e)); }
}

/** Dopo ogni invio: se restano 20 o 10 SMS (o meno) avvisa via email, una volta per soglia. */
function controllaCreditoSms_(k) {
  var r = UrlFetchApp.fetch('https://api.skebby.it/API/v1.0/REST/status?getMoney=true', {
    headers: { user_key: k[0], Session_key: k[1] }, muteHttpExceptions: true
  });
  var st = JSON.parse(r.getContentText());
  var gp = (st.sms || []).filter(function (x) { return x.type === 'GP'; })[0];
  if (!gp) return;
  var rimasti = Number(gp.quantity);
  var props = PropertiesService.getScriptProperties();
  var ultima = Number(props.getProperty('SMS_SOGLIA_AVVISATA') || 9999);
  if (rimasti > 20) { props.deleteProperty('SMS_SOGLIA_AVVISATA'); return; }
  var soglia = rimasti <= 10 ? 10 : 20;
  if (soglia >= ultima) return;
  props.setProperty('SMS_SOGLIA_AVVISATA', String(soglia));
  var a = impostazioni_().EmailAllarmi;
  if (!a) return;
  MailApp.sendEmail({
    to: a, name: MITTENTE, inlineImages: { jarvis: logoJarvis_() }, subject: '⚠️ SMS in esaurimento: ne restano ' + rimasti,
    htmlBody: cornice_('<p style="margin:0 0 14px">Gli SMS per la firma dei contratti stanno finendo: su Skebby ne restano <b>' + rimasti + '</b>.</p>' +
      '<p style="margin:0 0 18px">Senza SMS i soci non ricevono il codice e non possono firmare. Ricarica gli <b>SMS Classic Plus</b> su Skebby.</p>' +
      '<p style="margin:0 0 18px;text-align:center"><a href="https://www.skebby.it" style="display:inline-block;background:#13556F;color:#FFFFFF;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">Ricarica gli SMS su Skebby</a></p>' +
      firmaJarvis_())
  });
  registra_('SMS', 'Avviso credito basso', rimasti + ' SMS rimasti');
}

function nuovoNumero_(tipo) {
  var anno = new Date().getFullYear();
  var props = PropertiesService.getScriptProperties();
  if (tipo === 'PROVA') {
    var np = Number(props.getProperty('NUM_PROVA') || 0) + 1;
    props.setProperty('NUM_PROVA', String(np));
    return 'PROVA-' + ('0000' + np).slice(-4);
  }
  var k = 'NUM_' + anno;
  var n = Number(props.getProperty(k) || 0) + 1;
  props.setProperty(k, String(n));
  return 'OS-' + anno + '-' + ('0000' + n).slice(-4);
}

/* ================================================================== */
/* Contratto: PDF, archivio, email                                     */
/* ================================================================== */

function creaContratto_(s, numero) {
  var imp = impostazioni_();
  var opzP = opzioniPiano_(imp); opzP.dataFirma = oggi_();
  if (s.upgrade) opzP.upgrade = { scadenza: dataDa_(s.upgrade.scadenza), cessione: !!s.upgrade.cessione };
  var piano = calcolaPiano(s.abb, s.promo, primoGiorno_(s.primoGiorno), opzP);
  var corpo = htmlContratto_(s, piano, numero, imp);
  var impronta = hash_(corpo);
  var html = corpo.replace('%%REGISTRO%%', htmlRegistro_(s, impronta));
  var nomeFile = numero + ' · ' + s.titolare.cognome + ' ' + s.titolare.nome + (s.minore ? ' (Junior ' + s.minore.nome + ')' : '') + '.pdf';
  var pdf = HtmlService.createHtmlOutput(html).getAs('application/pdf').setName(nomeFile);
  var file = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID')).createFile(pdf);

  foglio_('Contratti').appendRow([
    numero, new Date(), prefissoProva_(numero) ? 'Prova' : 'Firmato', s.abb.area, s.abb.nome,
    s.titolare.cognome + ' ' + s.titolare.nome, s.titolare.cf, s.titolare.email, s.titolare.cellulare,
    s.minore ? s.minore.cognome + ' ' + s.minore.nome : '', s.minore ? s.minore.cf : '',
    fmtData_(piano.inizio), fmtData_(piano.scadenza), piano.disdettaEntro ? fmtData_(piano.disdettaEntro) : '',
    piano.totaleFirma, piano.prezzo, s.promo ? s.promo.codice : '', file.getUrl(), file.getId(), impronta,
    JSON.stringify({ titolare: s.titolare, minore: s.minore, client: s.client, offerte: s.offerte, eventi: s.eventi })
  ]);
  var shC = foglio_('Contratti');
  shC.getRange(shC.getLastRow(), colonna_(shC, 'Pagamento alla firma') + 1).setValue(s.metodo || (piano.totaleFirma > 0 ? '' : 'Nessun pagamento'));
  if (s.upgrade) shC.getRange(shC.getLastRow(), colonna_(shC, 'Upgrade') + 1).setValue(s.upgrade.cessione
    ? 'Cessione da: ' + s.upgrade.cedente + ' · ' + s.abb.nome + ' · rata ' + euro_(s.upgrade.rata) + ' · scadenza ' + s.upgrade.scadenza + ' · registrata da ' + s.upgrade.staff
    : 'Sostituisce: ' + s.upgrade.vecchio + ' · scadenza ' + s.upgrade.scadenza + ' · registrato da ' + s.upgrade.staff);
  registra_(numero, 'Contratto firmato', s.id + ' · ' + impronta);

  // Il PDF arriva al socio 30 minuti dopo la firma (inviaContrattiSoci); per l'upgrade, fatto al circolo, subito.
  if (s.upgrade) {
    try {
      MailApp.sendEmail({ to: s.titolare.email, replyTo: imp.EmailCircolo, name: MITTENTE,
        subject: prefissoProva_(numero) + 'Il tuo contratto Officine Sportive n. ' + numero,
        htmlBody: htmlContrattoSocio_(s.titolare.nome, numero, s.abb.area, piano.abbonamento, '', fmtData_(piano.inizio), fmtData_(piano.scadenza),
          piano.disdettaEntro ? fmtData_(piano.disdettaEntro) : '', imp, false),
        attachments: [pdf] });
      shC.getRange(shC.getLastRow(), colonna_(shC, 'PDF inviato al socio') + 1).setValue(new Date());
      registra_(numero, 'PDF inviato al socio (' + (s.upgrade.cessione ? 'cessione' : 'upgrade') + ', subito)', s.titolare.email);
    } catch (eU) { registra_(numero, 'ERRORE invio PDF upgrade', String(eU)); }
  }
  if (imp.EmailStaff) {
    try { emailStaff_(s, numero, piano, pdf, imp, imp.EmailStaff); } catch (e2) { registra_(numero, 'ERRORE copia staff', String(e2)); }
  }
  return { file: file.getId(), riga: shC.getLastRow(), totaleFirma: piano.totaleFirma, ricorrente: ricorrente_(piano) };
}

function esc_(s) {
  return String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function logoDataUri_() {
  var c = CacheService.getScriptCache().get('LOGO');
  if (c) return c;
  try {
    var b = UrlFetchApp.fetch(URL_LOGO).getBlob();
    var uri = 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes());
    if (uri.length < 95000) CacheService.getScriptCache().put('LOGO', uri, 21600);
    return uri;
  } catch (e) { return ''; }
}

function riga_(k, v) { return '<tr><td class="k">' + esc_(k) + '</td><td>' + esc_(v) + '</td></tr>'; }

function htmlContratto_(s, p, numero, imp) {
  var t = s.titolare, m = s.minore, logo = logoDataUri_();
  var h = [];
  h.push('<html><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,Helvetica,sans-serif;color:#14323F;font-size:10.5px;line-height:1.45;margin:0}' +
    '.top{border-bottom:3px solid #13556F;padding-bottom:8px;margin-bottom:12px}' +
    '.top img{height:42px}.top .n{float:right;text-align:right;color:#5A707A;font-size:10px}' +
    'h1{font-size:17px;color:#13556F;margin:6px 0 2px}h2{font-size:12.5px;color:#13556F;border-bottom:2px solid #1A9DA7;padding:0 0 2px;margin:10px 0 4px;text-transform:uppercase;letter-spacing:.5px}' +
    'h3{font-size:11.5px;color:#13556F;margin:12px 0 4px;border-bottom:1px solid #D4E0E3;padding-bottom:2px}' +
    'p{margin:0 0 5px;text-align:left}table{width:100%;border-collapse:collapse}td,th{padding:3px 6px;border-bottom:1px solid #D4E0E3;vertical-align:top;text-align:left}' +
    'td.k{width:36%;color:#5A707A}td.r{text-align:right;white-space:nowrap}' +
    '.box{border:2px solid #C0392B;background:#FDF2F0;padding:9px 12px;margin:10px 0;border-radius:6px}' +
    '.box b.t{color:#C0392B;font-size:13px}.ok{color:#1A9DA7}.tot td{font-weight:bold;border-top:2px solid #13556F}' +
    '.sp{border:1px solid #D4E0E3;border-left:4px solid #1A9DA7;padding:6px 9px;margin:6px 0;border-radius:4px}' +
    '.reg td{font-size:9.5px}.hash{font-family:Courier New,monospace;font-size:9px;word-break:break-all}' +
    '.tab th{background:#EEF4F5}.pb{page-break-before:always}.small{color:#5A707A;font-size:9.5px}' +
    '</style></head><body>');
  h.push('<div class="top">' + (logo ? '<img src="' + logo + '">' : '<b style="font-size:18px;color:#13556F">OFFICINE SPORTIVE</b>') +
    '<div class="n">Contratto n. <b>' + esc_(numero) + '</b><br>Firmato il ' + fmtData_(p.firma) + '</div></div>' +
    (prefissoProva_(numero) ? '<div style="border:3px dashed #C0392B;color:#C0392B;font-weight:bold;font-size:16px;text-align:center;padding:8px;margin-bottom:10px">CONTRATTO DI PROVA · NON VALIDO</div>' : ''));
  h.push('<h1>Contratto di abbonamento · Riepilogo dell\'iscrizione</h1>');
  h.push('<p class="small">' + esc_(imp.Societa) + ' · ' + esc_(imp.Sede) + ' · Circolo ' + esc_(imp.NomeCircolo) + '</p>');

  h.push('<h2>' + (m ? 'Intestatario del contratto (genitore)' : 'Tesserato') + '</h2><table>' +
    riga_('Nome e cognome', t.nome + ' ' + t.cognome) + riga_('Codice fiscale', t.cf) +
    riga_('Nato il / a', t.nascita + ' · ' + t.luogoNascita) +
    riga_('Residenza', t.via + ' ' + t.civico + ', ' + t.cap + ' ' + t.comune + ' (' + t.provincia + ')') +
    riga_('Cellulare (firma OTP)', t.cellulare) + (t.telefono2 ? riga_('Secondo recapito', t.telefono2) : '') + riga_('Email', t.email) + '</table>');
  if (m) {
    h.push('<h2>Junior</h2><table>' + riga_('Nome e cognome', m.nome + ' ' + m.cognome) + riga_('Codice fiscale', m.cf) +
      riga_('Nato il / a', m.nascita + ' · ' + m.luogoNascita) + '</table>');
  }

  h.push('<h2>Abbonamento</h2><table>' +
    riga_('Abbonamento', p.area + ' · ' + p.abbonamento + (s.abb.tipo === 'breve' ? ' (breve termine)' : s.abb.tipo === 'lungo' ? ' (lungo termine)' : '')) +
    (s.upgrade && s.upgrade.cessione ? riga_('Cessione', 'Subentra a ' + s.upgrade.cedente + ' nell\'abbonamento in corso, alle medesime condizioni economiche: accesso dal ' + fmtData_(p.primoGiorno) +
      ', rata mensile di ' + euro_(p.prezzo) + ' dal ' + fmtData_(p.inizio) + '; resta ferma la scadenza del ' + s.upgrade.scadenza + (p.rinnovo ? ', con rinnovo tacito' : ', senza rinnovo tacito')) :
     s.upgrade ? riga_('Upgrade', 'Sostituisce l\'abbonamento ' + s.upgrade.vecchio + ' a decorrere dal ' + fmtData_(p.inizio) +
      '; resta ferma la scadenza del ' + s.upgrade.scadenza + ', con rinnovo tacito alle condizioni del presente contratto') : '') +
    (s.abb.descrizione ? riga_('Comprende', s.abb.descrizione) : '') +
    (p.fasciaOraria ? riga_('Fascia oraria di accesso', p.fasciaOraria) : '') +
    (s.abb.tipo !== 'giornaliero' ? riga_('Primo giorno di accesso', fmtData_(p.primoGiorno)) : '') +
    (p.prorata.length ? riga_('Pro rata', p.prorata.map(function (r) { return r.periodo; }).join(' e ')) : '') +
    riga_(s.abb.tipo === 'giornaliero' ? 'Valido il' : 'Inizio abbonamento', fmtData_(p.inizio)) +
    (s.abb.tipo === 'giornaliero' ? '' : riga_('Scadenza', fmtData_(p.scadenza))) +
    riga_('Rinnovo', s.abb.tipo === 'giornaliero' ? 'Non previsto' : p.rinnovo ? 'Tacito rinnovo per un periodo uguale, alle medesime condizioni (art. 3.2)' : 'Rinnovo non previsto: termina alla scadenza') +
    (p.promo ? riga_('Promozione', p.promo) : '') + '</table>');

  if (p.rinnovo && p.disdettaEntro) {
    h.push('<div class="box"><b class="t">DATA LIMITE PER LA DISDETTA: ' + (p.disdettaOgniAnno ? esc_(p.disdettaOgniAnno.toUpperCase()) + ' DI OGNI ANNO' : esc_(fmtDataLunga_(p.disdettaEntro).toUpperCase())) + '</b><br>' +
      'La prima volta è il ' + fmtDataLunga_(p.disdettaEntro) + '. Senza disdetta entro questa data l\'abbonamento si rinnova per ' +
      (s.abb.durataMesi === 12 ? '12 mesi' : 'un periodo uguale') + ' alle medesime condizioni. La disdetta è valida solo dal sito, via email a ' + esc_(imp.EmailCircolo) +
      ', via PEC o con raccomandata A/R. La disdetta verbale o telefonica non ha alcun valore, e nemmeno il messaggio WhatsApp.</div>');
  } else if (p.rinnovo || s.abb.tipo === 'breve') {
    h.push('<div class="box"><b class="t">DISDETTA</b><br>Abbonamento a breve termine: si rinnova ogni mese' + (s.abb.fineStagione ? ' fino al ' + fmtData_(p.scadenza) + ', termine della stagione,' : '') + ' salvo disdetta inviata nei modi e nei termini dell\'art. 3.3 (dal sito, via email a ' +
      esc_(imp.EmailCircolo) + ', via PEC o con raccomandata A/R). La disdetta verbale o telefonica non ha alcun valore, e nemmeno il messaggio WhatsApp.</div>');
  }

  h.push('<h2>Pagamenti</h2><table>');
  p.righeFirma.forEach(function (r) { h.push('<tr><td>' + esc_(r.voce) + '</td><td class="r">' + euro_(r.importo) + '</td></tr>'); });
  h.push('<tr class="tot"><td>Pagato alla firma</td><td class="r">' + euro_(p.totaleFirma) + '</td></tr></table><table>' +
    riga_('Piano di pagamento', p.pianoRate) +
    (s.metodo ? riga_('Pagamento alla firma', s.metodo) : '') +
    riga_('Metodo di pagamento delle rate', 'Tramite piattaforma TSPay (dati non riportati, art. 4.1)') +
    (p.penale ? riga_('Penale per rata non pagata', euro_(p.penale) + ' dal giorno 5 del mese, per ogni mese di ritardo (art. 4.3)') : '') +
    (p.garanziaFino ? riga_('Recesso convenzionale (art. 14.1)', 'Facoltà di recedere senza motivo, con rimborso integrale, entro il ' + fmtData_(p.garanziaFino)) : '') + '</table>');


  h.push('<div class="pb"></div><h2>Condizioni generali di contratto e Regolamento interno</h2>' + include_('Condizioni'));

  h.push('<h2>Approvazioni</h2>');
  SPUNTE.forEach(function (sp, i) {
    h.push('<div class="sp"><b class="ok">☑ ' + (i + 1) + ' · ' + esc_(sp.titolo) + '</b><br>' + esc_(sp.testo) + '</div>');
  });

  h.push('<h2>Informativa privacy</h2>' + informativa_(imp));
  h.push('%%REGISTRO%%</body></html>');
  return h.join('');
}

function htmlRegistro_(s, impronta) {
  var c = s.client || {};
  var r = ['<h2>Registro della firma (art. 13.3)</h2><table class="reg">'];
  s.eventi.forEach(function (e) {
    r.push('<tr><td style="width:28%">' + esc_(Utilities.formatDate(new Date(e[0]), 'Europe/Rome', 'dd/MM/yyyy HH:mm:ss')) + '</td><td>' + esc_(e[1]) + '</td></tr>');
  });
  r.push('</table><table class="reg">' +
    riga_('Firmatario', s.titolare.nome + ' ' + s.titolare.cognome + ' · ' + s.titolare.cf) +
    riga_('Cellulare dichiarato', s.titolare.cellulare) +
    riga_('Codice OTP inviato via', s.canale + ' a ' + destinatarioOtp_(s, s.canale) + (s.emailBackup ? ' e via email a ' + s.titolare.email : '') + (s.smsFallito ? ' (SMS non disponibile)' : '')) +
    riga_('Indirizzo IP', c.ip || 'non rilevato') + riga_('Dispositivo', c.ua || '') +
    riga_('Schermo e lingua', (c.schermo || '') + ' · ' + (c.lingua || '')) +
    riga_('Identificativo sessione', s.id) +
    (s.offerte && s.offerte.length ? riga_('Offerte mostrate prima della scelta (art. 2.1)', s.offerte.join(' · ')) : '') + '</table>' +
    '<p class="small" style="margin-top:6px">Impronta informatica SHA-256 del contratto (riepilogo, condizioni, approvazioni e informativa):</p><p class="hash">' + impronta + '</p>');
  return r.join('');
}

var SPUNTE = [
  { titolo: 'Accettazione del contratto', testo: 'Dichiaro di aver letto e di accettare le Condizioni generali, il Regolamento interno e l\'informativa privacy, ivi comprese le riprese foto e video effettuate nel Circolo (art. 11). Sottoscrivo il contratto mediante codice OTP inviato via SMS o, qualora l\'SMS non sia disponibile o non pervenga, via email, che vale quale mia firma.' },
  { titolo: 'Durata, rinnovo tacito e disdetta', testo: 'Ai sensi e per gli effetti degli artt. 1341 e 1342 c.c. approvo specificamente l\'art. 3: la durata è indicata nel Riepilogo; ove previsto, l\'abbonamento si rinnova tacitamente per un periodo di pari durata alle medesime condizioni, salvo disdetta pervenuta entro il giorno 5 del mese precedente la scadenza tramite il sito, via email a info@officinesportive.it, via PEC o a mezzo raccomandata; la disdetta verbale, telefonica o tramite WhatsApp è priva di effetto; l\'abbonamento non è recedibile prima della scadenza, salvo il recesso convenzionale di cui all\'art. 14.1. Qualora abbia scelto un abbonamento a lungo termine, dichiaro che mi è stato proposto anche l\'abbonamento senza vincolo e di aver liberamente optato per il corrispettivo ridotto, obbligandomi a corrispondere tutte le mensilità (art. 2).' },
  { titolo: 'Frequenza, pagamenti e regole del Circolo', testo: 'Ai sensi e per gli effetti degli artt. 1341 e 1342 c.c. approvo specificamente: l\'esclusione di recuperi, rimborsi e sospensioni per lezioni, ingressi e periodi non fruiti, anche in caso di malattia, e per le chiusure parziali (art. 5); le modalità di addebito, l\'obbligo di aggiornamento di carta e IBAN, la penale dal giorno 5 del mese e la decadenza dal beneficio del termine dalla terza rata insoluta (art. 4); le comunicazioni via email e il valore contrattuale degli avvisi in bacheca (art. 6); le regole su danni, sauna e bagno turco, parcheggio e braccialetto (artt. 7 e 8); la risoluzione senza rimborso per comportamento grave (art. 9); il tesseramento all\'Ente di promozione sportiva (art. 1.2).' }
];

/** Testi delle spunte per la pagina. */
function testiSpunte() { return SPUNTE; }

/* ---------- Email ---------- */

function cornice_(contenuto) {
  var logo = '<img src="' + URL_LOGO + '" alt="Officine Sportive" style="height:44px">';
  return '<div style="background:#EEF4F5;padding:24px 12px;font-family:Montserrat,Arial,Helvetica,sans-serif;color:#14323F">' +
    '<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #D4E0E3">' +
    '<div style="padding:20px 26px;border-bottom:4px solid #1A9DA7">' + logo + '</div>' +
    '<div style="padding:24px 26px;font-size:15px;line-height:1.55">' + contenuto + '</div>' +
    '<div style="padding:14px 26px;background:#13556F;color:#FFFFFF;font-size:12px">Officine Sportive · Via Fratelli Wright, Fiumicino (RM) · info@officinesportive.it</div>' +
    '</div></div>';
}

function rigaMail_(k, v) {
  return '<tr><td style="padding:7px 0;border-bottom:1px solid #D4E0E3;color:#5A707A;width:42%">' + esc_(k) + '</td>' +
    '<td style="padding:7px 0;border-bottom:1px solid #D4E0E3;font-weight:600">' + esc_(v) + '</td></tr>';
}

function emailStaff_(s, numero, p, pdf, imp, a) {
  var t = s.titolare;
  MailApp.sendEmail({
    to: a, name: MITTENTE, inlineImages: { jarvis: logoJarvis_() }, subject: prefissoProva_(numero) + 'Contratto ' + numero + ' · ' + t.cognome + ' ' + t.nome + ' · ' + p.abbonamento,
    htmlBody: cornice_(
      '<p style="margin:0 0 12px">Nuovo contratto firmato, da caricare su Wellness in Cloud.</p><table style="width:100%;border-collapse:collapse;font-size:14px">' +
      rigaMail_('Contratto', numero) + rigaMail_('Intestatario', t.cognome + ' ' + t.nome + ' · ' + t.cf) +
      (s.minore ? rigaMail_('Junior', s.minore.cognome + ' ' + s.minore.nome + ' · ' + s.minore.cf) : '') +
      rigaMail_('Abbonamento', p.area + ' · ' + p.abbonamento) + rigaMail_('Inizio / scadenza', fmtData_(p.inizio) + ' – ' + fmtData_(p.scadenza)) +
      rigaMail_('Pagato alla firma', euro_(p.totaleFirma)) + rigaMail_('Promo', s.promo ? s.promo.codice : '—') +
      rigaMail_('Cellulare', t.cellulare) + rigaMail_('Email', t.email) + '</table>' +
      firmaJarvis_()),
    attachments: [pdf]
  });
}

/* ================================================================== */
/* Back office (PIN verificato sul server)                             */
/* ================================================================== */

function boLogin(pin, dispositivo) {
  var cache = CacheService.getScriptCache();
  dispositivo = String(dispositivo || 'x').replace(/[^a-z0-9]/gi, '').substr(0, 40) || 'x';
  if (cache.get('BO_BLOCCO')) return { ok: false, errore: 'Accesso sospeso per sicurezza. Riprova più tardi.' };

  pin = String(pin || '').trim();
  var utente = pin ? righe_('PIN').filter(function (r) { return si_(r.Attivo) && String(r.PIN).trim() === pin; })[0] : null;

  if (utente) {
    // PIN corretto: sblocca il dispositivo e fai entrare
    cache.remove('BO_ERR_' + dispositivo);
    var token = hash_(Utilities.getUuid() + Utilities.getUuid() + Date.now());
    cache.put('BO_T_' + token, String(utente.Nome), BO_SESSIONE_SEC);
    registra_('BACK OFFICE', 'Accesso', utente.Nome);
    return { ok: true, token: token, nome: utente.Nome, emailStaff: impostazioni_().EmailStaff || '' };
  }

  // PIN errato: applica il blocco dispositivo
  var kd = 'BO_ERR_' + dispositivo;
  var errD = Number(cache.get(kd) || 0);
  if (errD >= BO_TENTATIVI_DISPOSITIVO) return { ok: false, errore: 'Troppi tentativi da questo dispositivo. Riprova tra 30 minuti.' };
  cache.put(kd, String(errD + 1), 1800);
  var errG = Number(cache.get('BO_ERR_GLOBALI') || 0) + 1;
  cache.put('BO_ERR_GLOBALI', String(errG), 3600);
  registra_('BACK OFFICE', 'PIN errato', 'dispositivo ' + dispositivo + ' · tentativo ' + (errD + 1));
  if (errG >= BO_TENTATIVI_GLOBALI_ORA) {
    cache.put('BO_BLOCCO', '1', 3600);
    allarme_('Back office App Contratti bloccato per un\'ora: ' + errG + ' PIN errati nell\'ultima ora.');
  } else if (errD + 1 === BO_TENTATIVI_DISPOSITIVO) {
    allarme_('App Contratti: ' + BO_TENTATIVI_DISPOSITIVO + ' PIN errati di fila dallo stesso dispositivo. Accesso bloccato per 30 minuti su quel dispositivo.');
  }
  Utilities.sleep(1200);
  return { ok: false, errore: 'PIN non valido.' };
}

/**
 * Primo accesso: il ragazzo sceglie nome e PIN (lo stesso dell'app turni).
 * Possibile solo fino alla data in Impostazioni › RegistrazioneFinoAl (se manca: 30/11/2026).
 * Dopo quella data la registrazione è chiusa e si entra solo con i PIN già nel foglio.
 */
function boRegistrazioneAperta() {
  var fino = dataDa_(impostazioni_().RegistrazioneFinoAl) || dt_(2026, 10, 30);
  return oggi_() <= fino;
}

function boRegistra(nome, pin, pin2, dispositivo) {
  if (!boRegistrazioneAperta()) return { ok: false, errore: 'La registrazione è chiusa. Chiedi ad Andrea di aggiungerti.' };
  var cache = CacheService.getScriptCache();
  var n = Number(cache.get('BO_REG') || 0);
  if (n >= 10) return { ok: false, errore: 'Troppe registrazioni. Riprova più tardi.' };
  nome = maiuscoleNome_(nome);
  pin = String(pin || '').trim();
  if (nome.length < 2) return { ok: false, errore: 'Scrivi il tuo nome.' };
  if (!/^\d{4,8}$/.test(pin)) return { ok: false, errore: 'Il PIN deve avere da 4 a 8 cifre.' };
  if (pin !== String(pin2 || '').trim()) return { ok: false, errore: 'I due PIN non coincidono.' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var tutti = righe_('PIN');
    if (tutti.some(function (r) { return String(r.Nome).trim().toLowerCase() === nome.toLowerCase() && si_(r.Attivo); })) {
      return { ok: false, errore: nome + ' è già registrato: entra con il tuo PIN.' };
    }
    if (tutti.some(function (r) { return String(r.PIN).trim() === pin && si_(r.Attivo); })) {
      return { ok: false, errore: 'Questo PIN non è disponibile: scegline un altro.' };
    }
    foglio_('PIN').appendRow(['SI', nome, "'" + pin]);
  } finally { lock.releaseLock(); }
  cache.put('BO_REG', String(n + 1), 3600);
  registra_('BACK OFFICE', 'Registrazione', nome);
  allarme_('Nuova registrazione al back office dell\'App Contratti: ' + nome + '. Se non è uno dei ragazzi, nel foglio scheda PIN metti NO sulla sua riga.');
  return boLogin(pin, dispositivo);
}

function utenteBo_(token) {
  var n = CacheService.getScriptCache().get('BO_T_' + String(token || '').replace(/[^a-f0-9]/g, ''));
  if (!n) throw new Error('SESSIONE');
  return n;
}

function boEsci(token) { CacheService.getScriptCache().remove('BO_T_' + String(token || '').replace(/[^a-f0-9]/g, '')); return true; }

/** Testo di una cella: le date diventano gg/mm/aaaa. */
function cella_(x) { return x instanceof Date ? fmtData_(x) : String(x === undefined || x === null ? '' : x); }

/** Indice (0-based) di una colonna di Contratti; se manca la crea in fondo. */
function colonna_(sh, titolo) {
  var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var k = h.indexOf(titolo);
  if (k >= 0) return k;
  sh.getRange(1, h.length + 1).setValue(titolo).setFontWeight('bold').setBackground('#13556F').setFontColor('#FFFFFF');
  return h.length;
}

/**
 * Elenco per il back office. filtro: 'da' = da inserire nel gestionale, 'fatti' = inseriti, '' = tutti.
 * Ritorna { contratti: [...], daInserire: n }.
 */
function boElenco(token, cerca, filtro) {
  utenteBo_(token);
  var sh = foglio_('Contratti');
  var cg = colonna_(sh, 'Inserito nel gestionale');
  var cm = colonna_(sh, 'Pagamento alla firma');
  var cc = colonna_(sh, 'Pagamento con carta');
  var cu = colonna_(sh, 'Upgrade');
  var v = sh.getDataRange().getValues();
  v.shift();
  cerca = String(cerca || '').trim().toLowerCase();
  var out = [], daInserire = 0;
  for (var i = v.length - 1; i >= 0; i--) {
    var r = v[i];
    if (!r[0]) continue;
    var inserito = cella_(r[cg]);
    var prova = !!prefissoProva_(r[0]);
    if (!inserito && !prova) daInserire++;
    if (filtro === 'da' && (inserito || prova)) continue;
    if (filtro === 'fatti' && !inserito) continue;
    var testo = [r[0], r[4], r[5], r[6], r[7], r[9], r[10]].join(' ').toLowerCase();
    if (cerca && testo.indexOf(cerca) < 0) continue;
    if (out.length >= 80) continue;
    var d = {}; try { d = JSON.parse(r[20] || '{}'); } catch (e) {}
    var t = d.titolare || {}, m = d.minore || null;
    out.push({
      numero: r[0], data: r[1] instanceof Date ? Utilities.formatDate(r[1], 'Europe/Rome', 'dd/MM/yyyy HH:mm') : cella_(r[1]),
      area: r[3], abbonamento: r[4], intestatario: r[5], cf: r[6], email: r[7], cellulare: r[8], junior: r[9],
      inizio: cella_(r[11]), scadenza: cella_(r[12]), disdetta: cella_(r[13]),
      totale: euro_(r[14]), rata: euro_(r[15]), promo: cella_(r[16]), metodo: cella_(r[cm]), carta: cella_(r[cc]), upgrade: cella_(r[cu]), inserito: inserito, prova: prova,
      dettagli: {
        nome: t.nome || '', cognome: t.cognome || '', nascita: (t.nascita || '') + (t.luogoNascita ? ' · ' + t.luogoNascita : ''),
        indirizzo: t.via ? t.via + ' ' + t.civico + ', ' + t.cap + ' ' + t.comune + ' (' + t.provincia + ')' : '',
        telefono2: t.telefono2 || '',
        junior: m ? { nome: m.nome, cognome: m.cognome, cf: m.cf, nascita: m.nascita + (m.luogoNascita ? ' · ' + m.luogoNascita : '') } : null
      }
    });
  }
  return { contratti: out, daInserire: daInserire };
}

var METODI_DEFAULT = 'Contanti;Bancomat';
var METODO_CARTA = 'Carte online';
function metodiPagamento_(imp) {
  var m = String(imp.ModalitaPagamento || METODI_DEFAULT).split(';').map(function (x) { return x.trim(); }).filter(String)
    .filter(function (x) { return x !== METODO_CARTA; });
  if (sumupAttivo_()) m.push(METODO_CARTA);   // compare da sola quando SumUp è configurato
  return m;
}

/** Codici sconto attivi oggi, per il riquadro del back office. */
function boPromo(token) {
  utenteBo_(token);
  var oggi = oggi_();
  var nomi = {};
  listino_().forEach(function (a) { nomi[a.id.toUpperCase()] = a.nome; });
  return righe_('Promo').filter(function (r) {
    if (!si_(r.Attivo) || !r.Codice || si_(r.Omaggio)) return false;     // gli omaggi (VIP82) non si mostrano ai ragazzi
    var dal = dataDa_(r.ValidoDal), al = dataDa_(r.ValidoAl);
    return !((dal && oggi < dal) || (al && oggi > al));
  }).map(function (r) {
    var ab = String(r.Abbonamenti || 'TUTTI').toUpperCase().split(/[,;\s]+/).filter(String);
    return {
      codice: normalizzaCodice_(r.Codice), descrizione: String(r.Descrizione || ''),
      fino: dataDa_(r.ValidoAl) ? fmtData_(dataDa_(r.ValidoAl)) : 'sempre valido',
      abbonamenti: ab.indexOf('TUTTI') >= 0 ? 'Tutti gli abbonamenti' : ab.map(function (x) { return nomi[x] || x; }).join(', '),
      note: String(r.Note || '')
    };
  });
}

/** Il ragazzo conferma di aver inserito il contratto nel gestionale. */
function boSegnaGestionale(token, numero) {
  var nome = utenteBo_(token);
  var sh = foglio_('Contratti');
  var cg = colonna_(sh, 'Inserito nel gestionale');
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    if (v[i][0] !== numero) continue;
    if (v[i][cg]) return { ok: true, inserito: cella_(v[i][cg]) };
    var testo = Utilities.formatDate(new Date(), 'Europe/Rome', 'dd/MM/yyyy HH:mm') + ' · ' + nome;
    sh.getRange(i + 1, cg + 1).setValue(testo);
    registra_(numero, 'Inserito nel gestionale', nome);
    return { ok: true, inserito: testo };
  }
  return { ok: false, errore: 'Contratto non trovato.' };
}

function fileDi_(numero) {
  var v = foglio_('Contratti').getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (v[i][0] === numero) return { file: DriveApp.getFileById(v[i][18]), riga: v[i] };
  throw new Error('Contratto non trovato.');
}

function boPdf(token, numero) {
  var nome = utenteBo_(token);
  var f = fileDi_(numero).file;
  registra_(numero, 'PDF scaricato dal back office', nome);
  return { nome: f.getName(), base64: Utilities.base64Encode(f.getBlob().getBytes()) };
}

function boInvia(token, numero, email) {
  var nome = utenteBo_(token);
  email = String(email || '').trim().toLowerCase();
  if (!emailValida_(email)) return { ok: false, errore: 'Email non valida.' };
  var x = fileDi_(numero), r = x.riga;
  var alSocio = email === String(r[7]).trim().toLowerCase() || email.indexOf('@officinesportive.it') < 0;
  var mail;
  if (alSocio) {
    // Mail a un socio: stessa mail del contratto, firmata dal team
    var d = {}; try { d = JSON.parse(r[20] || '{}'); } catch (e) {}
    var nomeSocio = d.titolare ? d.titolare.nome : String(r[5]).split(' ').slice(1).join(' ');
    mail = { to: email, replyTo: impostazioni_().EmailCircolo, name: MITTENTE,
      subject: prefissoProva_(numero) + 'Il tuo contratto Officine Sportive n. ' + numero,
      htmlBody: htmlContrattoSocio_(nomeSocio, numero, r[3], r[4], d.minore ? d.minore.nome : '', cella_(r[11]), cella_(r[12]), cella_(r[13]), impostazioni_(), cartaRicorrente_(r)) };
  } else {
    // Mail allo staff: firmata da Jarvis
    mail = { to: email, name: MITTENTE, inlineImages: { jarvis: logoJarvis_() }, subject: prefissoProva_(numero) + 'Contratto ' + numero + ' · ' + r[5] + ' · ' + r[4],
      htmlBody: cornice_('<p style="margin:0 0 12px">Ciao,</p><p style="margin:0 0 12px">in allegato trovi il contratto <b>' + esc_(numero) + '</b> di ' + esc_(r[5]) +
        ' (' + esc_(r[3]) + ' · ' + esc_(r[4]) + '), richiesto dal back office da ' + esc_(nome) + '.</p>' +
        firmaJarvis_()) };
  }
  mail.attachments = [x.file.getBlob()];
  MailApp.sendEmail(mail);
  registra_(numero, 'PDF inviato dal back office', nome + ' → ' + email + (alSocio ? ' (socio)' : ' (staff)'));
  return { ok: true };
}

function allarme_(testo) {
  var a = impostazioni_().EmailAllarmi;
  if (!a) return;
  MailApp.sendEmail({ to: a, name: MITTENTE, inlineImages: { jarvis: logoJarvis_() }, subject: '⚠️ App Contratti · allarme sicurezza',
    htmlBody: cornice_('<p style="margin:0">' + esc_(testo) + '</p>' + firmaJarvis_()) });
}

/* ================================================================== */
/* Mail "Info utili" la mattina dopo l'iscrizione                       */
/* ================================================================== */

function htmlInfoUtili_(nome) {
  function blocco(icona, titolo, testo) {
    return '<tr><td style="padding:14px 0;border-bottom:1px solid #D4E0E3">' +
      '<div style="font-weight:700;color:#13556F;font-size:15px;margin-bottom:4px">' + icona + ' ' + titolo + '</div>' +
      '<div style="font-size:14px;line-height:1.55;color:#14323F">' + testo + '</div></td></tr>';
  }
  function bottone(url, testo) {
    return '<a href="' + url + '" style="display:inline-block;margin-top:8px;background:#1A9DA7;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:13px;padding:9px 16px;border-radius:9px">' + testo + '</a>';
  }
  return cornice_(
    '<div style="margin:-24px -26px 20px;padding:28px 26px;background:#13556F;background-image:linear-gradient(135deg,#13556F,#1A9DA7);color:#FFFFFF">' +
    '<div style="font-size:26px;font-weight:800;letter-spacing:.3px">Benvenuto! 👋</div>' +
    '<div style="font-size:14px;opacity:.9;margin-top:4px">Da oggi fai parte della famiglia di Officine Sportive</div></div>' +
    '<p style="margin:0 0 14px">Ciao ' + esc_(nome) + '! 💪</p>' +
    '<p style="margin:0 0 8px">Benvenuto in Officine Sportive, siamo felicissimi di averti con noi! Ecco tutto quello che ti serve per partire alla grande.</p>' +
    '<p style="margin:0 0 4px;font-size:13px;letter-spacing:1px;font-weight:700;color:#1A9DA7">ℹ️ INFO UTILI</p>' +
    '<table style="width:100%;border-collapse:collapse">' +
    blocco('👨‍⚕️', 'Certificato medico', 'Il nostro medico convenzionato, <b>Dr. Domenico Bisogno</b>, riceve senza appuntamento:<br>🗓️ lunedì e mercoledì 15-18, martedì e giovedì 11:30-15, venerdì 17-19<br>📍 Viale Donato Bramante 47') +
    blocco('⏱️', 'Orario dei corsi', 'Puoi consultarlo sul nostro sito.<br>' + bottone('https://www.officinesportive.it/orari/', 'Vedi gli orari')) +
    blocco('🏋️‍♀️', 'Fit-check', 'Fissa in reception un appuntamento per la prima scheda di allenamento in sala pesi, oppure prenotalo online.<br>' + bottone('https://script.google.com/macros/s/AKfycbxjfZhlL2WBKQeXZ6lm9mEOZcfQ_SmKw8-w-R4sG4Sb9nJCM4phcU_vm82qTyUuZVKO/exec', 'Prenota il fit-check')) +
    blocco('🎾', 'Padel', 'Scarica la nostra app per gestire partite e prenotazioni.<br>' + bottone('https://tinyurl.com/Officine-Sportive', 'Scarica l\'app')) +
    blocco('🧖‍♂️', 'Servizio asciugamani', 'Telo asciugamano grande a ogni allenamento per soli <b>12 € al mese</b>. Attivalo in reception!') +
    blocco('➕', 'Un mese gratis', 'Se si iscrive un tuo amico, per te un mese gratis!') +
    '</table>' +
    '<p style="margin:18px 0 6px"><b>📞 Non esitare a contattarci: siamo qui per te!</b><br>📱 375 599 2375 &nbsp;·&nbsp; ☎️ 06 6595 5545</p>' +
    '<p style="margin:12px 0 0">🔵🔴 Seguici sui nostri canali social:<br>' +
    '<a href="https://bit.ly/OfficineSportive_Facebook" style="color:#13556F;font-weight:700">Facebook</a> &nbsp;·&nbsp; ' +
    '<a href="https://bit.ly/OfficineSportive_Instagram" style="color:#13556F;font-weight:700">Instagram</a></p>' +
    firmaTeam_());
}

/** Ogni mattina: mail di benvenuto a chi ha firmato il giorno prima (adulti e scuola nuoto; centro estivo da preparare). */
function inviaInfoUtili() {
  var sh = foglio_('Contratti');
  var v = sh.getDataRange().getValues();
  var col = v[0].indexOf('Info utili inviata');
  if (col < 0) { col = v[0].length; sh.getRange(1, col + 1).setValue('Info utili inviata').setFontWeight('bold').setBackground('#13556F').setFontColor('#FFFFFF'); }
  var oggi = oggi_();
  var imp = impostazioni_();
  var cMet = colonna_(sh, 'Pagamento alla firma'), cCar = colonna_(sh, 'Pagamento con carta'), cUpg = v[0].indexOf('Upgrade');
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (!r[0] || r[col]) continue;
    if (cartaDaPagare_(r, cMet, cCar)) continue;          // Carte online non ancora pagata: niente benvenuto
    if (cUpg >= 0 && r[cUpg] && !/^Cessione/.test(String(r[cUpg]))) continue;   // upgrade: è già socio, niente benvenuto (la cessione sì: è un socio nuovo)
    var firmato = r[1] instanceof Date ? dt_(r[1].getFullYear(), r[1].getMonth(), r[1].getDate()) : null;
    if (!firmato || firmato >= oggi) continue;
    var dati = {}; try { dati = JSON.parse(r[20] || '{}'); } catch (e) {}
    var nome = dati.titolare ? dati.titolare.nome : String(r[5]).split(' ').slice(1).join(' ');
    var oggetto, html;
    if (!r[9]) {                                            // adulti
      oggetto = 'Benvenuto in Officine Sportive! 👋'; html = htmlInfoUtili_(nome);
    } else if (r[3] === 'Scuola nuoto' && dati.minore) {    // scuola nuoto
      var st = stagioneNuoto_(firmato);
      oggetto = '🐠 Benvenuti alla Scuola Nuoto Bambini ' + st + '!';
      html = htmlBenvenutoNuoto_(nome, dati.minore.nome, dati.minore.sesso === 'F', st);
    } else {
      continue;                                             // centro estivo: mail da preparare
    }
    try {
      MailApp.sendEmail({ to: r[7], replyTo: imp.EmailCircolo, name: MITTENTE,
        subject: prefissoProva_(r[0]) + oggetto, htmlBody: html });
      sh.getRange(i + 1, col + 1).setValue(new Date());
      registra_(r[0], 'Info utili inviata', r[7]);
    } catch (e2) { registra_(r[0], 'ERRORE Info utili', String(e2)); }
  }
}

/** Mail di benvenuto Scuola nuoto (al genitore, con il nome del bambino). */
function htmlBenvenutoNuoto_(genitore, bimbo, femmina, stagione) {
  function riga(icona, titolo, testo) {
    return '<tr><td style="width:46px;vertical-align:top;padding:12px 0"><div style="width:38px;height:38px;border-radius:50%;background:#E3F4F5;text-align:center;line-height:38px;font-size:19px">' + icona + '</div></td>' +
      '<td style="vertical-align:top;padding:12px 0 12px 6px"><div style="font-weight:700;color:#13556F;font-size:15px">' + titolo + '</div>' +
      '<div style="font-size:14px;line-height:1.55;color:#14323F">' + testo + '</div></td></tr>';
  }
  var lui = femmina ? 'lei' : 'lui';
  return cornice_(
    '<div style="margin:-24px -26px 20px;padding:30px 26px 26px;background:#13556F;background-image:linear-gradient(135deg,#13556F,#1A9DA7);color:#FFFFFF;text-align:center">' +
    '<div style="font-size:40px;line-height:1">🐠🏊‍♂️💦</div>' +
    '<div style="font-size:25px;font-weight:800;margin-top:10px">' + (femmina ? 'Benvenuta' : 'Benvenuto') + ' in vasca, ' + esc_(bimbo) + '!</div>' +
    '<div style="font-size:14px;opacity:.9;margin-top:6px">Scuola Nuoto Bambini · stagione ' + esc_(stagione) + '</div></div>' +
    '<p style="margin:0 0 12px">Ciao ' + esc_(genitore) + '! 👋</p>' +
    '<p style="margin:0 0 6px">Che bello avere ' + esc_(bimbo) + ' con noi! Ci aspetta una stagione piena di <b>divertimento, crescita e tanti traguardi in acqua</b>, e non vediamo l\'ora di iniziare insieme a ' + lui + '. 💙</p>' +
    '<p style="margin:16px 0 0;font-size:13px;letter-spacing:1px;font-weight:700;color:#1A9DA7">COSA SAPERE</p>' +
    '<table style="width:100%;border-collapse:collapse">' +
    riga('🏅', 'Swim Check ogni due mesi', 'Ogni due mesi, dall\'inizio della scuola nuoto, riceverete via mail e WhatsApp i risultati dello <b>Swim Check</b> di ' + esc_(bimbo) + ': un piccolo momento di condivisione per capire insieme quanta strada ha fatto il vostro pesciolino. 🐟') +
    riga('🚿', 'Doccia veloce e spogliatoi', 'Nello spogliatoio bambini la doccia è veloce, e vi consigliamo di tenere il costume indossato. Un po\' di velocità è importante: così tutti i bambini riescono a fare la doccia e gli spogliatoi restano il più liberi possibile. Grazie! 💦') +
    riga('🚫', 'Spogliatoio adulti', '<b style="color:#C0392B">È assolutamente vietato usare lo spogliatoio adulti o portarvi i propri figli.</b> Per il regolamento del Circolo sulla tutela dei minori, i bambini non possono entrare nello spogliatoio adulti per nessun motivo.') +
    '</table>' +
    '<p style="margin:16px 0 0">Grazie per la collaborazione e buona stagione a tutta la famiglia! 💙🐠</p>' +
    '<p style="margin:12px 0 0;font-size:14px;color:#5A707A">Per qualsiasi domanda siamo qui: 📱 375 599 2375 · ☎️ 06 6595 5545</p>' +
    firmaTeam_());
}

/** Swim Check a fine novembre, gennaio, marzo e maggio. */
function prossimoSwimCheck_(d) {
  var mesi = [10, 0, 2, 4], nomi = { 10: 'novembre', 0: 'gennaio', 2: 'marzo', 4: 'maggio' };
  for (var k = 0; k < 12; k++) {
    var m = (d.getMonth() + k) % 12;
    if (mesi.indexOf(m) >= 0) return nomi[m];
  }
  return 'novembre';
}

function stagioneNuoto_(d) {
  var y = d.getFullYear(), da = d.getMonth() >= 7 ? y : y - 1;
  return da + '/' + String(da + 1).slice(-2);
}

/** Ogni 10 minuti: manda il PDF del contratto al socio, 30 minuti dopo la firma. */
function inviaContrattiSoci() {
  try { controllaPagamentiCarta(); } catch (e) { registra_('SumUp', 'ERRORE controllo pagamenti', String(e)); }
  try { annullaNonPagati(); } catch (e) { registra_('SumUp', 'ERRORE annullamento non pagati', String(e)); }
  try { insolutiSumup_(); } catch (e) { registra_('SumUp', 'ERRORE insoluti', String(e)); }
  try { archiviaRinnovi_(); } catch (e) { registra_('Rinnovo tacito', 'ERRORE archivio', String(e)); }
  var sh = foglio_('Contratti');
  var cMet = colonna_(sh, 'Pagamento alla firma'), cCar = colonna_(sh, 'Pagamento con carta');
  var v = sh.getDataRange().getValues();
  var col = v[0].indexOf('PDF inviato al socio');
  if (col < 0) { col = v[0].length; sh.getRange(1, col + 1).setValue('PDF inviato al socio').setFontWeight('bold').setBackground('#13556F').setFontColor('#FFFFFF'); }
  var limite = Date.now() - 30 * 60000;
  var imp = impostazioni_();
  for (var i = 1; i < v.length; i++) {
    var r = v[i];
    if (!r[0] || r[col] || !(r[1] instanceof Date) || r[1].getTime() > limite) continue;
    if (cartaDaPagare_(r, cMet, cCar)) continue;          // Carte online: il PDF parte solo dopo il pagamento
    var dati = {}; try { dati = JSON.parse(r[20] || '{}'); } catch (e) {}
    var nome = dati.titolare ? dati.titolare.nome : String(r[5]).split(' ').slice(1).join(' ');
    try {
      var pdf = DriveApp.getFileById(r[18]).getBlob();
      MailApp.sendEmail({ to: r[7], replyTo: imp.EmailCircolo, name: MITTENTE,
        subject: prefissoProva_(r[0]) + 'Il tuo contratto Officine Sportive n. ' + r[0],
        htmlBody: htmlContrattoSocio_(nome, r[0], r[3], r[4], dati.minore ? dati.minore.nome : '', cella_(r[11]), cella_(r[12]), cella_(r[13]), imp, cartaRicorrente_(r)),
        attachments: [pdf] });
      sh.getRange(i + 1, col + 1).setValue(new Date());
      registra_(r[0], 'PDF inviato al socio', r[7]);
    } catch (e2) { registra_(r[0], 'ERRORE invio PDF al socio', String(e2)); }
  }
  try { eliminaProve(); } catch (e3) { registra_('Prove', 'ERRORE eliminazione prove', String(e3)); }
  try { jarvisBattito_('OK', 'giro dei contratti fatto'); } catch (e4) { }
}

/** Pagato con Carte online e con rate mensili: al primo ingresso va registrata la carta. */
function cartaRicorrente_(r) {
  var k = foglio_('Contratti').getRange(1, 1, 1, r.length).getValues()[0].indexOf('SumUp');
  if (k < 0 || !r[k]) return false;
  try { return !!JSON.parse(String(r[k])).ric; } catch (e) { return false; }
}

function htmlContrattoSocio_(nome, numero, area, abb, junior, inizio, scadenza, disdetta, imp, cartaRic) {
  function rr(k, val) {
    return '<tr><td style="padding:8px 0;border-bottom:1px solid #D4E0E3;color:#5A707A;width:42%">' + k + '</td>' +
      '<td style="padding:8px 0;border-bottom:1px solid #D4E0E3;font-weight:600">' + esc_(val) + '</td></tr>';
  }
  return cornice_(
    '<p style="margin:0 0 12px">Ciao ' + esc_(nome) + '! 👋</p>' +
    '<p style="margin:0 0 14px">Grazie per aver scelto Officine Sportive! In allegato trovi il tuo <b>contratto firmato</b>, con le condizioni generali e il regolamento: conservalo, ti sarà utile.</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px">' +
    rr('Contratto', 'n. ' + numero) + rr('Abbonamento', area + ' · ' + abb + (junior ? ' per ' + junior : '')) +
    (inizio === scadenza ? rr('Valido il', inizio) : rr('Dal', inizio) + rr('Al', scadenza)) + '</table>' +
    (disdetta ? '<div style="border-left:4px solid #C0392B;background:#FDF2F0;padding:12px 14px;border-radius:8px;margin:0 0 16px;font-size:14px">' +
      '<b>📌 Ricorda la data per la disdetta: entro il ' + esc_(disdetta) + '</b><br>Senza disdetta l\'abbonamento si rinnova alle medesime condizioni. La trovi anche nella prima pagina del contratto.</div>' : '') +
    (cartaRic ? '<div style="border-left:4px solid #1A9DA7;background:#EEF4F5;padding:12px 14px;border-radius:8px;margin:0 0 16px;font-size:14px">' +
      '<b>💳 Al tuo primo ingresso</b><br>L\'iscrizione si completa al circolo: in reception registreremo la tua carta per l\'addebito delle rate mensili. Ci vuole solo un minuto.</div>' : '') +
    '<p style="margin:0">Per qualsiasi domanda contattaci: 📱 375 599 2375 · ☎️ 06 6595 5545 · ✉️ info@officinesportive.it</p>' +
    firmaTeam_());
}

/** Firma delle mail ai soci (quelle allo staff sono firmate da Jarvis). */
function firmaTeam_() {
  return '<p style="margin:22px 0 0">Un caro saluto,<br><b>Il team di Officine Sportive</b></p>';
}

/** Firma delle mail allo staff e ad Andrea: «Un caro saluto, Jarvis» con il logo animato (la farfalla). */
var JARVIS_LOGO_ID = '1DHgfuA8S-FU5cZ_bAwjwwCZRxiMQN1oJ';   // jarvis-logo.gif nel Drive di officinesportive3
function firmaJarvis_() {
  return '<table role="presentation" style="margin:20px 0 0"><tr><td style="vertical-align:middle;padding-right:10px"><img src="cid:jarvis" width="56" height="56" alt="Jarvis"></td>' +
    '<td style="vertical-align:middle;font-size:15px">Un caro saluto,<br><b>Jarvis</b></td></tr></table>';
}
function logoJarvis_() { return DriveApp.getFileById(JARVIS_LOGO_ID).getBlob().setName('jarvis.gif'); }

/** Jarvis: nome e versione di questo processo nel Registro (la Sentinella lo controlla). */
function jarvisProcesso_() { return { nome: 'App Contratti', versione: '2026-11-23.1', account: 'officinesportive3' }; }


/* ================================================================== */
/* Pagamento con carta online · SumUp (Hosted Checkout)                */
/* Proprietà dello script: SUMUP_API_KEY (chiave segreta),             */
/* SUMUP_MERCHANT_CODE (codice esercente, inizia con MC).              */
/* Colonne in Contratti: "Pagamento con carta" (stato leggibile) e     */
/* "SumUp" (dati tecnici: id del pagamento, link, codice di ritorno).  */
/* ================================================================== */

function sumupAttivo_() {
  var p = PropertiesService.getScriptProperties();
  return !!(p.getProperty('SUMUP_API_KEY') && p.getProperty('SUMUP_MERCHANT_CODE'));
}

function sumup_(metodo, percorso, corpo) {
  var p = PropertiesService.getScriptProperties();
  var r = UrlFetchApp.fetch('https://api.sumup.com/v0.1' + percorso, {
    method: metodo, contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + p.getProperty('SUMUP_API_KEY') },
    payload: corpo ? JSON.stringify(corpo) : undefined
  });
  var c = r.getResponseCode(), t = r.getContentText();
  if (c >= 300) throw new Error('SumUp ' + c + ': ' + t);
  return t ? JSON.parse(t) : {};
}

/** Crea il pagamento su SumUp per quanto dovuto alla firma e lo annota nella riga del contratto. */
function nuovoPagamentoCarta_(numero, riga, importo, s) {
  var sh = foglio_('Contratti');
  var cc = colonna_(sh, 'Pagamento con carta'), cs = colonna_(sh, 'SumUp');
  var prima = {}; try { prima = JSON.parse(String(sh.getRange(riga, cs + 1).getValue() || '{}')); } catch (e) {}
  var token = prima.token || Utilities.getUuid().replace(/-/g, '');
  var tentativo = Number(prima.n || 0) + 1;
  var co = sumup_('post', '/checkouts', {
    amount: Number(Number(importo).toFixed(2)), currency: 'EUR',
    checkout_reference: numero + '-' + tentativo,
    description: 'Officine Sportive · contratto ' + numero + ' · ' + s.abb.nome,
    merchant_code: PropertiesService.getScriptProperties().getProperty('SUMUP_MERCHANT_CODE'),
    redirect_url: ScriptApp.getService().getUrl() + '?pagato=' + token,
    hosted_checkout: { enabled: true }
  });
  sh.getRange(riga, cs + 1).setValue(JSON.stringify({ id: co.id, ids: (prima.ids || (prima.id ? [prima.id] : [])).concat([co.id]), url: co.hosted_checkout_url, token: token, n: tentativo, importo: importo, ric: !!s.ricorrente }));
  sh.getRange(riga, cc + 1).setValue('Da pagare');
  registra_(numero, 'Pagamento con carta creato su SumUp', euro_(importo) + ' · ' + co.id);
  return { url: co.hosted_checkout_url, token: token, importo: euro_(importo), ricorrente: !!s.ricorrente };
}

function rigaDaToken_(token) {
  token = String(token || '').replace(/[^a-f0-9]/gi, '');
  if (token.length < 20) return null;
  var sh = foglio_('Contratti');
  var cs = colonna_(sh, 'SumUp');
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    var d = {}; try { d = JSON.parse(String(v[i][cs] || '{}')); } catch (e) {}
    if (d.token === token) return { sh: sh, riga: i + 1, r: v[i], d: d };
  }
  return null;
}

/** Chiede a SumUp l'esito e lo scrive nel foglio. Ritorna 'PAID', 'PENDING', 'FAILED' o 'EXPIRED'. */
function aggiornaPagamento_(sh, riga, numero, d) {
  var cc = colonna_(sh, 'Pagamento con carta');
  var attuale = String(sh.getRange(riga, cc + 1).getValue());
  if (attuale.indexOf('Pagato') === 0) return 'PAID';
  var st = statoSumup_(d);
  if (st === 'PAID') {
    sh.getRange(riga, cc + 1).setValue('Pagato ✓ ' + Utilities.formatDate(new Date(), 'Europe/Rome', 'dd/MM/yyyy HH:mm'));
    registra_(numero, 'Pagamento con carta riuscito', euro_(d.importo) + ' · ' + d.id);
  } else if (st === 'FAILED' || st === 'EXPIRED') {
    if (attuale !== 'Non riuscito') registra_(numero, 'Pagamento con carta non riuscito', st + ' · ' + d.id);
    sh.getRange(riga, cc + 1).setValue('Non riuscito');
  }
  return st;
}

/** Stato su SumUp: PAID se almeno uno dei pagamenti creati per il contratto risulta pagato. */
function statoSumup_(d) {
  var ids = d.ids || (d.id ? [d.id] : []), ultimo = 'PENDING';
  for (var k = 0; k < ids.length; k++) {
    var st = String(sumup_('get', '/checkouts/' + encodeURIComponent(ids[k])).status || 'PENDING').toUpperCase();
    if (st === 'PAID') return 'PAID';
    if (ids[k] === d.id) ultimo = st;
  }
  return ultimo;
}

/** Pagina di ritorno da SumUp: stato del pagamento. */
function statoPagamento(token) {
  var x = rigaDaToken_(token);
  if (!x) return { ok: false };
  var st = aggiornaPagamento_(x.sh, x.riga, x.r[0], x.d);
  return { ok: true, stato: st, numero: x.r[0], importo: euro_(x.d.importo), url: st === 'PENDING' ? x.d.url : '', ricorrente: !!x.d.ric };
}

/** Pagamento non riuscito: ne crea uno nuovo per lo stesso contratto. */
function riprovaPagamento(token) {
  var x = rigaDaToken_(token);
  if (!x) return { ok: false };
  var st = aggiornaPagamento_(x.sh, x.riga, x.r[0], x.d);
  if (st === 'PAID') return { ok: true, stato: 'PAID' };
  if (st === 'PENDING') return { ok: true, url: x.d.url };
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var dati = {}; try { dati = JSON.parse(x.r[20] || '{}'); } catch (e) {}
    var p = nuovoPagamentoCarta_(x.r[0], x.riga, x.d.importo, { abb: { nome: x.r[4] }, titolare: dati.titolare, ricorrente: x.d.ric });
    return { ok: true, url: p.url };
  } finally { lock.releaseLock(); }
}

/** Ogni 10 minuti (insieme all'invio dei PDF): aggiorna da solo i pagamenti con carta ancora aperti. */
function controllaPagamentiCarta() {
  if (!sumupAttivo_()) return;
  var sh = foglio_('Contratti');
  var cc = colonna_(sh, 'Pagamento con carta'), cs = colonna_(sh, 'SumUp');
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    var st = String(v[i][cc] || '');
    if (!v[i][0] || !v[i][cs] || st.indexOf('Pagato') === 0) continue;
    try { aggiornaPagamento_(sh, i + 1, v[i][0], JSON.parse(String(v[i][cs]))); }
    catch (e) { registra_(v[i][0], 'ERRORE controllo SumUp', String(e)); }
  }
}


/** Contratto con "Carte online" il cui pagamento non risulta ancora arrivato. */
function cartaDaPagare_(r, cMet, cCar) {
  if (!(Number(r[14]) > 0)) return false;                 // niente da pagare alla firma (es. VIP a 0 €): mai annullato
  return String(r[cMet] || '').trim() === METODO_CARTA && String(r[cCar] || '').indexOf('Pagato') !== 0;
}

/**
 * Ogni 10 minuti: i contratti con "Carte online" firmati da più di 30 minuti e NON pagati vengono annullati.
 * Prima si chiude il pagamento su SumUp e si ricontrolla che non sia arrivato: se risulta pagato, il contratto resta.
 * Si cancellano la riga in Contratti e il PDF su Drive (nel cestino); nel Registro resta la traccia.
 * I contratti pagati (carta, contanti, bancomat) non vengono mai toccati.
 */
var MINUTI_PER_PAGARE = 30;
function annullaNonPagati() {
  if (!sumupAttivo_()) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = foglio_('Contratti');
    var cMet = colonna_(sh, 'Pagamento alla firma'), cCar = colonna_(sh, 'Pagamento con carta'), cs = colonna_(sh, 'SumUp');
    var v = sh.getDataRange().getValues();
    var limite = Date.now() - MINUTI_PER_PAGARE * 60000;
    for (var i = v.length - 1; i >= 1; i--) {               // dal basso: cancellare una riga non sposta le precedenti
      var r = v[i];
      if (!r[0] || !(r[1] instanceof Date) || r[1].getTime() > limite) continue;
      if (!cartaDaPagare_(r, cMet, cCar)) continue;         // pagati o con altre modalità: mai cancellati
      var d = {}; try { d = JSON.parse(String(r[cs] || '{}')); } catch (e) {}
      var ids = d.ids || (d.id ? [d.id] : []);
      // 1. verifica su SumUp; 2. chiude i pagamenti ancora aperti (così non si può pagare un contratto annullato);
      // 3. verifica di nuovo: se il pagamento è arrivato, il contratto resta
      if (ids.length) {
        var st;
        try {
          st = statoSumup_(d);
          if (st !== 'PAID') {
            ids.forEach(function (id) { try { sumup_('delete', '/checkouts/' + encodeURIComponent(id)); } catch (e) {} });
            st = statoSumup_(d);
          }
        } catch (e) { registra_(r[0], 'Annullamento rinviato: SumUp non risponde', String(e)); continue; }
        if (st === 'PAID') {
          sh.getRange(i + 1, cCar + 1).setValue('Pagato ✓ ' + Utilities.formatDate(new Date(), 'Europe/Rome', 'dd/MM/yyyy HH:mm'));
          registra_(r[0], 'Pagamento con carta riuscito (verifica prima dell\'annullamento)', euro_(d.importo) + ' · ' + ids.join(', '));
          continue;
        }
      }
      // 4. annulla: PDF nel cestino di Drive e riga cancellata; traccia nel Registro
      var pdf = 'non trovato';
      try { DriveApp.getFileById(r[18]).setTrashed(true); pdf = 'nel cestino di Drive'; } catch (e) {}
      var firmatoAlle = Utilities.formatDate(r[1], 'Europe/Rome', 'dd/MM/yyyy HH:mm');
      sh.deleteRow(i + 1);
      registra_(r[0], 'CONTRATTO ANNULLATO: non pagato entro ' + MINUTI_PER_PAGARE + ' minuti',
        'Intestatario: ' + r[5] + ' · CF ' + r[6] + ' · ' + r[4] + ' · Importo non pagato: ' + euro_(r[14]) +
        ' · Firmato il ' + firmatoAlle + ' · Stato SumUp: ' + (ids.length ? 'non pagato (' + ids.join(', ') + ')' : 'pagamento mai creato') +
        ' · PDF ' + pdf + ' · Nessuna mail inviata al socio');
    }
  } finally {
    lock.releaseLock();
  }
}


/* ================================================================== */
/* Upgrade: solo dal back office                                      */
/* ================================================================== */

/** Controlla l'upgrade: PIN dello staff valido, abbonamento a rate mensili, scadenza del vecchio abbonamento. */
function validaUpgrade_(upg, abb) {
  var staff = utenteBo_(upg && upg.token);                 // senza sessione dello staff: errore
  if (upg.cessione) return validaCessione_(upg, abb, staff);
  if (abb.tipo === 'giornaliero' || abb.pagamento !== 'mensile') return { errore: 'L\'upgrade vale solo per abbonamenti a rate mensili.' };
  var scad = dataDa_(upg.scadenza);
  if (!scad) return { errore: 'Indica la scadenza dell\'abbonamento attuale.' };
  var o = oggi_(), fineMeseDopo = ultimoGiorno_(o.getFullYear(), o.getMonth() + 1);
  if (scad < fineMeseDopo) return { errore: 'La scadenza dell\'abbonamento attuale deve essere almeno il ' + fmtData_(fineMeseDopo) + ': l\'upgrade parte il 1° del mese prossimo.' };
  var vecchio = pulisciTesto_(upg.vecchio, 80);
  if (!vecchio) return { errore: 'Indica l\'abbonamento attuale del socio.' };
  return { staff: staff, scadenza: ultimoGiorno_(scad.getFullYear(), scad.getMonth()), vecchio: vecchio };
}

/* ================================================================== */
/* Revoca della disdetta: solo dal back office (al circolo)           */
/* Lo staff inserisce i dati, il socio firma con il codice OTP.        */
/* Archivio: scheda "Revoche disdetta" + PDF nella cartella dei PDF.   */
/* ================================================================== */

function boRevocaAvvia(token, d) {
  var staff = utenteBo_(token);
  d = d || {};
  var t = validaPersona_({ nome: d.nome, cognome: d.cognome, cf: d.cf }, 'Socio', false);
  var e = t.errori.slice();
  var cell = normalizzaCell_(d.cellulare), email = String(d.email || '').trim().toLowerCase();
  if (!/^\+393\d{8,9}$/.test(cell)) e.push('Il cellulare non è valido: serve un cellulare italiano per ricevere il codice.');
  if (!emailValida_(email)) e.push('L\'email non è valida.');
  var abb = pulisciTesto_(d.abbonamento, 80);
  if (!abb) e.push('Indica l\'abbonamento del socio.');
  var dataDisdetta = dataDa_(d.dataDisdetta), scad = dataDa_(d.scadenza);
  if (!dataDisdetta) e.push('Indica la data in cui il socio ha dato la disdetta.');
  else if (dataDisdetta > oggi_()) e.push('La data della disdetta non può essere futura.');
  if (!scad) e.push('Indica la scadenza dell\'abbonamento.');
  if (e.length) return { ok: false, errori: e };
  var id = Utilities.getUuid(), otp = nuovoOtp_();
  var s = {
    id: id, tipo: 'revoca', staff: staff,
    titolare: { nome: t.dati.nome, cognome: t.dati.cognome, cf: t.dati.cf, cellulare: cell, email: email },
    abbonamento: abb, dataDisdetta: fmtData_(dataDisdetta), scadenza: fmtData_(scad),
    otpHash: hash_(id + otp), otpChiaro: otp, otpScade: Date.now() + OTP_VALIDITA_MIN * 60000, tentativi: 0,
    eventi: [[new Date().toISOString(), 'Revoca della disdetta preparata da ' + staff + ' al circolo']]
  };
  var canale = inviaOtp_(s, otp, impostazioni_());
  s.eventi.push([new Date().toISOString(), 'Codice OTP inviato via ' + canale + ' a ' + destinatarioOtp_(s, canale)]);
  CacheService.getScriptCache().put('R_' + id, JSON.stringify(s), 21600);
  registra_(id, 'Revoca disdetta: OTP inviato', canale + ' · ' + t.dati.cognome + ' ' + t.dati.nome + ' · ' + staff);
  return { ok: true, id: id, canale: canale, a: mascherato_(destinatarioOtp_(s, canale)) };
}

function boRevocaConferma(token, id, codice) {
  utenteBo_(token);
  var cache = CacheService.getScriptCache();
  var k = 'R_' + String(id || '').replace(/[^a-f0-9-]/gi, '');
  var v = cache.get(k);
  if (!v) return { ok: false, errore: 'Sessione scaduta: ricomincia.' };
  var s = JSON.parse(v);
  if (s.firmato) return { ok: true, numero: s.firmato };
  if (Date.now() > s.otpScade) return { ok: false, errore: 'Il codice è scaduto: ricomincia.' };
  if (s.tentativi >= OTP_TENTATIVI) return { ok: false, errore: 'Troppi tentativi: ricomincia.' };
  if (hash_(s.id + String(codice || '').replace(/\D/g, '')) !== s.otpHash) {
    s.tentativi++; cache.put(k, JSON.stringify(s), 21600);
    return { ok: false, errore: 'Codice non corretto. Tentativi rimasti: ' + (OTP_TENTATIVI - s.tentativi) };
  }
  s.eventi.push([new Date().toISOString(), 'Codice OTP inserito correttamente: revoca firmata']);
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var props = PropertiesService.getScriptProperties();
    var prova = eProva_(s.titolare.cognome);
    var kn = prova ? 'NUM_RD_PROVA' : 'NUM_RD_' + new Date().getFullYear();
    var n = Number(props.getProperty(kn) || 0) + 1; props.setProperty(kn, String(n));
    var numero = (prova ? 'PROVA-RD-' : 'RD-' + new Date().getFullYear() + '-') + ('0000' + n).slice(-4);
    var corpo = htmlRevoca_(s, numero);
    var impronta = hash_(corpo);
    var html = corpo.replace('%%IMPRONTA%%', impronta);
    var nome = numero + ' · Revoca disdetta · ' + s.titolare.cognome + ' ' + s.titolare.nome + '.pdf';
    var pdf = HtmlService.createHtmlOutput(html).getAs('application/pdf').setName(nome);
    var file = DriveApp.getFolderById(props.getProperty('FOLDER_ID')).createFile(pdf);
    var sh = foglio_('Revoche disdetta');
    if (!sh) {
      sh = ss_().insertSheet('Revoche disdetta');
      sh.appendRow(['Numero', 'Firmata il', 'Socio', 'Codice fiscale', 'Email', 'Cellulare', 'Abbonamento',
        'Disdetta data il', 'Scadenza', 'Registrata da', 'PDF', 'ID file', 'Impronta', 'Inserita nel gestionale']);
      sh.getRange(1, 1, 1, 14).setFontWeight('bold').setBackground('#13556F').setFontColor('#FFFFFF');
      sh.setFrozenRows(1);
    }
    sh.appendRow([numero, new Date(), s.titolare.cognome + ' ' + s.titolare.nome, s.titolare.cf, s.titolare.email, s.titolare.cellulare,
      s.abbonamento, s.dataDisdetta, s.scadenza, s.staff, file.getUrl(), file.getId(), impronta, '']);
    registra_(numero, 'Revoca disdetta firmata', s.titolare.cognome + ' ' + s.titolare.nome + ' · ' + s.abbonamento + ' · ' + s.staff);
    s.firmato = numero; cache.put(k, JSON.stringify(s), 21600);
    try {
      MailApp.sendEmail({ to: s.titolare.email, replyTo: impostazioni_().EmailCircolo, name: MITTENTE,
        subject: (prova ? '[PROVA] ' : '') + 'La tua revoca della disdetta · Officine Sportive', htmlBody: htmlMailRevoca_(s), attachments: [pdf] });
      registra_(numero, 'Revoca disdetta inviata al socio', s.titolare.email);
    } catch (e2) { registra_(numero, 'ERRORE invio revoca al socio', String(e2)); }
    return { ok: true, numero: numero };
  } finally { lock.releaseLock(); }
}

function htmlRevoca_(s, numero) {
  var t = s.titolare;
  var reg = s.eventi.map(function (x) {
    return '<tr><td style="padding:4px 8px;border-bottom:1px solid #D4E0E3;white-space:nowrap">' + esc_(Utilities.formatDate(new Date(x[0]), 'Europe/Rome', 'dd/MM/yyyy HH:mm:ss')) +
      '</td><td style="padding:4px 8px;border-bottom:1px solid #D4E0E3">' + esc_(x[1]) + '</td></tr>';
  }).join('');
  return '<html><head><meta charset="utf-8"><style>body{font-family:Arial,Helvetica,sans-serif;color:#14323F;font-size:11.5pt;line-height:1.5;margin:28px}' +
    'h1{font-size:16pt;color:#13556F;margin:14px 0 4px}h2{font-size:11pt;color:#13556F;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.5px}' +
    'table{border-collapse:collapse;width:100%;font-size:10.5pt}.k{color:#5A707A;width:38%;padding:5px 0;border-bottom:1px solid #D4E0E3}.v{font-weight:bold;padding:5px 0;border-bottom:1px solid #D4E0E3}' +
    '.box{border:2px solid #13556F;border-radius:8px;padding:12px 14px;margin:16px 0}</style></head><body>' +
    '<img src="' + logoDataUri_() + '" style="height:46px">' +
    (/^PROVA/.test(numero) ? '<div style="border:2px solid #C0392B;color:#C0392B;font-weight:bold;text-align:center;padding:6px;margin:10px 0">DOCUMENTO DI PROVA</div>' : '') +
    '<h1>Revoca della disdetta</h1><div style="color:#5A707A">Documento n. ' + esc_(numero) + ' · Gate Fitness S.S.D. a r.l. · Circolo Officine Sportive</div>' +
    '<h2>Dati</h2><table>' +
    '<tr><td class="k">Tesserato</td><td class="v">' + esc_(t.nome + ' ' + t.cognome) + '</td></tr>' +
    '<tr><td class="k">Codice fiscale</td><td class="v">' + esc_(t.cf) + '</td></tr>' +
    '<tr><td class="k">Abbonamento</td><td class="v">' + esc_(s.abbonamento) + '</td></tr>' +
    '<tr><td class="k">Disdetta comunicata il</td><td class="v">' + esc_(s.dataDisdetta) + '</td></tr>' +
    '<tr><td class="k">Scadenza dell\'abbonamento</td><td class="v">' + esc_(s.scadenza) + '</td></tr></table>' +
    '<div class="box">Il/La sottoscritto/a <b>' + esc_(t.nome + ' ' + t.cognome) + '</b>, codice fiscale ' + esc_(t.cf) +
    ', titolare dell\'abbonamento sopra indicato, <b>dichiara di revocare la disdetta comunicata in data ' + esc_(s.dataDisdetta) +
    '</b>, che deve pertanto intendersi priva di ogni effetto.<br><br>Il contratto prosegue senza soluzione di continuità alle condizioni in essere, ivi compresi il piano di pagamento, ' +
    'l\'autorizzazione all\'addebito delle rate e il rinnovo tacito alla scadenza del ' + esc_(s.scadenza) +
    ', salvo nuova disdetta comunicata nei modi e nei termini previsti dalle Condizioni generali.</div>' +
    '<h2>Firma elettronica</h2><p style="font-size:10.5pt;margin:0 0 6px">Sottoscritto con codice OTP personale inviato al cellulare ' + esc_(t.cellulare) + ' (o all\'email ' + esc_(t.email) +
    '), presso il Circolo, con la registrazione di ' + esc_(s.staff) + '.</p><table>' + reg + '</table>' +
    '<p style="font-size:9pt;color:#5A707A;margin-top:12px">Impronta del documento (SHA-256): %%IMPRONTA%%</p></body></html>';
}

function htmlMailRevoca_(s) {
  return cornice_('<p style="margin:0 0 12px">Ciao ' + esc_(s.titolare.nome) + '! 👋</p>' +
    '<p style="margin:0 0 14px">Siamo felici che tu resti con noi! 💙 Abbiamo registrato la <b>revoca della tua disdetta</b>: il tuo abbonamento <b>' + esc_(s.abbonamento) +
    '</b> prosegue regolarmente, alle stesse condizioni.</p>' +
    '<p style="margin:0 0 14px">In allegato trovi il documento firmato: conservalo insieme al tuo contratto.</p>' +
    '<p style="margin:0">Per qualsiasi domanda contattaci: 📱 375 599 2375 · ☎️ 06 6595 5545 · ✉️ info@officinesportive.it</p>' + firmaTeam_());
}


/**
 * Ogni 10 minuti: i documenti di PROVA (cognome "Prova") vengono eliminati 30 minuti dopo la firma,
 * dopo l'invio del PDF di prova al socio. Si cancellano la riga (Contratti / Revoche disdetta) e il PDF
 * (nel cestino di Drive); nel Registro resta una riga. I contratti veri non vengono mai toccati.
 */
function eliminaProve() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var limite = Date.now() - 30 * 60000;
    [['Contratti', 18], ['Revoche disdetta', 11]].forEach(function (x) {
      var sh = foglio_(x[0]);
      if (!sh) return;
      var v = sh.getDataRange().getValues();
      var cPdf = v[0].indexOf('PDF inviato al socio');
      for (var i = v.length - 1; i >= 1; i--) {
        var r = v[i];
        if (!/^PROVA-/.test(String(r[0])) || !(r[1] instanceof Date) || r[1].getTime() > limite) continue;
        if (x[0] === 'Contratti' && cPdf >= 0 && !r[cPdf] && Date.now() - r[1].getTime() < 120 * 60000) continue;   // aspetta l'invio del PDF di prova (max 2 ore)
        try { DriveApp.getFileById(r[x[1]]).setTrashed(true); } catch (e) {}
        sh.deleteRow(i + 1);
        registra_(r[0], 'Prova eliminata in automatico', x[0] + ' · ' + (x[0] === 'Contratti' ? r[5] : r[2]));
      }
    });
  } finally { lock.releaseLock(); }
}

/* ================================================================== */
/* Cessione dell'abbonamento: solo dal back office (21/11/2026)        */
/* Customer service, non prevista dal contratto. Il nuovo socio firma  */
/* un contratto con le condizioni del vecchio (rata, scadenza,         */
/* rinnovo); alla firma non paga nulla: le rate proseguono.            */
/* Si cede una volta sola: chi è subentrato non può cedere di nuovo.   */
/* ================================================================== */

var CARTELLA_REPORT_WELLNESS = '1grKl9i2yN9hNSI3JIOfAzOAaJ0SZ_-qr';   // «Jarvis · Report Wellness» (privata, officinesportive3)

function nomeChiave_(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, ' ').split(/\s+/).filter(String).sort().join(' ');
}

/** Controlla che l'abbonamento non sia già stato ceduto: il cedente non deve essere già subentrato né aver già ceduto. */
function giaCeduto_(cedente) {
  var sh = foglio_('Contratti'); if (!sh) return '';
  var v = sh.getDataRange().getValues(), cu = v[0].indexOf('Upgrade'), k = nomeChiave_(cedente);
  if (cu < 0) return '';
  for (var i = 1; i < v.length; i++) {
    var x = String(v[i][cu] || '');
    if (!/^Cessione da:/.test(x) || /^PROVA-/.test(String(v[i][0]))) continue;
    if (nomeChiave_(v[i][5]) === k) return 'L\'abbonamento di ' + cedente + ' gli è stato ceduto da un altro socio (contratto ' + v[i][0] + '): non si può cedere di nuovo.';
    if (nomeChiave_(x.replace(/^Cessione da:\s*/, '').split(' · ')[0]) === k) return cedente + ' ha già ceduto il suo abbonamento (contratto ' + v[i][0] + '): non si può cedere una seconda volta.';
  }
  return '';
}

function validaCessione_(c, abb, staff) {
  var cedente = maiuscoleNome_(pulisciTesto_(c.cedente, 80));
  if (!cedente || cedente.split(' ').length < 2) return { errore: 'Indica nome e cognome del socio che cede l\'abbonamento.' };
  var scad = dataDa_(c.scadenza);
  if (!scad) return { errore: 'Indica la scadenza dell\'abbonamento ceduto.' };
  if (scad < oggi_()) return { errore: 'L\'abbonamento ceduto risulta già scaduto (' + fmtData_(scad) + '): non si può cedere.' };
  var rata = Math.round(Number(String(c.rata || '').replace(',', '.')) * 100) / 100;
  if (!(rata > 0)) return { errore: 'Indica la rata mensile dell\'abbonamento ceduto.' };
  var g = c.provaCognome ? '' : giaCeduto_(cedente);
  if (g) return { errore: g };
  return { staff: staff, cessione: true, cedente: cedente, scadenza: scad, rata: rata, tacito: !!c.tacito,
           pacchetto: pulisciTesto_(c.pacchetto, 100) || abb.nome, vecchio: 'cessione da ' + cedente };
}

/** L'abbonamento del contratto di cessione: tipo e area dal listino, nome, rata e rinnovo del vecchio abbonamento. */
function abbCessione_(abb, c) {
  var a = JSON.parse(JSON.stringify(abb));
  a.nome = c.pacchetto || a.nome; a.prezzo = c.rata; a.rinnovo = !!c.tacito; a.iscrizione = 0;
  return a;
}

function csvRighe_(testo) {
  var out = [], riga = [], campo = '', q = false;
  for (var i = 0; i < testo.length; i++) {
    var ch = testo.charAt(i);
    if (q) { if (ch === '"') { if (testo.charAt(i + 1) === '"') { campo += '"'; i++; } else q = false; } else campo += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ';') { riga.push(campo); campo = ''; }
    else if (ch === '\n') { riga.push(campo); out.push(riga); riga = []; campo = ''; }
    else if (ch !== '\r') campo += ch;
  }
  if (campo || riga.length) { riga.push(campo); out.push(riga); }
  return out.map(function (r) { return r.map(function (x) { return String(x).replace(/^=/, '').replace(/^"|"$/g, '').trim(); }); });
}

/** Back office: cerca il socio che cede nell'ultimo report «Scadenze» di Wellness in Cloud e propone le condizioni. */
function boCessioneCerca(token, d) {
  utenteBo_(token);
  d = d || {};
  var cell = String(d.cellulare || '').replace(/\D/g, '').replace(/^(0039|39)(?=3\d{8,9}$)/, '');
  var kNome = nomeChiave_((d.nome || '') + ' ' + (d.cognome || ''));
  if (!cell && kNome.split(' ').length < 2) return { ok: false, errore: 'Scrivi nome, cognome e cellulare del socio che cede.' };
  var f = null;
  try {
    var it = DriveApp.getFolderById(CARTELLA_REPORT_WELLNESS).getFiles();
    while (it.hasNext()) { var x = it.next(); if (!x.isTrashed() && /scadenz/i.test(x.getName()) && /\.csv$/i.test(x.getName()) && (!f || x.getLastUpdated() > f.getLastUpdated())) f = x; }
  } catch (e) { return { ok: true, trovato: false, motivo: 'Non riesco ad aprire i report di Wellness: compila a mano.' }; }
  if (!f) return { ok: true, trovato: false, motivo: 'Non ho ancora un report delle scadenze di Wellness: compila a mano.' };
  var v = csvRighe_(f.getBlob().getDataAsString('UTF-8').replace(/^﻿/, ''));
  var h = v[0], c = function (n) { return h.indexOf(n); };
  var iC = c('Cognome'), iN = c('Nome'), iCell = c('Cellulare'), iPac = c('Pacchetto'), iFine = c('Termine abilitazione'), iIni = c('Inizio abilitazione'),
      iPr = c('Prezzo'), iTac = c('Tacito rinnovo'), iDis = c('Disdetta rinnovo');
  var trovate = v.slice(1).filter(function (r) {
    if (/asciugam/i.test(r[iPac] || '')) return false;                       // solo l'abbonamento, mai gli extra
    var rc = String(r[iCell] || '').replace(/\D/g, '').replace(/^(0039|39)(?=3\d{8,9}$)/, '');
    return (cell && rc && rc.slice(-9) === cell.slice(-9)) || (kNome && nomeChiave_(r[iN] + ' ' + r[iC]) === kNome);
  });
  var dataIt = function (s) { var m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? dt_(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null; };
  trovate.sort(function (a, b) { return (dataIt(b[iFine]) || 0) - (dataIt(a[iFine]) || 0); });
  var nomeFile = f.getName().replace(/^\d{4}-\d{2}-\d{2}\s*/, ''), del = Utilities.formatDate(f.getLastUpdated(), 'Europe/Rome', 'dd/MM/yyyy');
  if (!trovate.length) return { ok: true, trovato: false, motivo: 'Socio non trovato nel report delle scadenze del ' + del + ': compila a mano.' };
  var r = trovate[0], fine = dataIt(r[iFine]), ini = dataIt(r[iIni]);
  if (fine && fine < oggi_()) return { ok: true, trovato: false, motivo: 'Nel report del ' + del + ' l\'ultimo abbonamento di ' + r[iN] + ' ' + r[iC] + ' risulta scaduto il ' + fmtData_(fine) + ' (forse il report non arriva fino alla scadenza vera): compila a mano.' };
  var prezzo = Number(String(r[iPr] || '').replace(/\./g, '').replace(',', '.')) || 0;
  var mesi = ini && fine ? Math.max(1, Math.round((fine - ini) / (30.44 * 864e5))) : 1;
  var rata = mesi > 1 ? Math.round(prezzo / mesi * 100) / 100 : prezzo;
  return { ok: true, trovato: true, del: del, socio: r[iN] + ' ' + r[iC], pacchetto: r[iPac], scadenza: fine ? fmtData_(fine) : '',
           rata: rata, rataCalcolata: mesi > 1, tacito: String(r[iTac]) === '1' || /rinnovo automatico/i.test(r[iPac] || ''), disdetto: String(r[iDis]) === '1' };
}
/***********************************************************************
 *  JARVIS · BASE  (file uguale in ogni progetto, si chiama «JarvisAnagrafica»)
 *
 *  Legge persone, ruoli e mail dall'«Anagrafica Jarvis · Officine Sportive».
 *  Ogni codice chiede un RUOLO (es. 'CLUB', 'TITOLARE'), mai un nome.
 *  Paracadute: se l'anagrafica non risponde, usa il valore di riserva
 *  scritto nel codice, così niente si blocca.
 *  I dati restano in memoria 1 ora: un cambio persona vale entro un'ora.
 ***********************************************************************/
// Scritto dentro una funzione (non come costante) perché i codici lo usano già
// mentre il progetto si carica, anche se questo file viene dopo.
function jarvisAnagraficaId_() { return '1--95MQwS6kWQv91fjeAygWo37oKrmChDGyvaMGXdH5w'; }

function jarvisRuoli_() {
  if (jarvisRuoli_.dati) return jarvisRuoli_.dati;
  let dati = null;
  try {
    const cache = CacheService.getScriptCache(), c = cache.get('jarvis_ruoli');
    if (c) dati = JSON.parse(c);
    else {
      const righe = SpreadsheetApp.openById(jarvisAnagraficaId_()).getSheetByName('Ruoli').getDataRange().getValues();
      const h = righe[0].map(x => String(x).trim().toLowerCase());
      const col = nome => h.indexOf(nome);
      dati = righe.slice(1).filter(r => r[0]).map(r => ({
        chiave: String(r[col('chiave')]).trim(),
        ruolo: String(r[col('ruolo')] || ''),
        nome: String(r[col('persona')] || '').trim(),
        mail: String(r[col('mail')] || '').trim(),
        attivo: String(r[col('attivo')] || '').toLowerCase().indexOf('s') === 0,
        turni: String(r[col('fa turni')] || '').toLowerCase().indexOf('s') === 0,
        abilitazioni: col('abilitazioni') >= 0 ? String(r[col('abilitazioni')] || '') : '',
        sigla: col('sigla turni') >= 0 ? String(r[col('sigla turni')] || '').trim() : '',
        idTurni: col('id app turni') >= 0 ? String(r[col('id app turni')] || '').trim() : '',
        completo: col('nome completo') >= 0 ? String(r[col('nome completo')] || '').trim() : '',
        team: col('team operativo') >= 0 ? String(r[col('team operativo')] || 'Sì').toLowerCase().indexOf('s') === 0 : true
      }));
      cache.put('jarvis_ruoli', JSON.stringify(dati), 3600);
    }
  } catch (e) { console.warn('Anagrafica Jarvis non raggiungibile, uso i valori di riserva: ' + e); }
  jarvisRuoli_.dati = dati;
  return dati;
}

function jarvisPersona_(chiave) {
  const d = jarvisRuoli_();
  return d ? d.find(p => p.chiave === chiave && p.attivo && p.nome) || null : null;
}

/** Mail del ruolo (es. 'CLUB'); se manca, la riserva. */
function jarvisMail_(chiave, riserva) { const p = jarvisPersona_(chiave); return (p && p.mail) || riserva; }

/** Nome di battesimo di chi copre il ruolo; se manca, la riserva. */
function jarvisNome_(chiave, riserva) { const p = jarvisPersona_(chiave); return p ? p.nome.split(' ')[0] : riserva; }

/** Mail di chi è attivo e fa i turni. */
function jarvisMailTurni_(riserva) {
  const d = jarvisRuoli_();
  const l = d ? d.filter(p => p.attivo && p.team && p.turni && p.mail).map(p => p.mail) : [];
  return l.length ? l : riserva;
}

/** Persone abilitate a qualcosa (es. 'Fit Check'), come {sigla: {nome, email}}. */
function jarvisAbilitati_(cosa, riserva) {
  const d = jarvisRuoli_(), out = {};
  if (d) d.filter(p => p.attivo && p.sigla && p.abilitazioni.toLowerCase().indexOf(cosa.toLowerCase()) >= 0)
    .forEach(p => out[p.sigla] = { nome: p.nome.split(' ')[0], email: p.mail });
  return Object.keys(out).length ? out : riserva;
}

/** Tutto il team attivo come {nome: mail}, per chi affida le azioni. */
function jarvisTeam_(riserva) {
  const d = jarvisRuoli_(), out = {};
  if (d) d.filter(p => p.attivo && p.team && p.nome && p.mail).forEach(p => out[p.nome.split(' ')[0]] = p.mail);
  return Object.keys(out).length ? out : riserva;
}

/** ID della persona nell'app turni (es. 'alept'); se manca, la riserva. */
function jarvisIdTurni_(chiave, riserva) { const p = jarvisPersona_(chiave); return (p && p.idTurni) || riserva; }

/** Tutto il team attivo come {Nome: {id: ID app turni, mail}}. */
function jarvisPersoneTurni_(riserva) {
  const d = jarvisRuoli_(), out = {};
  if (d) d.filter(p => p.attivo && p.team && p.nome && p.idTurni).forEach(p => out[p.nome.split(' ')[0]] = { id: p.idTurni, mail: p.mail });
  return Object.keys(out).length ? out : riserva;
}

/** Nomi di chi è attivo e fa i turni. */
function jarvisNomiTurni_(riserva) {
  const d = jarvisRuoli_();
  const l = d ? d.filter(p => p.attivo && p.team && p.turni && p.nome).map(p => p.nome.split(' ')[0]) : [];
  return l.length ? l : riserva;
}

/* =====================================================================
 *  REGISTRO JARVIS: ogni processo dice «ci sono, ho lavorato, versione X».
 *  La Sentinella legge solo questo registro, su qualunque account giri il processo.
 *  Ogni progetto definisce nel suo codice: function jarvisProcesso_() { return { nome, versione, account }; }
 * ===================================================================== */
function jarvisRegistroId_() { return '1IRFfQLn8BpTLR-rMkC13ryfHzo7cJtPsG1Zby15CgiM'; }

/** Scrive un battito. esito: 'OK' oppure 'KO'. Non blocca mai il processo. Al massimo un battito OK ogni 50 minuti. */
function jarvisBattito_(esito, dettaglio) {
  try {
    const info = (typeof jarvisProcesso_ === 'function') ? jarvisProcesso_() : { nome: 'senza nome', versione: '', account: '' };
    esito = esito || 'OK';
    if (esito === 'OK') {
      const p = PropertiesService.getScriptProperties(), ultimo = Number(p.getProperty('jarvis_battito') || 0);
      if (Date.now() - ultimo < 50 * 60000) return;
      p.setProperty('jarvis_battito', String(Date.now()));
    }
    SpreadsheetApp.openById(jarvisRegistroId_()).getSheetByName('Battiti')
      .appendRow([new Date(), info.nome, String(info.versione), esito, String(dettaglio || '').slice(0, 300), info.account || '']);
  } catch (e) { console.warn('Registro Jarvis non raggiungibile: ' + e); }
}

/** Per i blocchi gravi: segna KO nel registro (la Sentinella lo vede al giro dopo). */
function jarvisErrore_(dove, errore) { jarvisBattito_('KO', dove + ': ' + String(errore && errore.message || errore)); }

/** Mail di tutto il team attivo (titolare compreso). */
function jarvisTeamMail_(riserva) {
  const t = jarvisTeam_(null);
  return t ? Object.keys(t).map(k => t[k]) : riserva;
}

/** Nome e cognome di chi copre il ruolo (per i fogli che usano il nome completo). */
function jarvisNomeCompleto_(chiave, riserva) { const p = jarvisPersona_(chiave); return (p && (p.completo || p.nome)) || riserva; }
/** Prova Skebby: controlla email e password API e mostra il credito. Non invia SMS. */
function provaSkebby() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SMS_USER') || !props.getProperty('SMS_PASSWORD')) { Logger.log('❌ Mancano SMS_USER o SMS_PASSWORD nelle Proprietà script.'); return; }
  try {
    var k = loginSkebby_();
    Logger.log('✅ Accesso a Skebby riuscito: email e password API sono corrette.');
    var s = UrlFetchApp.fetch('https://api.skebby.it/API/v1.0/REST/status?getMoney=true', { headers: { user_key: k[0], Session_key: k[1] }, muteHttpExceptions: true });
    Logger.log('Credito e SMS disponibili: ' + s.getContentText());
  } catch (e) {
    Logger.log('❌ ' + e.message);
  }
}

/* ===== Insoluti: link «Paga subito» SumUp per le mail che manda Jarvis da info@ =====
 * Jarvis (Casella info) prepara le righe nel foglio «Insoluti»; qui, ogni 10 minuti, creo il pagamento
 * su SumUp (la chiave è solo in questa app) e scrivo il link; poi controllo chi ha pagato. */
var INSOLUTI_FOGLIO = '1zvwtK2WI4Q9G30Mtkhn-JFpqDynkkuaUEMVq2FHRdvw';
function insolutiSumup_() {
  if (!sumupAttivo_()) return;
  var sh = SpreadsheetApp.openById(INSOLUTI_FOGLIO).getSheetByName('Insoluti');
  if (!sh || sh.getLastRow() < 2) return;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 14).getValues();
  var mc = PropertiesService.getScriptProperties().getProperty('SUMUP_MERCHANT_CODE');
  v.forEach(function (r, i) {
    var riga = i + 2, stato = String(r[9]);
    try {
      if (stato === 'da preparare') {
        var tot = Number(r[8]);
        if (!(tot > 0)) return;
        var co = sumup_('post', '/checkouts', {
          amount: Number(tot.toFixed(2)), currency: 'EUR',
          checkout_reference: 'INS-' + Utilities.getUuid().slice(0, 18),
          description: 'Officine Sportive · rate non pagate · ' + r[4] + ' ' + r[5],
          merchant_code: mc, hosted_checkout: { enabled: true }
        });
        if (!co.hosted_checkout_url) throw new Error('SumUp non ha dato il link');
        sh.getRange(riga, 10, 1, 3).setValues([['pronto', co.id, co.hosted_checkout_url]]);
      } else if ((stato === 'inviata' || stato === 'pronto') && r[10]) {
        var giorni = (Date.now() - new Date(r[1]).getTime()) / 864e5;
        if (giorni > 45) return;
        var st = String(sumup_('get', '/checkouts/' + encodeURIComponent(r[10])).status || '').toUpperCase();
        if (st === 'PAID') sh.getRange(riga, 10).setValue('pagato con SumUp');
      }
    } catch (e) { registra_('SumUp', 'ERRORE insoluti ' + r[3], String(e)); }
  });
}


/* ===== Rinnovo tacito: ogni promemoria inviato da Jarvis (foglio «Archivio rinnovi») va archiviato con il contratto =====
 * Se il socio ha un contratto qui (stessa email), salvo il testo della mail in PDF nella cartella dei contratti
 * e lo segno nella colonna «Promemoria rinnovo» del contratto. Se il contratto non c'è, resta nell'archivio a parte. */
function archiviaRinnovi_() {
  var ar = SpreadsheetApp.openById(INSOLUTI_FOGLIO).getSheetByName('Archivio rinnovi');
  if (!ar || ar.getLastRow() < 2) return;
  var ca = colonna_(ar, 'Archiviato');
  var v = ar.getRange(2, 1, ar.getLastRow() - 1, ca + 1).getValues();
  var sh = foglio_('Contratti'), cv = sh.getDataRange().getValues(), h = cv[0];
  var cE = h.indexOf('Email'), cN = h.indexOf('Numero'), cP = colonna_(sh, 'Promemoria rinnovo');
  var cartella = null;
  v.forEach(function (r, i) {
    if (r[ca]) return;
    var email = String(r[2]).trim().toLowerCase(), riga = -1;
    for (var j = cv.length - 1; j >= 1; j--) if (String(cv[j][cE]).trim().toLowerCase() === email) { riga = j; break; }
    if (riga < 0) { ar.getRange(i + 2, ca + 1).setValue('Archivio a parte (nessun contratto in App Contratti)'); return; }
    var quando = Utilities.formatDate(new Date(r[0]), 'Europe/Rome', 'dd/MM/yyyy HH:mm');
    var html = '<div style="font-family:Arial,sans-serif;font-size:13px;line-height:1.6"><h3>Promemoria rinnovo tacito · contratto ' + cv[riga][cN] + '</h3>' +
      '<p><b>Inviata il:</b> ' + quando + '<br><b>Da:</b> info@officinesportive.it<br><b>A:</b> ' + r[2] + '<br><b>Oggetto:</b> ' + r[7] + '<br><b>Abbonamento:</b> ' + r[5] + ' · scadenza ' + Utilities.formatDate(new Date(r[6]), 'Europe/Rome', 'dd/MM/yyyy') + '</p>' +
      '<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;border-top:1px solid #ccc;padding-top:10px">' + String(r[8]).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre></div>';
    try {
      if (!cartella) cartella = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
      var pdf = HtmlService.createHtmlOutput(html).getAs('application/pdf').setName('Promemoria rinnovo tacito · ' + r[3] + ' ' + r[4] + ' · ' + Utilities.formatDate(new Date(r[0]), 'Europe/Rome', 'yyyy-MM-dd') + '.pdf');
      var f = cartella.createFile(pdf);
      var prima = String(sh.getRange(riga + 1, cP + 1).getValue() || '');
      sh.getRange(riga + 1, cP + 1).setValue((prima ? prima + '\n' : '') + quando + ' · ' + f.getUrl());
      ar.getRange(i + 2, ca + 1).setValue('Con il contratto ' + cv[riga][cN] + ' · ' + f.getUrl());
    } catch (e) { registra_('Rinnovo tacito', 'ERRORE archivio ' + email, String(e)); }
  });
}

/* ================================================================== */
/* Liberatoria certificato medico                                      */
/* ================================================================== */

function liberatorieSheet_() {
  var ss = ss_(), sh = ss.getSheetByName('Liberatorie');
  if (!sh) {
    sh = ss.insertSheet('Liberatorie');
    sh.appendRow(['Data', 'Cognome', 'Nome', 'CF', 'Cellulare', 'Email', 'Numero', 'Scadenza', 'OTP verificato', 'Operatore', 'Tipo', 'Note']);
    sh.setFrozenRows(1); sh.getRange(1, 1, 1, 12).setFontWeight('bold');
  }
  return sh;
}

function contaLiberatorie_(cognome, nome) {
  var sh = liberatorieSheet_(), v = sh.getDataRange().getValues();
  var chiave = (cognome.trim() + '|' + nome.trim()).toLowerCase(), count = 0;
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][11] || '') === 'PROVA') continue;
    if ((String(v[i][1]).trim() + '|' + String(v[i][2]).trim()).toLowerCase() === chiave) count++;
  }
  return count;
}

function libAvvia(token, dati) {
  var staff = utenteBo_(token);
  var nome = maiuscoleNome_(String(dati.nome || '').trim());
  var cognome = maiuscoleNome_(String(dati.cognome || '').trim());
  var cell = String(dati.cellulare || '').trim();
  var email = String(dati.email || '').trim().toLowerCase();
  if (!nome || !cognome) return { ok: false, errore: 'Inserisci nome e cognome.' };
  if (!cell) return { ok: false, errore: 'Inserisci il numero di cellulare.' };
  if (!email) return { ok: false, errore: 'Inserisci la mail del socio.' };
  var imp = impostazioni_();
  var count = contaLiberatorie_(cognome, nome);
  if (count >= 2) return { ok: false, errore: 'Questo socio ha gia usato 2 liberatorie.' };
  var otp = '';
  for (var i = 0; i < 6; i++) otp += String(Math.floor(Math.random() * 10));
  var prova = imp.LiberatoriaProva === 'SI';
  var canale = 'email';
  var testo = 'Officine Sportive: il tuo codice per la liberatoria e ' + otp + '. Vale 10 minuti.';
  if (!prova && String(imp.CanaleOTP).toUpperCase() === 'SMS') {
    try {
      if (PropertiesService.getScriptProperties().getProperty('SMS_USER')) { inviaSms_(cell, testo, imp); canale = 'SMS'; }
    } catch (e) { registra_('LIBERATORIA', 'SMS fallito', String(e)); }
  }
  if (canale !== 'SMS') {
    var dest = prova ? (imp.EmailAllarmi || email) : email;
    MailApp.sendEmail({ to: dest, subject: 'Codice OTP: ' + otp, body: 'Codice per la liberatoria: ' + otp + '. Valido 10 minuti. Officine Sportive.', name: 'Officine Sportive' });
  }
  var id = 'lib_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  PropertiesService.getScriptProperties().setProperty('LIB_' + id, JSON.stringify({
    otp: otp, ts: Date.now(), tentativi: 0, cognome: cognome, nome: nome, cell: cell, email: email, staff: staff, prova: prova
  }));
  var mask = canale === 'SMS' ? cell.replace(/^(.{3}).+(.{2})$/, '$1***$2') : (prova ? imp.EmailAllarmi : email).replace(/(.{2}).+(@.+)/, '$1***$2');
  registra_('LIBERATORIA', 'OTP ' + canale, cognome + ' ' + nome + ' da ' + staff);
  return { ok: true, id: id, numero: count + 1, canale: canale, mask: mask, nomeSocio: nome + ' ' + cognome };
}

function libConferma(token, id, codice) {
  utenteBo_(token);
  var props = PropertiesService.getScriptProperties();
  var k = 'LIB_' + String(id || '');
  var raw = props.getProperty(k); if (!raw) return { ok: false, errore: 'Sessione scaduta. Ricomincia.' };
  var o = JSON.parse(raw);
  if (Date.now() - o.ts > 600000) { props.deleteProperty(k); return { ok: false, errore: 'Codice scaduto. Ricomincia.' }; }
  if (o.tentativi >= 5) { props.deleteProperty(k); return { ok: false, errore: 'Troppi tentativi. Ricomincia.' }; }
  if (String(codice).trim() !== o.otp) {
    o.tentativi++; props.setProperty(k, JSON.stringify(o));
    return { ok: false, errore: 'Codice errato. ' + (5 - o.tentativi) + ' tentativi rimasti.' };
  }
  props.deleteProperty(k);
  var oggi = fmtData_(oggi_()), scadenza = fmtData_(new Date(Date.now() + 30 * 864e5));
  var ora = Utilities.formatDate(new Date(), 'Europe/Rome', 'dd/MM/yyyy HH:mm');
  var numero = contaLiberatorie_(o.cognome, o.nome) + 1;
  if (numero > 2) return { ok: false, errore: 'Questo socio ha gia usato 2 liberatorie.' };
  liberatorieSheet_().appendRow([oggi, o.cognome, o.nome, '', o.cell, o.email, numero, scadenza, ora, o.staff, 'socio', o.prova ? 'PROVA' : '']);
  if (numero === 2 && !o.prova) {
    var imp = impostazioni_();
    try { libMailBlocco_(o.nome, o.cognome, o.email); } catch (e) {}
    try { libMailStaffBlocco_(o.nome, o.cognome, ora, imp); } catch (e) {}
  }
  registra_('LIBERATORIA', 'Firmata n.' + numero, o.cognome + ' ' + o.nome + (o.prova ? ' (PROVA)' : '') + ' da ' + o.staff);
  return { ok: true, numero: numero, scadenza: scadenza };
}

function libMailBlocco_(nome, cognome, email) {
  MailApp.sendEmail({ to: email,
    subject: 'Certificato medico: da adesso e obbligatorio per accedere - Officine Sportive',
    htmlBody: cornice_('<p style="margin:0 0 14px">Ciao ' + esc_(nome) + ',</p>'
      + '<p style="margin:0 0 14px">ti scriviamo per aggiornarti sul tuo certificato medico.</p>'
      + '<div style="background:#FFF4E5;border:1px solid #FFD599;border-radius:12px;padding:16px;margin:14px 0;font-size:14px;color:#8B5E00"><b>Hai utilizzato entrambe le liberatorie temporanee</b> previste dal regolamento del circolo.</div>'
      + '<p style="margin:0 0 14px"><b style="color:#13556F">Da questo momento, per accedere al circolo e necessario presentare in reception il certificato medico.</b></p>'
      + '<p style="margin:0 0 14px">I ragazzi in reception non sono autorizzati a fare eccezioni: senza certificato, purtroppo non e possibile entrare.</p>'
      + '<div style="background:#F0F7F8;border:1px solid #C8E0E3;border-radius:12px;padding:14px;margin:14px 0">'
      + '<div style="font-size:12px;font-weight:600;color:#1A9DA7;text-transform:uppercase;margin-bottom:4px">Medico convenzionato del circolo</div>'
      + '<div style="font-size:15px;font-weight:700;color:#14323F">Dr. Domenico Bisogno</div>'
      + '<div style="font-size:13px;color:#5A707A">Medicina dello sport - Senza appuntamento<br>Viale Donato Bramante 47, Fiumicino<br>Lun e Mer 15-18 - Mar e Gio 11:30-15 - Ven 17-19</div></div>'
      + '<p style="margin:0">Se hai bisogno di qualsiasi informazione, passa in reception!</p>' + firmaTeam_()),
    body: 'Ciao ' + nome + ', hai usato entrambe le liberatorie. Da adesso serve il certificato medico. Dr. Bisogno, Viale Donato Bramante 47 Fiumicino.',
    name: 'Officine Sportive' });
}

function libMailStaffBlocco_(nome, cognome, ora, imp) {
  var dest = [];
  if (imp.EmailStaff) dest.push(imp.EmailStaff);
  if (imp.EmailAllarmi) dest.push(imp.EmailAllarmi);
  if (!dest.length) return;
  MailApp.sendEmail({ to: dest.join(','),
    subject: 'Bloccare tornello: ' + nome + ' ' + cognome + ' ha firmato 2 liberatorie',
    htmlBody: '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">'
      + '<div style="padding:24px 20px;font-size:15px;color:#14323F;line-height:1.6">'
      + '<div style="background:#FDECEC;border:2px solid #C0392B;border-radius:12px;padding:16px;margin:0 0 16px;text-align:center">'
      + '<div style="font-size:18px;font-weight:700;color:#C0392B">Bloccare il tornello</div></div>'
      + '<p style="margin:0 0 14px">Il socio <b>' + esc_(nome) + ' ' + esc_(cognome) + '</b> ha firmato la seconda e ultima liberatoria il ' + ora + '.</p>'
      + '<p style="margin:0 0 14px"><b>Da adesso questo socio NON puo piu entrare senza certificato medico.</b></p>'
      + '<p style="margin:0 0 6px"><b>Cosa fare:</b></p>'
      + '<p style="margin:0 0 14px">1. Aprire Wellness in Cloud<br>2. Cercare il socio: ' + esc_(nome) + ' ' + esc_(cognome) + '<br>3. Inserire il blocco tornello per certificato medico mancante<br>4. Se il socio si presenta, spiegargli che senza certificato non e possibile entrare</p>'
      + '<div style="background:#F0F7F8;border:1px solid #C8E0E3;border-radius:12px;padding:14px;margin:14px 0">'
      + '<div style="font-size:12px;font-weight:600;color:#1A9DA7;text-transform:uppercase;margin-bottom:4px">Medico convenzionato</div>'
      + '<div style="font-size:15px;font-weight:700;color:#14323F">Dr. Domenico Bisogno</div>'
      + '<div style="font-size:13px;color:#5A707A">Medicina dello sport - Senza appuntamento<br>Viale Donato Bramante 47, Fiumicino<br>Lun e Mer 15-18 - Mar e Gio 11:30-15 - Ven 17-19</div></div>'
      + '</div>' + firmaJarvis_() + '</div>',
    body: 'BLOCCARE TORNELLO: ' + nome + ' ' + cognome + ' ha firmato 2 liberatorie il ' + ora + '. Aprire Wellness in Cloud, cercare il socio, inserire blocco tornello.',
    name: 'Jarvis - Officine Sportive',
    inlineImages: { jarvis: logoJarvis_() } });
}
