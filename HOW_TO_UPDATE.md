# Guida per Pubblicare un Aggiornamento

Per consentire alla tua app di scaricare e installare automaticamente le nuove versioni, devi seguire questi passaggi ogni volta che vuoi rilasciare un aggiornamento:

## 1. Incrementa la Versione
Apri il file `src-tauri/tauri.conf.json` e aggiorna il campo `"version"` (es. da `"1.0.0"` a `"1.0.1"`).

## 2. Compila la nuova versione
Esegui il comando di build per generare i file necessari:
```bash
pnpm build:app
```
Al termine della compilazione, nella cartella `src-tauri/target/release/bundle/msi/` troverai:
- `VictoriaLaserApp_<version>_x64_en-US.msi` (L'installer normale che fa anche da Update bundle)
- `VictoriaLaserApp_<version>_x64_en-US.msi.sig` (La firma digitale di sicurezza generata per l'installer)

Copia il contenuto del file `.sig` (è una breve stringa di testo) perché ti servirà per il file `latest.json`.

## 3. Prepara il file `latest.json`
L'app controlla se ci sono aggiornamenti leggendo un file chiamato `latest.json`. Per evitare errori di battitura, usa il file `latest.template.json` presente nel progetto come base.

Crea una copia di `latest.template.json`, rinominala in `latest.json` e aggiorna i campi:

```json
{
  "version": "1.0.1",
  "notes": "Bug fix e miglioramenti prestazioni",
  "pub_date": "2026-03-09T20:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "INCOLLA_QUI_IL_CONTENUTO_DEL_FILE_.SIG",
      "url": "https://github.com/JodieFlacko/Laser-App-Antigravity/releases/download/v1.0.1/VictoriaLaserApp_1.0.1_x64_en-US.msi"
    }
  }
}
```
*Assicurati che l'URL punti direttamente al file `.msi` che caricherai su GitHub e che la firma sia esattamente quella contenuta nel file `.sig` senza spazi extra.*

## 4. Pubblica su GitHub Releases
1. Vai su [Releases del tuo repository](https://github.com/JodieFlacko/Laser-App-Antigravity/releases).
2. Clicca su **"Draft a new release"**.
3. Scegli un tag (es. `v1.0.1`) e un titolo.
4. Carica come "Assets" i seguenti 3 file:
   - L'installer (`.msi` oppure `.exe` a seconda di quale scegli di usare)
   - La firma dell'installer associato (`.msi.sig` oppure `.exe.sig` - facoltativo se inclusa nel json, ma consigliato)
   - Il file **`latest.json`** compilato correttamente.

> [!IMPORTANT]
> **Requisito Fondamentale per GitHub Releases:**
> La release **DEVE** essere pubblicata come rilasciata ("Published"). 
> - Se la salvi come **"Draft"** (Bozza), il link non funzionerà.
> - Se la contrassegni come **"Pre-release"**, l'endpoint `releases/latest/` di GitHub la ignorerà.
>
> Assicurati di cliccare su **"Publish release"** e di NON spuntare la casella "Set as a pre-release".

Fatto! Ora chiunque apra l'app e vada nelle Impostazioni cliccando "Cerca Aggiornamenti" riceverà la notifica e potrà installare l'update, perché il link `releases/latest/download/latest.json` punterà direttamente al `latest.json` della tua ultima release stabile.
