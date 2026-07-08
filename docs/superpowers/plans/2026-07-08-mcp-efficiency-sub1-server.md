# Efficienza MCP Sub-1 (Server) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ridurre chiamate e token dei workflow aggiungendo al server MCP una resource di alias `nome→noteId`, un tool `append_to_note`, e snellendo il payload di `search-notes`.

**Architecture:** Tre unità indipendenti. La resource legge un file JSON esterno (nessun accesso al vault). `append_to_note` compone due chiamate ETAPI già usate altrove (`GET content` + `putRaw`) riusando `markdownToHtml`. Lo snellimento tocca solo la proiezione dei risultati di ricerca.

**Tech Stack:** Node.js 22 (ES modules), Jest, `@modelcontextprotocol/sdk`, `fs` per la lettura del file alias.

## Global Constraints

- Node.js ≥18 (gira su v22), ES modules (`"type": "module"`).
- Default generico: senza `TRILIUM_ALIASES_FILE` la resource restituisce mappa vuota; il server non deve cambiare comportamento né fallire l'avvio.
- `append_to_note` NON è atomico (read-modify-write): va documentato nel tool description e non presentato come transazionale.
- Snellimento `search-notes`: rimuovere SOLO `dateCreated` e `isProtected`. Mantenere `noteId`, `title`, `type`, `dateModified`, `parentNoteIds`, e i condizionali `mime`/`attributes`/`contentLength`.
- Comando test: `npm test`. Non regredire i test esistenti (~198).
- Base branch: `feat/mcp-efficiency` (poggia sulla PR #1). Da ribasare su `main` dopo il merge della PR #1.

---

### Task 1: Resource `trilium://aliases`

**Files:**
- Create: `src/resources/aliases.js`
- Modify: `src/index.js` (import; array in `ListResourcesRequestSchema` ~riga 353; branch in `ReadResourceRequestSchema` ~riga 369; nuovo metodo accanto a `getRecentNotesResource` ~riga 436)
- Test: `tests/aliases-resource.test.js`

**Interfaces:**
- Produces: `getAliasesResource(filePath)` → `{ contents: [{ uri: 'trilium://aliases', mimeType: 'application/json', text: <json> }] }`. Il JSON ha forma `{ aliases: {<name>: <noteId>}, count, description }`. `filePath` assente/illeggibile/JSON invalido → `aliases: {}`.

- [ ] **Step 1: Scrivere il test che fallisce**

Create `tests/aliases-resource.test.js`:

```javascript
import { jest } from '@jest/globals';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getAliasesResource } from '../src/resources/aliases.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

function parse(res) {
  return JSON.parse(res.contents[0].text);
}

describe('getAliasesResource', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'aliases-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  test('reads a valid JSON alias file', () => {
    const f = join(dir, 'a.json');
    writeFileSync(f, JSON.stringify({ diario: 'JOwA3qQfctr3', convenzioni: 'msYV2ZwJq50O' }));
    const res = getAliasesResource(f);
    expect(res.contents[0].uri).toBe('trilium://aliases');
    const data = parse(res);
    expect(data.aliases).toEqual({ diario: 'JOwA3qQfctr3', convenzioni: 'msYV2ZwJq50O' });
    expect(data.count).toBe(2);
  });

  test('returns empty map when path is undefined', () => {
    const data = parse(getAliasesResource(undefined));
    expect(data.aliases).toEqual({});
    expect(data.count).toBe(0);
  });

  test('returns empty map when file does not exist', () => {
    const data = parse(getAliasesResource(join(dir, 'missing.json')));
    expect(data.aliases).toEqual({});
  });

  test('returns empty map on malformed JSON', () => {
    const f = join(dir, 'bad.json');
    writeFileSync(f, '{ not valid json');
    const data = parse(getAliasesResource(f));
    expect(data.aliases).toEqual({});
  });
});
```

- [ ] **Step 2: Eseguire il test per verificare che fallisca**

Run: `npm test -- aliases-resource.test.js`
Expected: FAIL — `Cannot find module '../src/resources/aliases.js'`.

- [ ] **Step 3: Implementare la resource**

Create `src/resources/aliases.js`:

```javascript
import { readFileSync } from 'fs';
import { logger } from '../utils/logger.js';

const URI = 'trilium://aliases';

export function getAliasesResource(filePath) {
  let aliases = {};
  if (filePath) {
    try {
      const raw = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        aliases = parsed;
      } else {
        logger.warn(`Aliases file ${filePath} is not a JSON object; ignoring`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn(`Could not read aliases file ${filePath}: ${error.message}`);
      }
    }
  }

  const data = {
    aliases,
    count: Object.keys(aliases).length,
    description: 'Configured name→noteId aliases (from TRILIUM_ALIASES_FILE)',
  };

  return {
    contents: [
      { uri: URI, mimeType: 'application/json', text: JSON.stringify(data, null, 2) },
    ],
  };
}
```

- [ ] **Step 4: Eseguire il test per verificare che passi**

Run: `npm test -- aliases-resource.test.js`
Expected: PASS.

- [ ] **Step 5: Registrare la resource in `index.js`**

Aggiungere l'import dopo la riga `import { getRecentNotesResource } from './resources/recent-notes.js';` (~riga 32):

```javascript
import { getAliasesResource } from './resources/aliases.js';
```

Nel handler `ListResourcesRequestSchema` (~riga 353), dentro l'array `resources`, dopo l'oggetto di `trilium://recent-notes`, aggiungere:

```javascript
          {
            uri: 'trilium://aliases',
            name: 'Note aliases',
            description: 'Configured name→noteId aliases',
            mimeType: 'application/json',
          },
```

Nel handler `ReadResourceRequestSchema` (~riga 369), dopo il branch `if (uri === 'trilium://recent-notes') {...}`, aggiungere:

```javascript
      if (uri === 'trilium://aliases') {
        return this.getAliasesResource();
      }
```

Accanto al metodo `getRecentNotesResource()` (~riga 436), aggiungere:

```javascript
  getAliasesResource() {
    return getAliasesResource(process.env.TRILIUM_ALIASES_FILE);
  }
```

- [ ] **Step 6: Eseguire l'intera suite**

Run: `npm test`
Expected: PASS, nessuna regressione.

- [ ] **Step 7: Commit**

```bash
git add src/resources/aliases.js src/index.js tests/aliases-resource.test.js
git commit -m "feat: add trilium://aliases resource reading name→noteId map from JSON file"
```

---

### Task 2: Tool `append_to_note`

**Files:**
- Create: `src/tools/append-note.js`
- Modify: `src/index.js` (import ~riga 31; schema nel `ListToolsRequestSchema` ~riga 62; case nel `CallToolRequestSchema` ~riga 337; metodo accanto a `updateNote` ~riga 400)
- Test: `tests/append-note.test.js`

**Interfaces:**
- Consumes: `validators.noteId`, `validators.content`, `validators.contentFormat` (esistenti); `markdownToHtml`, `shouldConvertMarkdown` (da `src/utils/md-to-html.js`); `triliumClient.get`, `triliumClient.putRaw`.
- Produces: `appendNote(triliumClient, args)` → risposta MCP standard (`content: [summary, json]`, `isError` sui fallimenti). `args`: `{ noteId, content, format? }`.

- [ ] **Step 1: Scrivere i test che falliscono**

Create `tests/append-note.test.js`:

```javascript
import { jest } from '@jest/globals';
import { appendNote } from '../src/tools/append-note.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

describe('appendNote', () => {
  let client;
  beforeEach(() => {
    client = {
      get: jest.fn((url) =>
        url.endsWith('/content')
          ? Promise.resolve('<p>existing</p>')
          : Promise.resolve({ noteId: 'n1', type: 'text', mime: 'text/html', title: 'T' })),
      putRaw: jest.fn(() => Promise.resolve()),
    };
    jest.clearAllMocks();
  });

  test('appends markdown converted to HTML onto existing content', async () => {
    const res = await appendNote(client, { noteId: 'n1', content: 'nuova riga' });
    const written = client.putRaw.mock.calls[0];
    expect(written[0]).toBe('notes/n1/content');
    expect(written[1]).toContain('<p>existing</p>');
    expect(written[1]).toContain('nuova riga');
    expect(written[1].startsWith('<p>existing</p>')).toBe(true);
    expect(res.isError).toBeUndefined();
  });

  test('handles empty existing content (first append)', async () => {
    client.get = jest.fn((url) =>
      url.endsWith('/content')
        ? Promise.resolve('')
        : Promise.resolve({ noteId: 'n1', type: 'text', mime: 'text/html' }));
    await appendNote(client, { noteId: 'n1', content: 'prima' });
    expect(client.putRaw.mock.calls[0][1]).toContain('prima');
  });

  test('does not convert when format is raw', async () => {
    await appendNote(client, { noteId: 'n1', content: '**x**', format: 'raw' });
    expect(client.putRaw.mock.calls[0][1]).toContain('**x**');
  });

  test('returns 404 error when note does not exist', async () => {
    client.get = jest.fn(() => Promise.reject(new TriliumAPIError('Note not found', 404)));
    const res = await appendNote(client, { noteId: 'ghost', content: 'x' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not found/i);
    expect(client.putRaw).not.toHaveBeenCalled();
  });

  test('rejects invalid content with ValidationError', async () => {
    const res = await appendNote(client, { noteId: 'n1', content: null });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Validation error/);
  });
});
```

- [ ] **Step 2: Eseguire i test per verificare che falliscano**

Run: `npm test -- append-note.test.js`
Expected: FAIL — `Cannot find module '../src/tools/append-note.js'`.

- [ ] **Step 3: Implementare il tool**

Create `src/tools/append-note.js`:

```javascript
import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';
import { markdownToHtml, shouldConvertMarkdown } from '../utils/md-to-html.js';

export async function appendNote(triliumClient, args) {
  try {
    const noteId = validators.noteId(args.noteId);
    const rawContent = validators.content(args.content);
    const format = validators.contentFormat(args.format);

    logger.debug(`Appending to note: noteId="${noteId}" format=${format}`);

    const note = await triliumClient.get(`notes/${noteId}`);
    if (!note) throw new TriliumAPIError('Note not found', 404);

    const existing = await triliumClient.get(`notes/${noteId}/content`);
    const base = typeof existing === 'string' ? existing : '';

    let addition = rawContent;
    let converted = false;
    if (format === 'markdown' && shouldConvertMarkdown({ type: note.type, mime: note.mime })) {
      addition = markdownToHtml(rawContent, { type: note.type, mime: note.mime });
      converted = addition !== rawContent;
    }

    const newContent = base + addition;
    await triliumClient.putRaw(`notes/${noteId}/content`, newContent);
    logger.info(`Appended to note ${noteId} (converted=${converted}, +${addition.length} chars)`);

    const payload = {
      operation: 'append_to_note',
      request: { noteId, format, converted, appendedLength: addition.length },
      result: { noteId, title: note.title || 'Untitled', storedLength: newContent.length },
    };
    const summary = `Appended to "${note.title || 'Untitled'}" (ID: ${noteId}${converted ? ', md→html' : ''})`;
    return {
      content: [
        { type: 'text', text: summary },
        { type: 'text', text: JSON.stringify(payload) },
      ],
    };
  } catch (error) {
    logger.error(`Failed to append to note: ${error.message}`);
    const errorPayload = {
      operation: 'append_to_note',
      request: { noteId: args.noteId, format: args.format },
      error: {
        type: error.constructor.name,
        message: error.message,
        ...(error instanceof TriliumAPIError && { status: error.status }),
        ...(error instanceof TriliumAPIError && error.details && { details: error.details }),
      },
    };
    let prefix;
    if (error instanceof ValidationError) prefix = `Validation error: ${error.message}`;
    else if (error instanceof TriliumAPIError) {
      prefix = error.status === 404 ? `Note not found: ${args.noteId}` : `TriliumNext API error: ${error.message}`;
    } else prefix = `Failed to append to note: ${error.message}`;
    return {
      content: [
        { type: 'text', text: prefix },
        { type: 'text', text: JSON.stringify(errorPayload) },
      ],
      isError: true,
    };
  }
}
```

- [ ] **Step 4: Eseguire i test per verificare che passino**

Run: `npm test -- append-note.test.js`
Expected: PASS.

- [ ] **Step 5: Registrare il tool in `index.js`**

Import dopo `import { updateNoteTitle } from './tools/update-note-title.js';` (~riga 31):

```javascript
import { appendNote } from './tools/append-note.js';
```

Nel `ListToolsRequestSchema` (~riga 62), aggiungere all'array dei tool (dopo `update_note` o in coda) l'oggetto schema:

```javascript
          {
            name: 'append_to_note',
            description: 'Append content to the end of an existing note without overwriting. Reads current content, appends, and writes back. NOTE: not atomic (read-modify-write) — concurrent appends to the same note can lose data. Content is markdown by default and converted to HTML server-side.',
            inputSchema: {
              type: 'object',
              properties: {
                noteId: { type: 'string', description: 'ID of the note to append to' },
                content: { type: 'string', description: 'Content to append (max 1MB). Markdown by default.' },
                format: {
                  type: 'string',
                  enum: ['markdown', 'html', 'raw'],
                  default: 'markdown',
                  description: 'markdown (default, converted to HTML), html, or raw (no conversion).',
                },
              },
              required: ['noteId', 'content'],
            },
          },
```

Nel `CallToolRequestSchema` switch, dopo `case 'update_note_title':` (~riga 337-338):

```javascript
          case 'append_to_note':
            return await this.appendNote(request.params.arguments);
```

Metodo accanto a `updateNote()` (~riga 400):

```javascript
  async appendNote(args) {
    return await appendNote(this.triliumClient, args);
  }
```

- [ ] **Step 6: Eseguire l'intera suite**

Run: `npm test`
Expected: PASS, nessuna regressione.

- [ ] **Step 7: Commit**

```bash
git add src/tools/append-note.js src/index.js tests/append-note.test.js
git commit -m "feat: add append_to_note tool (read-modify-write, non-atomic, md→html)"
```

---

### Task 3: Snellimento payload `search-notes`

**Files:**
- Modify: `src/tools/search-notes.js` (blocco `notes: results.map(...)`)
- Test: `tests/search-notes.test.js`

**Interfaces:**
- Produces: ogni nota nei risultati di `search_notes` contiene `noteId`, `title`, `type`, `dateModified`, `parentNoteIds` (+ condizionali `mime`/`attributes`/`contentLength`), e NON contiene più `dateCreated` né `isProtected`.

- [ ] **Step 1: Scrivere il test che fallisce**

In `tests/search-notes.test.js`, dentro `describe('successful searches', ...)`, aggiungere:

```javascript
    test('projection omits dateCreated and isProtected but keeps dateModified/parentNoteIds', async () => {
      mockTriliumClient.get.mockResolvedValue({
        results: [{
          noteId: 'n1', title: 'T', type: 'text',
          dateCreated: '2024-01-01', dateModified: '2024-02-02',
          parentNoteIds: ['p1'], isProtected: false,
        }],
      });
      const res = await searchNotes(mockTriliumClient, { query: 'x', limit: 5 });
      const data = JSON.parse(res.content[1].text);
      const note = data.notes[0];
      expect(note.noteId).toBe('n1');
      expect(note.title).toBe('T');
      expect(note.type).toBe('text');
      expect(note.dateModified).toBe('2024-02-02');
      expect(note.parentNoteIds).toEqual(['p1']);
      expect(note).not.toHaveProperty('dateCreated');
      expect(note).not.toHaveProperty('isProtected');
    });
```

- [ ] **Step 2: Eseguire il test per verificare che fallisca**

Run: `npm test -- search-notes.test.js`
Expected: FAIL — il risultato contiene ancora `dateCreated`/`isProtected`.

- [ ] **Step 3: Modificare la proiezione**

In `src/tools/search-notes.js`, nel blocco `notes: results.map(note => ({ ... }))`, sostituire l'oggetto proiettato con:

```javascript
      notes: results.map(note => ({
        noteId: note.noteId,
        title: note.title || 'Untitled',
        type: note.type || 'text',
        dateModified: note.dateModified,
        parentNoteIds: note.parentNoteIds || [],
        ...(note.mime && { mime: note.mime }),
        ...(note.attributes && { attributes: note.attributes }),
        ...(note.contentLength && { contentLength: note.contentLength })
      }))
```

(Rimossi `dateCreated` e `isProtected`; il resto invariato.)

- [ ] **Step 4: Eseguire il test per verificare che passi**

Run: `npm test -- search-notes.test.js`
Expected: PASS. I test esistenti che non asseriscono su `dateCreated`/`isProtected` restano verdi.

- [ ] **Step 5: Eseguire l'intera suite**

Run: `npm test`
Expected: PASS, nessuna regressione.

- [ ] **Step 6: Commit**

```bash
git add src/tools/search-notes.js tests/search-notes.test.js
git commit -m "perf: trim search_notes payload (drop dateCreated/isProtected)"
```

---

## Self-Review

**Spec coverage:** Componente A (resource alias) → Task 1. Componente B (`append_to_note`) → Task 2. Componente C (snellimento search) → Task 3. Non-atomicità documentata nel description del tool (Task 2 Step 5) e nella spec. Default generico (mappa vuota) coperto dai test in Task 1. Nessun componente della spec resta senza task; i non-obiettivi (get_notes/get_day_note, Sub-2) non compaiono.

**Placeholder scan:** nessun TBD/TODO; ogni step di codice mostra il codice reale.

**Type consistency:** `getAliasesResource(filePath)` (Task 1) è invocato con `process.env.TRILIUM_ALIASES_FILE` nel metodo di `index.js`. `appendNote(triliumClient, args)` (Task 2) usa `validators`/`markdownToHtml`/`putRaw` con le firme reali verificate in `update-note.js`. La proiezione di Task 3 mantiene i nomi dei campi condizionali già presenti in `search-notes.js`.
