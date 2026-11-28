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

## 🔴 Bloccato
- **Casella info** (CV e selezione, lamentele, disdette, sospensioni, richieste prezzo, sequenze) e tutto ciò che legge le mail (conferma budget via mail, Daily via mail): serve l'accesso IMAP a info@ su Register (server `mail.securemail.pro`). Login rifiutato: da sbloccare con Andrea.
- **Prova nuoto**: legge un Google Modulo, va rifatta come pagina Jarvis.
- **Compiti automatici di Claude** (mail dati mattina/sera, numeri Wellness nel Daily, VS, Piano di Alessandro, ranking, tesseramenti, revisione del lunedì, promemoria): leggono fogli Google e mandano dalla Gmail officinesportive3. Vanno ripuntati su Jarvis. Le mail dati mattina/sera leggono i turni dall'artifact della prima nota, fermi al 17/11.
- **File del Drive** (foto, attestati): ancora da copiare.

## ⏳ In attesa
- Alessandro: nuovo Jarvis 2 senza filtro «Disdetta rinnovo» (mail del 27/11). Controllo automatico lunedì 30/11 alle 17:30.

## Regole per chi lavora qui
- Vercel Hobby: massimo 12 funzioni. `api/jarvis.js` è il router unico: le funzioni nuove vanno lì, non come file nuovi in `api/`.
- Repository pubblico: niente chiavi, password o codici nel repository (segreti in `jarvis_segreti`, codici cifrati in `api/_codici`).
- Mail: anteprima ad Andrea prima di ogni mail nuova, simulazione prima di ogni flusso automatico.
