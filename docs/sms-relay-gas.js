/**
 * SMS Relay — Google Apps Script
 * Incolla questo codice in un nuovo progetto Apps Script.
 * Poi: Esegui il deployment → Nuova distribuzione → App web → Chiunque.
 * Copia l'URL del deployment e mettilo come VERCEL env var SMS_RELAY_URL.
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    // Verifica chiave segreta
    var secret = PropertiesService.getScriptProperties().getProperty('RELAY_SECRET');
    if (secret && data.secret !== secret) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, errore: 'Non autorizzato' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    inviaSms_(data.numero, data.testo);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, errore: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function loginSkebby_() {
  var props = PropertiesService.getScriptProperties();
  var auth = Utilities.base64Encode(props.getProperty('SMS_USER') + ':' + props.getProperty('SMS_PASSWORD'), Utilities.Charset.UTF_8);
  var r = UrlFetchApp.fetch('https://api.skebby.it/API/v1.0/REST/login', {
    headers: { Authorization: 'Basic ' + auth }, muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) throw new Error('Login Skebby fallito: ' + r.getResponseCode());
  return r.getContentText().trim().split(';');
}

function inviaSms_(numero, testo) {
  var k = loginSkebby_();
  var r = UrlFetchApp.fetch('https://api.skebby.it/API/v1.0/REST/sms', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { user_key: k[0], Session_key: k[1] },
    payload: JSON.stringify({ message_type: 'GP', message: testo, recipient: [numero], returnCredits: true })
  });
  if (r.getResponseCode() >= 300) throw new Error('SMS non inviato: ' + r.getContentText());
}
