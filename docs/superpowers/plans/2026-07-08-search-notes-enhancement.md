# Potenziamento `search_notes` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Esporre nel tool `search_notes` i sei parametri che ETAPI `GET /notes` già offre (`ancestorNoteId`, `ancestorDepth`, `orderBy`, `orderDirection`, `fastSearch`, `includeArchivedNotes`), in modo additivo e retro-compatibile.

**Architecture:** Tre nuovi validator leggeri in `validation.js` (opzione A: charset/lunghezza, semantica delegata a Trilium), cablaggio dei parametri opzionali in `search-notes.js` con append condizionale a `URLSearchParams`, ed estensione dell'`inputSchema` del tool in `index.js`. Nessuna dipendenza nuova, nessun nuovo tool.

**Tech Stack:** Node.js 22 (ES modules), Jest, ETAPI TriliumNext via `URLSearchParams` + client HTTP esistente.

## Global Constraints

- Node.js ≥ 18 (repo gira su v22), ES modules (`"type": "module"`).
- Retro-compatibilità assoluta: se un parametro è assente non viene inviato a ETAPI; le chiamate esistenti a `search_notes` producono URL e output identici a oggi.
- Validazione **opzione A (leggera)** per `orderBy`/`ancestorDepth`: stringa non vuota, max 100 char, charset `[a-zA-Z0-9_.#\s]`. La correttezza semantica è delegata a Trilium.
- Ogni parametro nuovo è opzionale; `required` del tool resta `['query']`.
- Comando test: `npm test`. Coverage attuale ~94%, non regredire.

---

### Task 1: Nuovi validator in `validation.js`

**Files:**
- Modify: `src/utils/validation.js` (aggiunta di 3 validator in fondo all'oggetto `validators`, dopo `mime`)
- Test: `tests/validation.test.js`

**Interfaces:**
- Produces:
  - `validators.orderDirection(value)` → `'asc' | 'desc' | undefined`; lancia `ValidationError` se valore diverso.
  - `validators.boolean(value, fieldName?)` → `true | false | undefined`; accetta boolean nativo o stringhe `'true'`/`'false'`; lancia `ValidationError` altrimenti.
  - `validators.searchField(value, fieldName?)` → stringa validata o `undefined`; usato sia per `orderBy` sia per `ancestorDepth`.
- Consumes: `ValidationError` (già esportata dallo stesso modulo).

- [ ] **Step 1: Scrivere i test che falliscono**

In `tests/validation.test.js`, aggiungere in fondo al file (prima della chiusura del `describe` radice o come nuovo `describe`):

```javascript
describe('orderDirection', () => {
  test('returns undefined when absent', () => {
    expect(validators.orderDirection(undefined)).toBeUndefined();
    expect(validators.orderDirection(null)).toBeUndefined();
  });
  test('accepts asc/desc case-insensitive and normalizes', () => {
    expect(validators.orderDirection('asc')).toBe('asc');
    expect(validators.orderDirection('DESC')).toBe('desc');
  });
  test('throws on invalid value', () => {
    expect(() => validators.orderDirection('sideways')).toThrow(ValidationError);
  });
});

describe('boolean', () => {
  test('returns undefined when absent', () => {
    expect(validators.boolean(undefined)).toBeUndefined();
    expect(validators.boolean(null)).toBeUndefined();
  });
  test('passes through native booleans', () => {
    expect(validators.boolean(true)).toBe(true);
    expect(validators.boolean(false)).toBe(false);
  });
  test('coerces string true/false', () => {
    expect(validators.boolean('true')).toBe(true);
    expect(validators.boolean('false')).toBe(false);
  });
  test('throws on non-boolean', () => {
    expect(() => validators.boolean('yes', 'fastSearch')).toThrow(ValidationError);
  });
});

describe('searchField', () => {
  test('returns undefined when absent or blank', () => {
    expect(validators.searchField(undefined)).toBeUndefined();
    expect(validators.searchField('   ')).toBeUndefined();
  });
  test('accepts allowed charset', () => {
    expect(validators.searchField('dateModified')).toBe('dateModified');
    expect(validators.searchField('note.title')).toBe('note.title');
    expect(validators.searchField('#priorita')).toBe('#priorita');
  });
  test('throws on invalid charset', () => {
    expect(() => validators.searchField('title; DROP', 'orderBy')).toThrow(ValidationError);
  });
  test('throws when longer than 100 chars', () => {
    expect(() => validators.searchField('a'.repeat(101), 'orderBy')).toThrow(ValidationError);
  });
});
```

Verificare che l'import in cima al file includa `validators` e `ValidationError` (già presenti nei test esistenti dello stesso file; non duplicare l'import).

- [ ] **Step 2: Eseguire i test per verificare che falliscano**

Run: `npm test -- validation.test.js`
Expected: FAIL — `validators.orderDirection is not a function` (e simili).

- [ ] **Step 3: Implementare i validator**

In `src/utils/validation.js`, dentro l'oggetto `validators`, dopo la chiave `mime` (riga ~154), aggiungere:

```javascript
  orderDirection: (value) => {
    if (value === undefined || value === null) return undefined;
    const trimmed = typeof value === 'string' ? value.trim().toLowerCase() : value;
    if (trimmed !== 'asc' && trimmed !== 'desc') {
      throw new ValidationError("orderDirection must be 'asc' or 'desc'");
    }
    return trimmed;
  },

  boolean: (value, fieldName = 'value') => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new ValidationError(`${fieldName} must be a boolean`);
  },

  searchField: (value, fieldName = 'value') => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') {
      throw new ValidationError(`${fieldName} must be a string`);
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    if (trimmed.length > 100) {
      throw new ValidationError(`${fieldName} cannot exceed 100 characters`);
    }
    if (!/^[a-zA-Z0-9_.#\s]+$/.test(trimmed)) {
      throw new ValidationError(`${fieldName} contains invalid characters`);
    }
    return trimmed;
  },
```

- [ ] **Step 4: Eseguire i test per verificare che passino**

Run: `npm test -- validation.test.js`
Expected: PASS (tutti i nuovi `describe` verdi, nessuna regressione sugli esistenti).

- [ ] **Step 5: Commit**

```bash
git add src/utils/validation.js tests/validation.test.js
git commit -m "feat: add orderDirection/boolean/searchField validators for search params"
```

---

### Task 2: Cablaggio parametri in `search-notes.js` e schema in `index.js`

**Files:**
- Modify: `src/tools/search-notes.js:5-20` (blocco validazione + costruzione `URLSearchParams`) e il blocco `searchData` (righe ~30-49)
- Modify: `src/index.js:107-125` (`inputSchema` del tool `search_notes`)
- Test: `tests/search-notes.test.js`

**Interfaces:**
- Consumes: `validators.orderDirection`, `validators.boolean`, `validators.searchField`, `validators.noteId` (da Task 1 e già esistenti).
- Produces: `search_notes` accetta gli argomenti opzionali `ancestorNoteId`, `ancestorDepth`, `orderBy`, `orderDirection`, `fastSearch`, `includeArchivedNotes`. Quando presenti, compaiono come chiavi nella query string ETAPI e in un oggetto `filters` dentro `searchData`.

- [ ] **Step 1: Scrivere i test che falliscono**

In `tests/search-notes.test.js`, dentro `describe('successful searches', ...)`, aggiungere:

```javascript
    test('appends optional ETAPI params only when provided', async () => {
      mockTriliumClient.get.mockResolvedValue({ results: [] });

      await searchNotes(mockTriliumClient, {
        query: 'diario',
        limit: 5,
        ancestorNoteId: 'abc123',
        orderBy: 'dateModified',
        orderDirection: 'desc',
        fastSearch: true,
        includeArchivedNotes: false,
        ancestorDepth: 'eq1'
      });

      const calledUrl = mockTriliumClient.get.mock.calls[0][0];
      expect(calledUrl).toContain('search=diario');
      expect(calledUrl).toContain('limit=5');
      expect(calledUrl).toContain('ancestorNoteId=abc123');
      expect(calledUrl).toContain('ancestorDepth=eq1');
      expect(calledUrl).toContain('orderBy=dateModified');
      expect(calledUrl).toContain('orderDirection=desc');
      expect(calledUrl).toContain('fastSearch=true');
      expect(calledUrl).toContain('includeArchivedNotes=false');
    });

    test('does not append optional params when absent (backward compatible)', async () => {
      mockTriliumClient.get.mockResolvedValue({ results: [] });

      await searchNotes(mockTriliumClient, { query: 'plain', limit: 10 });

      expect(mockTriliumClient.get).toHaveBeenCalledWith('notes?search=plain&limit=10');
    });
```

E dentro un `describe('validation errors', ...)` (crearlo se non c'è):

```javascript
    test('rejects invalid orderDirection', async () => {
      const result = await searchNotes(mockTriliumClient, {
        query: 'x', orderDirection: 'upside-down'
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Validation error/);
      expect(mockTriliumClient.get).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Eseguire i test per verificare che falliscano**

Run: `npm test -- search-notes.test.js`
Expected: FAIL — l'URL non contiene i nuovi parametri; il test di `orderDirection` invalido non produce ancora `isError`.

- [ ] **Step 3: Implementare il cablaggio in `search-notes.js`**

Sostituire il blocco iniziale (righe 8-20, da `const query = ...` fino alla `const response = ...` esclusa) con:

```javascript
    // Validate inputs
    const query = validators.searchQuery(args.query);
    const limit = validators.limit(args.limit);
    const ancestorNoteId = args.ancestorNoteId != null ? validators.noteId(args.ancestorNoteId) : undefined;
    const ancestorDepth = validators.searchField(args.ancestorDepth, 'ancestorDepth');
    const orderBy = validators.searchField(args.orderBy, 'orderBy');
    const orderDirection = validators.orderDirection(args.orderDirection);
    const fastSearch = validators.boolean(args.fastSearch, 'fastSearch');
    const includeArchivedNotes = validators.boolean(args.includeArchivedNotes, 'includeArchivedNotes');

    logger.debug(`Searching notes: query="${query}", limit=${limit}`);

    // Prepare search parameters for TriliumNext API
    const params = new URLSearchParams({
      search: query,
      limit: limit.toString(),
    });
    const filters = {};
    if (ancestorNoteId !== undefined) { params.append('ancestorNoteId', ancestorNoteId); filters.ancestorNoteId = ancestorNoteId; }
    if (ancestorDepth !== undefined) { params.append('ancestorDepth', ancestorDepth); filters.ancestorDepth = ancestorDepth; }
    if (orderBy !== undefined) { params.append('orderBy', orderBy); filters.orderBy = orderBy; }
    if (orderDirection !== undefined) { params.append('orderDirection', orderDirection); filters.orderDirection = orderDirection; }
    if (fastSearch !== undefined) { params.append('fastSearch', String(fastSearch)); filters.fastSearch = fastSearch; }
    if (includeArchivedNotes !== undefined) { params.append('includeArchivedNotes', String(includeArchivedNotes)); filters.includeArchivedNotes = includeArchivedNotes; }

    // Search notes via TriliumNext API
    const response = await triliumClient.get(`notes?${params}`);
```

Poi nel `searchData` (oggetto con `query`, `limit`, `totalResults`, ...), aggiungere il campo `filters` solo se non vuoto. Modificare la costruzione così, subito dopo la riga `hasMore: ...`:

```javascript
      timestamp: new Date().toISOString(),
      ...(Object.keys(filters).length > 0 && { filters }),
      notes: results.map(note => ({
```

- [ ] **Step 4: Estendere l'`inputSchema` in `index.js`**

In `src/index.js`, nel tool `search_notes` (righe 111-124), dentro `properties`, dopo `limit`, aggiungere:

```javascript
                ancestorNoteId: {
                  type: 'string',
                  description: 'Limit the search to the subtree of this note ID (e.g. only within Second Brain).',
                },
                ancestorDepth: {
                  type: 'string',
                  description: 'Depth relative to the ancestor, Trilium syntax (e.g. "eq1", "lt3", "gt2").',
                },
                orderBy: {
                  type: 'string',
                  description: 'Field to sort by (e.g. dateModified, dateCreated, title, relevancy).',
                },
                orderDirection: {
                  type: 'string',
                  enum: ['asc', 'desc'],
                  description: 'Sort direction; requires orderBy.',
                },
                fastSearch: {
                  type: 'boolean',
                  description: 'Faster search over title/attributes, skipping note content fulltext.',
                },
                includeArchivedNotes: {
                  type: 'boolean',
                  description: 'Include archived notes in the results.',
                },
```

- [ ] **Step 5: Eseguire i test per verificare che passino**

Run: `npm test -- search-notes.test.js`
Expected: PASS (nuovi test verdi, i test esistenti che asseriscono `notes?search=...&limit=10` restano verdi perché senza parametri opzionali l'URL è invariato).

- [ ] **Step 6: Eseguire l'intera suite**

Run: `npm test`
Expected: PASS, nessuna regressione, coverage non inferiore a prima.

- [ ] **Step 7: Commit**

```bash
git add src/tools/search-notes.js src/index.js tests/search-notes.test.js
git commit -m "feat: expose ETAPI ancestor/order/fastSearch/archived params in search_notes"
```

---

### Task 3: Correzione documentazione

**Files:**
- Modify: `README.md` (sezione "Future Enhancements" ~riga 271-288; changelog ~riga 290; documentazione parametri di `search_notes`)
- Modify: `CLAUDE.md` (sezione "Search Query Support")

**Interfaces:** nessuna (solo documentazione).

- [ ] **Step 1: Correggere "Future Enhancements" nel README**

Nella sezione `### 🚀 Planned Features`:
- Marcare come già disponibili: **Advanced search features** (`(done — la query è passthrough alla sintassi ETAPI di Trilium)`) e **Note relationship management** (`(done — create_attribute gestisce type: relation)`).
- Rimuovere le voci non sensate per un MCP stateless: **Real-time updates (WebSocket)**, **Performance optimizations (caching/streaming)**.
- In `### 💡 Potential Integrations`, rimuovere **Backup and restore** (già nativo in Trilium) e **Analytics and insights**. Lasciare Export e Template system come idee aperte.

- [ ] **Step 2: Documentare i nuovi parametri di `search_notes` nel README**

Nella sezione che descrive i tool / la ricerca, aggiungere una sottosezione:

```markdown
#### search_notes — optional parameters

Beyond `query` and `limit`, `search_notes` exposes the native ETAPI filters:

- `ancestorNoteId` — restrict the search to a note's subtree.
- `ancestorDepth` — depth relative to the ancestor (`eq1`, `lt3`, `gt2`).
- `orderBy` — sort field (`dateModified`, `dateCreated`, `title`, `relevancy`).
- `orderDirection` — `asc` or `desc`.
- `fastSearch` — search title/attributes only (skips content fulltext).
- `includeArchivedNotes` — include archived notes.

All are optional; when omitted the request is identical to before.
```

- [ ] **Step 3: Aggiungere la voce di changelog**

Sotto `## Changelog`, prima di `### v0.2.5`, aggiungere:

```markdown
### v0.2.6
- Extend search_notes with native ETAPI parameters: ancestorNoteId, ancestorDepth, orderBy, orderDirection, fastSearch, includeArchivedNotes (all optional, backward compatible).
```

Allineare `version` in `package.json` a `0.2.6`.

- [ ] **Step 4: Aggiornare la sezione "Search Query Support" in `CLAUDE.md`**

Aggiungere, dopo i "Date filters", una riga:

```markdown
- Native ETAPI params (optional): ancestorNoteId, ancestorDepth, orderBy, orderDirection, fastSearch, includeArchivedNotes — passed through directly to GET /notes.
```

E nel conteggio tool/descrizione, se cita il comportamento di `search_notes`, notare che ora accetta i filtri nativi.

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md package.json
git commit -m "docs: fix Future Enhancements, document new search_notes params, bump to 0.2.6"
```

---

## Self-Review

**Spec coverage:** i sei parametri dello spec → Task 1 (validator) + Task 2 (cablaggio+schema). Retro-compatibilità → test dedicato in Task 2 Step 1. Fix documentazione → Task 3. Opzione A → `searchField` in Task 1. Non-obiettivi (excerpt/bulk) non compaiono: corretto. Tutte le sezioni dello spec hanno un task.

**Placeholder scan:** nessun TBD/TODO; ogni step di codice mostra il codice reale.

**Type consistency:** `orderDirection`/`boolean`/`searchField`/`noteId` usati in Task 2 corrispondono alle firme definite in Task 1. Il campo `filters` è coerente tra `search-notes.js` e i test.

---

## Appendice — Funzionalità future ad alto ROI per il caso d'uso reale

Ragionamento onesto su cosa varrebbe la pena *dopo* questo giro, misurato sul workflow reale (Second Brain Trilium, Basic Memories, note per data/attributi), non sulla wishlist del README.

1. **Excerpt/contenuto opzionale nei risultati di ricerca** (già scartato da questo giro, ma è il candidato #1). Oggi ogni ricerca utile è `search` + N × `get_note`: round-trip e token sprecati a ogni sessione. Un flag `includeContent`/`excerpt` che fa fetch del contenuto per i primi K risultati eliminerebbe il pattern. Costo medio, ROI alto e quotidiano. Da valutare subito dopo questo piano.

2. **`get_notes` batch (lettura multipla in una call)**. Complementare al punto 1: quando la ricerca restituisce 5 noteId rilevanti, leggerli in una sola richiesta invece di 5. Riduce latenza e round-trip nelle sessioni di recall. Costo basso.

3. **Tool `append_to_note` / update incrementale**. Il workflow `daily` e le Basic Memories *appendono* bullet a note esistenti; oggi significa `get_note` → concatenare → `update_note`, con rischio di race e di sovrascrittura. Un append atomico lato tool sarebbe più sicuro e più corto. Costo basso-medio, ROI alto per il diario.

4. **Bulk tagging / attributi su più note**. Valore reale solo durante migrazioni o riorganizzazioni; la grossa migrazione (356 note) è finita. Utile come strumento generico (obiettivo open source), non urgente per l'uso corrente. Da tenere in backlog, non prioritario.

Da scartare definitivamente (già argomentato): WebSocket/real-time, caching/streaming, analytics, backup/restore — o senza senso in un MCP stateless o ridondanti con Trilium nativo.

**Ordine suggerito dei prossimi giri:** (1) excerpt nei risultati → (3) append atomico → (2) get batch. Sono i tre che toccano ogni sessione di lavoro; il resto è opzionale.
