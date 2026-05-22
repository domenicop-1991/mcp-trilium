# Design — Tree navigation & attributes per mcp-trilium

**Data**: 2026-05-22
**Scope**: Aggiungere a `mcp-trilium` i tool MCP per (a) eliminare/spostare/listare la struttura ad albero delle note e (b) gestire attributi (label e relation), così da rendere il MCP server adatto al pattern "second brain" stile Claude Code + Obsidian.
**Repo**: fork personale di `RadonX/mcp-trilium` su GitHub dell'utente; nessuna PR upstream prevista.

## Obiettivo

Lo stato attuale del MCP espone solo CRUD basilare sulle note (`create_note`, `search_notes`, `get_note`, `update_note`). Per usare Trilium come "knowledge vault" alla pari di un vault Obsidian gestito da Claude Code, servono:

1. **Ristrutturazione del vault** — cancellare, spostare, listare figli di un nodo.
2. **Tagging e linking** — leggere e scrivere `#label` e `~relation`, che sono il sostituto Trilium dei wikilink Obsidian.

Senza (1) Claude lavora alla cieca sulla forma del vault. Senza (2) non c'è modo di costruire la rete semantica che il pattern "compounding wiki" richiede.

## Non-obiettivi

Esplicitamente fuori scope per questo design:
- Append/patch content (rimane su `update_note` con overwrite).
- Bulk operations.
- Search arricchita con metadata extra.
- Allegati (attachments).
- Calendar/inbox/import/export.
- Riscrivere in TypeScript o cambiare SDK MCP.

Questi possono diventare design successivi se ne nasce il bisogno.

## Architettura

Nessun cambio strutturale. Si segue il pattern esistente:

- **Tool nuovi** in `src/tools/<nome>.js` come funzioni `(triliumClient, args) => MCPResponse`.
- **Validatori nuovi** in `src/utils/validation.js` per i campi nuovi (`attributeId`, `attributeType`, `attributeName`).
- **Client ETAPI** invariato (ha già `get/post/put/putRaw/delete`).
- **Registrazione** in `src/index.js` nei tre punti soliti: schema in `ListToolsRequestSchema`, switch in `CallToolRequestSchema`, metodo wrapper sulla classe.
- **Test Jest** in `tests/<nome>.test.js` mantenendo lo stile mock-client esistente (coverage ≥90% sui nuovi tool).

Versione package: bump a `0.2.0` al completamento di tutte le fasi.

## Componenti per fase

**Ordine fasi (rev 2)**: scelto di seguire la priorità d'uso dichiarata dall'utente: prima attributi (capability più richiesta per il pattern wikilink), poi tree navigation, infine delete. Tradeoff accettato: attribute è la fase con più superficie ETAPI, la affrontiamo senza la "pipeline rodata" delle fasi più semplici; in cambio sblocchiamo subito il caso d'uso prioritario.

### Fase 1 — Attributes CRUD

Quattro tool. L'oggetto `Attribute` ETAPI: `{attributeId, noteId, type (label|relation), name, value, position, isInheritable}`.

Convenzioni Trilium da rispettare:
- **label**: `type=label`, `name` senza `#`, `value` opzionale (può essere `""`).
- **relation**: `type=relation`, `name` senza `~`, `value` = `noteId` target. **La validazione lato nostro verifica che `value` sia un noteId esistente** quando `type=relation` (per evitare relations dangling).

#### `list_attributes`

`GET /notes/{noteId}/attributes`.

**Input**: `{noteId, type?: 'label'|'relation'}`. Il filtro `type` è applicato lato nostro (ETAPI non ne ha uno).

**Output**: array di Attribute objects.

#### `create_attribute`

`POST /attributes`.

**Input schema**:
```json
{
  "noteId": "string (required)",
  "type": "string (required, enum: label|relation)",
  "name": "string (required) — senza prefisso # o ~, regex [a-zA-Z0-9_]+",
  "value": "string (optional per label, required per relation = noteId target)",
  "isInheritable": "boolean (default false)",
  "position": "number (optional)"
}
```

**Validazione extra**: se `type='relation'`, fa `GET /notes/{value}` per confermare che il target esista. Se 404 → ValidationError "Relation target does not exist".

#### `update_attribute`

`PUT /attributes/{attributeId}`. Solo `value` e `position` modificabili (ETAPI non permette di cambiare `type` o `name` — andrebbero ricreati).

**Input**: `{attributeId, value?, position?}`. Almeno uno tra `value` e `position` richiesto.

#### `delete_attribute`

`DELETE /attributes/{attributeId}`.

**Input**: `{attributeId}`.

### Fase 2 — Tree navigation

Due tool nuovi.

#### `list_children`

Lista i figli diretti di una nota. Implementato via `GET /notes?search=&ancestorNoteId={id}&ancestorDepth=eq1`. Risposta filtrata sui campi rilevanti.

**Input schema**:
```json
{
  "noteId": "string (required) — ID della nota parent",
  "limit": "number (1..100, default 50) — max figli da ritornare"
}
```

**Output**: array di `{noteId, title, type, mime, dateModified}`. Si esclude `childrenCount` dalla v1: richiederebbe N+1 query e non c'è ancora un caso d'uso che lo giustifichi (YAGNI). Se servirà, si aggiunge in un design successivo con flag opt-in.

**Note design**: ETAPI search ha un quirk — richiede `search` parameter, anche vuoto. Si passa `search=""` con `ancestorNoteId` e `ancestorDepth=eq1`. Da validare nel test di connettività.

#### `move_note`

Sposta una nota sotto un nuovo parent. Trilium permette i **cloni** (una nota presente sotto più parent tramite branch multipli). Il tool li supporta da subito.

Risoluzione del branch da spostare, in ordine di priorità:
1. `args.branchId` se fornito → verifica che appartenga a `noteId`.
2. `args.oldParentNoteId` se fornito → cerca il branch con quel `parentNoteId`. Se nessuno corrisponde, errore esplicito.
3. Se la nota ha un solo branch, usa l'unico.
4. Altrimenti (multi-branch senza `branchId` né `oldParentNoteId`) → ValidationError con elenco dei `branchIds` e dei rispettivi `parentNoteId` per aiutare il chiamante a scegliere.

Algoritmo:
1. `GET /notes/{noteId}` → leggi `branchIds[]` e per ciascuno `GET /branches/{branchId}` per scoprire i `parentNoteId` (necessario solo se serve la risoluzione step 2 o per ramificare in step 4; ottimizzazione possibile: parallelizza con `Promise.all`).
2. Risolvi il branch target con la logica sopra.
3. `PUT /branches/{branchId}` con body `{parentNoteId: newParentNoteId}`.

**Input schema**:
```json
{
  "noteId": "string (required) — nota da spostare",
  "newParentNoteId": "string (required) — nuovo parent",
  "branchId": "string (optional) — id esplicito del branch da spostare",
  "oldParentNoteId": "string (optional) — parent attuale del branch da spostare (alternativa più ergonomica a branchId)"
}
```

**Output**: `{operation, timestamp, request, result: {noteId, branchId, oldParentNoteId, newParentNoteId}}`.

**Errori**: 404 (nota o parent inesistente), 409 (ciclo: sposterebbe sotto un proprio discendente — l'API restituisce conflict), multi-branch senza disambiguazione → ValidationError lato nostro con dettagli (lista branch disponibili).

### Fase 3 — `delete_note`

Tool unico. Chiama `DELETE /notes/{noteId}`. Il client `TriliumClient.delete()` è già pronto.

**Input schema**:
```json
{
  "noteId": "string (required) — ID della nota da cancellare",
  "confirmCascade": "boolean (default false) — obbligatorio true se la nota ha figli"
}
```

**Semantica**: cancellazione cascata di tutte le sotto-note che hanno questa come **unico parent**. Note clonate sotto altri parent restano vive sotto i loro altri branch (comportamento standard ETAPI). Trilium ha soft-delete (`isDeleted:true`) recuperabile dall'UI, quindi non è perdita irreversibile.

**Guardrail**: prima di chiamare DELETE, il tool fa `GET /notes?ancestorNoteId={noteId}&ancestorDepth=eq1&limit=1` per scoprire se ci sono figli. Se ce ne sono e `confirmCascade !== true`, ValidationError con dettagli ("Note has N children; pass confirmCascade:true to delete subtree"). Questo evita il classico "Claude cancella per sbaglio metà del vault perché ha confuso un ID". Cancellare una foglia: diretto, nessun overhead.

**Validazione**: `validators.noteId(args.noteId)`. Rifiuto esplicito se `noteId === 'root'`.

**Output**: `{operation, timestamp, request:{noteId, confirmCascade}, result:{noteId, deleted:true, hadChildren:boolean}}`.

**Errori**: 404 → "Note not found", 400/403 → propagati, root → ValidationError, has-children-without-confirm → ValidationError.

Si è scelto di NON aggiungere un `dry_run`: il sistema di soft-delete + backup di Trilium copre già il caso "ho cancellato qualcosa per sbaglio", e `list_children` permette di vedere in anticipo cosa verrebbe cancellato senza serve un flag dedicato.

## Data flow

Tutti i tool nuovi seguono il flusso esistente:

```
MCP request
  → tool function (validazione args)
  → triliumClient.{get|post|put|delete}(endpoint, body)
  → axios → ETAPI HTTP
  → ETAPI response → axios interceptor (mappa 401/403/404/5xx in TriliumAPIError)
  → tool function (formatta risposta MCP)
  → MCP response { content: [{type:'text', text:summary}, {type:'text', text:JSON.stringify(data)}] }
```

Nessuna cache, nessuna sessione, nessuno stato interno. Stateless per design.

## Error handling

Replica esattamente il pattern di `update-note.js`:

- `ValidationError` → MCP response con `isError: true`, messaggio chiaro.
- `TriliumAPIError` con status noto (404/403) → response specifica per status.
- `TriliumAPIError` altro → response generica con status incluso nel JSON.
- Errore sconosciuto → catch-all generico.

Nuovo: per `delete_note` con `noteId === 'root'`, ValidationError immediato senza chiamare ETAPI ("Cannot delete root note").

Nuovo: per `delete_note` con figli e `confirmCascade !== true`, ValidationError prima della DELETE ("Note has N children; pass confirmCascade:true to delete subtree").

Nuovo: per `create_attribute` con `type='relation'` e target inesistente, ValidationError ("Relation target {noteId} does not exist").

Nuovo: per `move_note` multi-branch senza disambiguazione, ValidationError con elenco dei branch disponibili per aiutare il chiamante a scegliere `branchId` o `oldParentNoteId`.

## Testing

Per ogni nuovo tool, file `tests/<tool>.test.js` con questi casi minimi:

- Happy path con mock client che ritorna risposta valida.
- Validazione input fallita (missing, wrong type).
- API error 404 → response formato corretto, `isError: true`.
- API error 403 → response formato corretto.
- API error generico 500 → response formato corretto.

Coverage target ≥90% sui nuovi file. Si lascia inalterato il setup Jest esistente.

**Test di integrazione**: dopo ogni fase, smoke manuale sul Trilium reale (`http://100.95.56.11:8080`):
1. Fase 1 (attributes): crea label `#test` su una nota, aggiorna value, crea relation `~related` verso altra nota, lista filtrando per type, cancella.
2. Fase 2 (tree): crea albero a 3 livelli, lista figli a vari livelli, sposta sottoalbero. Test extra con clone (nota in due parent): crea il clone, sposta uno dei due branch, verifica che l'altro sia intatto.
3. Fase 3 (delete): crea nota foglia → cancella diretta. Crea sottoalbero → tenta cancellazione senza `confirmCascade` (deve fallire) → ritenta con `confirmCascade:true` (deve riuscire). Verifica via UI che `isDeleted:true` sia coerente.

## Migrazione e housekeeping

**Prima della Fase 1**:
- Commit delle modifiche pendenti (`type: application/json` → `text` nei 4 tool esistenti). Sono già a posto, vanno solo committate.
- Cambio del git remote `origin` dal fork RadonX al fork personale dell'utente su GitHub. (Step manuale: l'utente crea il repo su GitHub, poi runno `git remote set-url`.)
- Aggiorna `package.json` con `name` e `repository` corretti (rimuovi placeholder `your-username`).

**Dopo Fase 3**:
- Bump versione a `0.2.0`.
- Aggiorna `README.md` e `CLAUDE.md` con i nuovi tool.
- Aggiorna `package.json:version` e tagga `v0.2.0`.

## Rischi noti

1. **ETAPI search con `ancestorDepth=eq1`**: non testato dal client attuale. Se non funziona come documentato, fallback a `GET /notes/{id}` e parsing di `branchIds` per scoprire i figli (richiede chiamate aggiuntive ma è sicuro).
2. **Cloni multi-branch in `move_note`**: supportati tramite `branchId` o `oldParentNoteId`. Costo: una chiamata aggiuntiva `GET /branches/{id}` per branch nel caso multi-branch (raro nella pratica). Trascurabile.
3. **Attribute con `name` contenente caratteri speciali**: ETAPI accetta solo `[a-zA-Z0-9_]` per i nomi label/relation. Validazione lato nostro per fail-fast prima della chiamata HTTP.
4. **Race condition multi-client**: due Claude su due PC (fisso e portatile) potrebbero scrivere insieme. Trilium gestisce server-side con timestamp. Non mitiga il MCP server.

## Criteri di successo

Il design è "fatto" quando, da una sessione Claude Code:
- Si può chiedere "elenca le note sotto X, sposta Y sotto Z, cancella W" e funziona.
- Si può chiedere "aggiungi `#progetto/sinapsy` alla nota X" e funziona.
- Si può chiedere "crea una relation ~related da X a Y" e funziona, con errore esplicito se Y non esiste.
- I 94+ test Jest esistenti continuano a passare e i nuovi tool sono coperti al ≥90%.
