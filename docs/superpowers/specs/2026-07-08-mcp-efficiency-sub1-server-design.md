# Design — Efficienza MCP, Sub-progetto 1 (Server)

Data: 2026-07-08
Stato: approvato (design), da implementare
Branch: `feat/mcp-efficiency` (base: `feat/search-notes-etapi-params`, PR #1)

## Contesto

Un audit dei 5 workflow che usano il server (`/daily`, `/save`, `/recall`,
`/wiki`, `/migrate`) ha misurato dove si consumano chiamate MCP e token. Report
completo in `.superpowers/sdd/flow-audit.md`. Conclusioni rilevanti per questo
sub-progetto:

- I workflow ri-cercano continuamente note a noteId stabile (`_Convenzioni`,
  `Diario/`, `Sorgenti/`, `Concetti/`, `Persone/`, `_migration-log`) con
  `search_notes` + disambiguazione per `parentNoteId`. Costo: 2-6 chiamate per
  comando, ogni volta.
- Il pattern `get → concatena → update` per appendere contenuto ricorre in
  `/daily`, `/wiki` e due volte in `/migrate`.
- Il payload di `search-notes` include campi mai usati dai workflow.

L'audit ha inizialmente indicato anche `parentNoteIds` come inutilizzato: **è un
errore**. Le skill lo usano per disambiguare zone omonime (una ricerca del
titolo `Diario` restituisce 4 note distinte). `parentNoteIds` va mantenuto.

## Obiettivo

Ridurre chiamate e token dei workflow tramite tre interventi lato server,
indipendenti e testabili a sé:

1. Una resource che espone alias `nome → noteId` configurabili, così i client
   ottengono gli ID delle zone stabili senza cercarli.
2. Un tool `append_to_note` che incapsula il read-modify-write dell'append.
3. Snellimento del payload di `search-notes`.

Il server resta generico: senza configurazione, nessun comportamento cambia.

### Non-obiettivi

- `get_notes` batch e `get_day_note`: **rimandati**. L'audit li ha ridimensionati
  (il batch è coperto parallelizzando i `get_note`; `get_day_note` è assorbito
  dall'alias `Diario` + disallineamento `#calendarRoot`). Si rivaluteranno dopo
  aver rimisurato il costo dei workflow.
- Refactor delle skill (`~/.claude/commands/*.md`) per usare la resource,
  deduplicare `list_attributes`, parallelizzare i `get_note`: sono il
  **Sub-progetto 2**, dipendente da questo, con spec propria.

## Componenti

### A. Resource `trilium://aliases`

**File:** `src/resources/aliases.js` (nuovo), registrazione in `src/index.js`
accanto alla resource `recent-notes` esistente.

- A ogni richiesta della resource il server (ri)legge un file JSON il cui path è
  dato dalla env var `TRILIUM_ALIASES_FILE` (così il file si può editare senza
  riavviare il server). Formato piatto: `{ "diario": "JOwA3qQfctr3",
  "convenzioni": "msYV2ZwJq50O", ... }`.
- La resource restituisce la mappa `nome → noteId` così com'è. **Non** risolve i
  titoli dal vault (sarebbe una chiamata per alias, in contrasto con l'obiettivo).
- Comportamento di default generico: env non impostata, file assente, o JSON
  malformato → mappa vuota (con un log di warning nei casi di file
  presente-ma-illeggibile). Il server resta pubblicabile e neutro.
- Validazione lazy: la resource non verifica che gli ID esistano nel vault. Un
  ID morto lo scopre chi lo usa (errore 404 dal tool che lo consuma).

### B. Tool `append_to_note`

**File:** `src/tools/append-note.js` (nuovo), schema in `src/index.js`, test in
`tests/append-note.test.js`.

- Firma: `append_to_note(noteId, content, format='markdown')`.
- Logica, riusando le utility esistenti:
  1. `GET notes/{noteId}/content` per il contenuto attuale (HTML).
  2. Se `format === 'markdown'`, converti il nuovo `content` con
     `markdownToHtml` (da `src/utils/md-to-html.js`, come fa `create-note`/
     `update-note`).
  3. Concatena `contenutoEsistente + nuovoContenutoConvertito`.
  4. Scrivi con `triliumClient.putRaw('notes/{noteId}/content', ...)` (come
     `update-note`).
- Gestisce la nota vuota (primo append = il contenuto esistente è stringa vuota →
  scrive solo il nuovo blocco).
- Nessun separatore automatico: ogni append è un proprio blocco HTML.
- Validazione input: `noteId` (validator esistente), `content` (validator
  `content` esistente), `format` (validator `contentFormat` esistente).

**Caveat esplicito (da documentare nel tool description e qui):** l'operazione
**non è atomica**. ETAPI non offre append parziale, quindi è read-modify-write
con una finestra di race: due append concorrenti sulla stessa nota possono far
perdere uno dei due. Accettabile per l'uso mono-utente attuale. Il valore del
tool è eliminare la duplicazione del pattern nelle skill e ridurre il rischio di
sovrascrittura accidentale, non fornire transazionalità.

### C. Snellimento payload `search-notes`

**File:** `src/tools/search-notes.js` (modifica del blocco `notes.map(...)`),
test in `tests/search-notes.test.js`.

- Proiezione di ogni nota: `noteId`, `title`, `type`, `dateModified`,
  `parentNoteIds`, più i campi condizionali già presenti (`mime`, `attributes`,
  `contentLength`).
- Rimossi: `dateCreated` e `isProtected` (nessun workflow li usa; `isProtected`
  era sempre presente come `false`).
- `parentNoteIds` **mantenuto**: serve alla disambiguazione delle zone omonime
  nelle skill.
- Il blocco summary testuale (`content[0]`) e la struttura a due blocchi restano
  invariati (coerenza con `get-note`).

## Flusso dati

Invariato nella struttura. La resource aggiunge una sorgente di sola lettura
(file JSON → mappa). `append_to_note` è una composizione di due chiamate ETAPI
già usate altrove. Lo snellimento tocca solo la proiezione dei risultati.

## Gestione errori

Riusa i pattern esistenti: `ValidationError` per input non validi, e
`TriliumAPIError` per errori ETAPI (es. 404 su noteId inesistente in
`append_to_note`, propagato con messaggio chiaro). La resource alias, in caso di
file illeggibile/JSON invalido, non solleva ma restituisce mappa vuota e logga un
warning — non deve impedire l'avvio del server.

## Testing

Jest, coerente con la suite esistente (~198 test, ~94% coverage).

- Resource alias: file valido → mappa corretta; env non impostata → mappa vuota;
  file assente → mappa vuota; JSON malformato → mappa vuota + warning.
- `append_to_note`: append su nota con contenuto esistente (concatenazione
  corretta, markdown convertito); append su nota vuota; `format='html'`/`'raw'`
  (nessuna conversione); noteId inesistente → errore 404; content invalido →
  `ValidationError`.
- `search-notes`: i risultati contengono `noteId/title/type/dateModified/
  parentNoteIds` e NON contengono `dateCreated`/`isProtected`; retro-compat degli
  altri campi condizionali.

## Compatibilità

- Resource e tool sono **additivi**. Nessuna configurazione → nessun cambiamento.
- Lo snellimento di `search-notes` è un cambiamento del payload di output: i 5
  workflow non usano i campi rimossi. È un fork personale, quindi accettabile
  senza flag di compatibilità (YAGNI). Se un consumer esterno servisse quei
  campi, si aggiungerebbe un flag in un secondo momento.
- Dipendenza: questo sub-progetto si appoggia al codice della PR #1
  (parametri ETAPI in `search-notes.js`). Va ribasato su `main` dopo il merge
  della PR #1.
- Bump di versione minore (feat) alla chiusura del sub-progetto.
