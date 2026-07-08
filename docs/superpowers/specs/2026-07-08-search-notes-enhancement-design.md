# Design — Potenziamento `search_notes` + fix documentazione

Data: 2026-07-08
Stato: approvato (design), da implementare

## Contesto e motivazione

Il README elenca in "Future Enhancements" alcune feature "planned". Due delle più
allettanti sono in realtà **già implementate**:

- **Advanced search**: `search_notes` passa la query raw all'endpoint ETAPI
  `GET /notes?search=...`, quindi la sintassi Trilium (`#label`, `type:code`,
  `dateCreated:>2024-01-01`, operatori combinati) è già disponibile senza codice
  aggiuntivo.
- **Note relationship management**: `create_attribute` gestisce già
  `type: 'relation'` con validazione del target (in Trilium una relation è un
  attributo).

Il gap reale non è una feature nuova: è che **`search_notes` scarta i parametri
che ETAPI `GET /notes` già offre**, usando solo `search` e `limit`. Questo
costringe a workaround nella query e impedisce di sfruttare capacità native.

Casi d'uso concreti bloccati oggi:

- Cercare **solo dentro un sottoalbero** (es. solo `Second Brain/`, o solo la
  zona `Basic Memories`) richiede di infilare a mano `note.ancestors.noteId`
  nella query invece di usare il parametro `ancestorNoteId`.
- **Ordinare i risultati** (es. il Diario per `dateModified` discendente)
  richiede post-processing lato client invece di `orderBy`/`orderDirection`.
- Non si può attivare `fastSearch` né includere le note archiviate.

## Obiettivo

Esporre nel tool `search_notes` i sei parametri già supportati da ETAPI, con
validazione minima e comportamento **retro-compatibile**: se un parametro è
assente, non viene inviato a ETAPI e il comportamento resta identico a oggi.

Non-obiettivi (esplicitamente fuori scope):

- Excerpt/contenuto nei risultati di ricerca (valutato, escluso da questo giro).
- Bulk operations, attachment, template, WebSocket, caching, export, analytics,
  backup — tagliati o rinviati.

## Parametri aggiunti

Tutti opzionali. Nessun default inviato a ETAPI quando il parametro è assente.

| Parametro | Tipo | Semantica ETAPI |
|---|---|---|
| `ancestorNoteId` | string (noteId) | Limita la ricerca al sottoalbero della nota indicata |
| `ancestorDepth` | string | Profondità relativa all'ancestor (es. `eq1`, `lt3`, `gt2`) |
| `orderBy` | string | Campo di ordinamento (es. `dateModified`, `dateCreated`, `title`, `relevancy`; Trilium ammette anche property/label) |
| `orderDirection` | string | `asc` o `desc` |
| `fastSearch` | boolean | Ricerca rapida (title/attributi, salta il fulltext del contenuto) |
| `includeArchivedNotes` | boolean | Include le note archiviate nei risultati |

## Componenti e modifiche

Quattro file di codice/test, due di documentazione.

### 1. `src/index.js` — schema del tool

Estendere `inputSchema.properties` del tool `search_notes` con le sei property e
le rispettive `description`. `required` resta `['query']`. `orderDirection` usa
`enum: ['asc', 'desc']`; i booleani `type: 'boolean'`; gli altri `type: 'string'`.

### 2. `src/tools/search-notes.js` — costruzione richiesta

- Leggere i nuovi argomenti da `args`.
- Validarli tramite `validators` (vedi sotto).
- Aggiungerli a `URLSearchParams` **solo se definiti** (append condizionale). I
  booleani vengono serializzati come `'true'`/`'false'`. Nessun parametro viene
  inviato con valore di default implicito.
- Includere i parametri effettivamente usati nel `searchData` di risposta per
  trasparenza/debug (oltre a `query` e `limit` già presenti).

### 3. `src/utils/validation.js` — validator (opzione A: leggera)

Coerente con la filosofia esistente (`searchQuery` fa passthrough con controlli
minimi): non si duplica la validazione semantica che Trilium già esegue.

- `orderDirection(value)`: se assente → `undefined`; altrimenti deve essere
  `'asc'` o `'desc'` (case-insensitive, normalizzato lowercase), altrimenti
  `ValidationError`.
- `boolean(value, fieldName)`: accetta boolean nativo o le stringhe
  `'true'`/`'false'`; assente → `undefined`; altro → `ValidationError`.
- `orderBy(value)` e `ancestorDepth(value)`: **validazione leggera** — se
  assenti → `undefined`; altrimenti stringa non vuota, lunghezza massima (es.
  100 char) e charset sicuro (alfanumerico, `_`, `.`, `#`, spazio) per prevenire
  injection nei parametri URL. La correttezza semantica è delegata a Trilium, che
  rifiuta i valori non validi.
- `ancestorNoteId`: riusa il validator `noteId` esistente; assente → `undefined`.

### 4. `tests/tools/search-notes.test.js` — copertura

Casi minimi:
- Nessun nuovo parametro → richiesta e comportamento invariati (regressione).
- Ogni parametro singolo → presente correttamente in `URLSearchParams`.
- `orderDirection` invalido, `boolean` invalido, `orderBy`/`ancestorDepth` con
  charset non ammesso → `ValidationError`.
- Combinazione di più parametri insieme.

### 5. `README.md` — fix documentazione

- Sezione "Future Enhancements": marcare **advanced search** e **note
  relationship management** come già disponibili; rimuovere le voci senza senso
  per un MCP stateless (real-time/WebSocket, caching/streaming, analytics,
  backup/restore).
- Documentare i sei nuovi parametri di `search_notes`.
- Voce di changelog per la nuova versione minore.

### 6. `CLAUDE.md` di progetto — allineamento

Aggiornare la sezione "Search Query Support" citando i nuovi parametri e il fatto
che sono passthrough diretti verso ETAPI.

## Flusso dati

Invariato nella struttura: `args` → validazione → `URLSearchParams` →
`GET notes?...` → mapping risultati → risposta MCP (summary + JSON). L'unica
differenza è che `URLSearchParams` ora può contenere fino a sei chiavi aggiuntive,
tutte opzionali.

## Gestione errori

Riusa il pattern esistente: `ValidationError` per input non validi (risposta MCP
con `isError: true`), `TriliumAPIError` per errori ETAPI (incluso il caso in cui
Trilium rifiuti un `orderBy`/`ancestorDepth` semanticamente invalido → messaggio
propagato all'utente).

## Testing

Estendere la suite Jest esistente (coverage attuale ~94%). I nuovi validator e i
rami condizionali di append devono essere coperti dai casi sopra.

## Compatibilità

Nessuna breaking change. Tutti i parametri sono opzionali e additivi; le chiamate
esistenti a `search_notes` continuano a funzionare identiche. Bump di versione
minore (feat).
