/**
 * Ponte SMS Officine Sportive — Google Apps Script
 * Skebby blocca le richieste dai server Vercel ma accetta quelle da Google:
 * Vercel chiama questo ponte, il ponte manda l'SMS.
 * Le credenziali Skebby restano su Vercel e arrivano con ogni richiesta
 * (senza credenziali valide il ponte non può mandare nulla).
 * Deployment: App web, esegui come "Me", accesso "Chiunque".
 */
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (!d.auth || !d.numero || !d.testo) return out_({ ok: false, errore: 'Dati mancanti' });

    var login = UrlFetchApp.fetch('https://api.skebby.it/API/v1.0/REST/login', {
      headers: { Authorization: 'Basic ' + d.auth }, muteHttpExceptions: true
    });
    if (login.getResponseCode() !== 200) {
      return out_({ ok: false, errore: 'Login Skebby ' + login.getResponseCode() + ': ' + login.getContentText().slice(0, 200) });
    }
    var k = login.getContentText().trim().split(';');

    var body = { message_type: 'GP', message: d.testo, recipient: [d.numero], returnCredits: true };
    if (d.mittente) body.sender = d.mittente;
    var r = UrlFetchApp.fetch('https://api.skebby.it/API/v1.0/REST/sms', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { user_key: k[0], Session_key: k[1] },
      payload: JSON.stringify(body)
    });
    if (r.getResponseCode() >= 300) {
      return out_({ ok: false, errore: 'Invio ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300) });
    }

    var credito = null;
    try {
      var st = JSON.parse(UrlFetchApp.fetch('https://api.skebby.it/API/v1.0/REST/status?getMoney=true', {
        headers: { user_key: k[0], Session_key: k[1] }, muteHttpExceptions: true
      }).getContentText());
      var gp = (st.sms || []).filter(function (x) { return x.type === 'GP'; })[0];
      if (gp) credito = Number(gp.quantity);
    } catch (_) {}

    return out_({ ok: true, credito: credito });
  } catch (err) {
    return out_({ ok: false, errore: String(err) });
  }
}

function doGet() { return out_({ ok: true, servizio: 'ponte SMS Officine Sportive' }); }

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
