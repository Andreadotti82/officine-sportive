# Stato del passaggio a Jarvis

Unico punto di verità sul passaggio da Google a Jarvis. **Ogni sessione di Claude (chat o Claude Code) lo legge prima di lavorare e lo aggiorna quando finisce qualcosa.** Ultimo aggiornamento: 28/11/2026.

Jarvis = Vercel (officine-sportive.vercel.app) + Supabase + Resend. Piano: staccare Google da lunedì 30/11, quando Claude dice ad Andrea che è tutto pronto.

## ✅ Già su Jarvis e in uso
- Prova gratuita 2 giorni (`/`), Lista Guest Pass (`/lista`), Gradimento (`/gradimento`)
- App Turni (`/turni`, dati in `turni_docs`)
- App Contratti (`/contratti`, back office `/staff`, liberatoria `/liberatoria`): OTP via SMS e mail funzionanti (28/11). Manca: mail automatiche dopo la firma. I ragazzi restano su Google finché non è completa; al passaggio si cancellano le prove e si copiano i contratti da Google.

## 🟡 Pronti su Jarvis, in simulazione (si accendono allo switch)
- **Fit Check** (`/fitcheck`): turni di Aurora e Alessandro dall'app Turni. Allo switch: copiare le prenotazioni Google e mettere `jarvis_stato.fitcheck` attivo.
- **Action plan, Good Morning / Good Night, Homework** (con budget sales, report club, VS): girano sul «motore» (`api/_gas`) con lo stesso codice di Google, cifrato in `api/_codici`. Allo switch: reimportare fogli e proprietà, `jarvis_stato gas-<app> {attivo:true}`, ripuntare `/actionplan`, `/goodmorning`, `/hw` e il redirect `/gm` sul motore.
- **Prima nota** (`/primanota?k=…`): stesso codice dell'artifact, archivio in `pn_docs`, turni dall'app Turni. Allo switch: copiare l'archivio dall'artifact (cassa/*, movimenti, allegati) a cassa chiusa, dare il link nuovo ai ragazzi.
- **Contenitore di link** (`/link?k=…`) con tutti i link nuovi.
- **QR Good Morning / Good Night**: stampati (indirizzo fisso `/gm`).

## 🔄 In corso
- **Casella info@ collegata a Jarvis** (28/11): IMAP su `pop.securemail.pro:993` (è il server IMAP di Register; `mail.securemail.pro` rifiuta il login). Utente e password nelle variabili Vercel `INFO_MAIL_USER`/`INFO_MAIL_PASS`. Prova: `infoProva` → 282 mail in INBOX.
  - `infoLeggi` (api/_posta.js) porta le mail in `info_mail` (allegati in `jarvis-file/info/…`); Register non viene toccato. **Limite attuale: su Register l'inoltro verso officneinfo@gmail.com cancella le mail da info@ dal 21/11** → serve inoltro con copia (filtro «inoltra + mantieni»), poi allo switch si toglie l'inoltro.
  - Motore: `GmailApp` emulato su `info_mail` (api/_gas/posta.js: ricerca Gmail, conversazioni, etichette/archivio/cestino su Jarvis, risposte da info@). App `info` (casella info) e `selezione` caricano il codice da `jarvis-file/codici/*.js` (copiato da Google con `driveCodice`). Fogli importati: Casella Info (1zvwtK…), Ponte (1GCMqZ…), Lista Guest Pass (1qSf4A…). `smista` gira su Jarvis senza errori (simulazione).
  - Proprietà della casella info: il codice su Google (jarvis-codice-casella-info.js) ha un aggancio che ogni ora le manda a Jarvis (`gasRiceviProp`, app `info`).
  - Da fare: inoltro con copia, giro automatico (cron infoLeggi + smista/sequenza) in simulazione, file Wellness letti dal Drive (CERT_CARTELLA) → da `drive_file`, selezione (proprietà e prova), switch. Da fare: portare su Jarvis gli automatismi della casella info (CV e selezione, lamentele, disdette, sospensioni, richieste prezzo, sequenze, conferma budget e Daily via mail), poi togliere il redirect Register verso officneinfo@gmail.com e spegnere officinesportive3.
- **Copia del Drive di officinesportive3** (28/11): ✅ FINITA. 151 file copiati (35 MB) in `jarvis-file/drive/<id>/<nome>`, elenco in `drive_file`; saltati 29 (16 Moduli Google, 13 progetti Apps Script: non sono file). Cron `copia-drive` tolto. Il Drive non è stato toccato. Da fare: far leggere VS, chiusura mese, report club e casella info (CERT_CARTELLA) da `drive_file`/Supabase; i file nuovi dei ragazzi continuano ad arrivare anche sul Drive finché c'è Google (rilanciare `driveGiro` allo switch per l'ultima copia).
- Nota 28/11: le tabelle `pn_docs`, `jarvis_testi`, `drive_file` non erano aperte a `service_role` (Jarvis non le leggeva). Corretto. **Ogni tabella nuova va creata con `grant select, insert, update, delete … to service_role`.**

## 🔴 Bloccato
- **Prova nuoto**: legge un Google Modulo, va rifatta come pagina Jarvis.
- **Compiti automatici di Claude** (mail dati mattina/sera, numeri Wellness nel Daily, VS, Piano di Alessandro, ranking, tesseramenti, revisione del lunedì, promemoria): leggono fogli Google e mandano dalla Gmail officinesportive3. Vanno ripuntati su Jarvis. Le mail dati mattina/sera leggono i turni dall'artifact della prima nota, fermi al 17/11.

## ⏳ In attesa
- Alessandro: nuovo Jarvis 2 senza filtro «Disdetta rinnovo» (mail del 27/11). Controllo automatico lunedì 30/11 alle 17:30.

## Regole per chi lavora qui
- Vercel Hobby: massimo 12 funzioni. `api/jarvis.js` è il router unico: le funzioni nuove vanno lì, non come file nuovi in `api/`.
- Repository pubblico: niente chiavi, password o codici nel repository (segreti in `jarvis_segreti`, codici cifrati in `api/_codici`).
- Mail: anteprima ad Andrea prima di ogni mail nuova, simulazione prima di ogni flusso automatico.
