# mcp-trilium: tree navigation & attributes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estendere il MCP server `mcp-trilium` con 7 nuovi tool (4 per attributi, 2 per navigazione albero, 1 per delete) seguendo il pattern esistente, mantenendo coverage ≥90% e fornendo un MCP usabile come "second brain" da Claude Code.

**Architecture:** Stessa struttura del repo esistente. Ogni tool è una funzione `(triliumClient, args)` in `src/tools/<nome>.js`, registrata in tre punti di `src/index.js` (schema ListTools, switch CallTool, metodo wrapper sulla classe). Validatori nuovi in `src/utils/validation.js`. Test Jest con mock client in `tests/<nome>.test.js`. ETAPI invocato tramite il `TriliumClient` esistente — no modifiche al client.

**Tech Stack:** Node.js 18+, ESM modules, MCP SDK 1.0, axios, Jest, Babel.

**Spec:** `docs/superpowers/specs/2026-05-22-tree-and-attributes-design.md`

---

## File structure

**Da creare** (7 tool + 7 test):
- `src/tools/list-attributes.js`
- `src/tools/create-attribute.js`
- `src/tools/update-attribute.js`
- `src/tools/delete-attribute.js`
- `src/tools/list-children.js`
- `src/tools/move-note.js`
- `src/tools/delete-note.js`
- `tests/list-attributes.test.js`
- `tests/create-attribute.test.js`
- `tests/update-attribute.test.js`
- `tests/delete-attribute.test.js`
- `tests/list-children.test.js`
- `tests/move-note.test.js`
- `tests/delete-note.test.js`

**Da modificare**:
- `src/index.js` — registrare 7 nuovi tool
- `src/utils/validation.js` — aggiungere 4 validators (`attributeId`, `attributeType`, `attributeName`, `branchId`)
- `tests/create-note.test.js`, `tests/get-note.test.js`, `tests/update-note.test.js`, `tests/search-notes.test.js` — aggiornare 9 assertion su `type` da `'application/json'` a `'text'` (allineamento con modifiche pendenti)
- `package.json` — identità + version bump finale
- `README.md`, `CLAUDE.md` — documentare nuovi tool

---

## Task 0: Housekeeping pre-implementazione

**Files:**
- Modify: `tests/create-note.test.js`, `tests/get-note.test.js`, `tests/update-note.test.js`, `tests/search-notes.test.js`
- Modify: `package.json`

- [ ] **Step 1: Verifica stato git**

Run: `git -C /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium status --short`
Expected: 4 file modificati pendenti (`src/tools/*.js`) + script untracked. Niente di critico.

- [ ] **Step 2: Aggiorna i test esistenti per allinearli alle modifiche pendenti**

Per ognuno dei 9 punti elencati sopra (`grep -n "application/json" tests/*.test.js`), sostituire `expect(result.content[1].type).toBe('application/json')` con `expect(result.content[1].type).toBe('text')`.

Run: `sed -i "s/\.toBe('application\/json')/.toBe('text')/g" /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium/tests/*.test.js`

- [ ] **Step 3: Verifica che i test passino con le modifiche pendenti**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npm test 2>&1 | tail -20`
Expected: tutti i test verdi (94 test esistenti).

- [ ] **Step 4: Aggiorna identità del package**

Modificare `package.json`:
- `"name": "mcp-trilium"` (rimuovi il prefisso `next`, ora è il tuo fork)
- `"repository.url"`: chiedi all'utente l'URL del suo fork GitHub (NON inventarlo). Se non disponibile ora, lascia il placeholder ma annota in TODO.
- `"bugs.url"`: stesso del repo.
- `"author"`: chiedi all'utente.

- [ ] **Step 5: Commit baseline housekeeping**

```bash
cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium
git add src/tools/create-note.js src/tools/get-note.js src/tools/search-notes.js src/tools/update-note.js tests/*.test.js package.json
git commit -m "chore: align MCP response mime type to 'text' and update package identity

- Tool responses now use 'text' mime (MCP spec compliant) instead of 'application/json'
- Update tests accordingly
- Update package.json with fork identity

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 1: Validators nuovi

**Files:**
- Modify: `src/utils/validation.js`
- Test: `tests/validation.test.js` (nuovo file)

- [ ] **Step 1: Scrivi i test falliti per i nuovi validators**

Crea `tests/validation.test.js`:

```javascript
import { jest } from '@jest/globals';
import { validators, ValidationError } from '../src/utils/validation.js';

describe('validators.attributeId', () => {
  test('returns trimmed string for valid id', () => {
    expect(validators.attributeId('attr123')).toBe('attr123');
    expect(validators.attributeId('  attr123  ')).toBe('attr123');
  });

  test('throws for empty or non-string', () => {
    expect(() => validators.attributeId('')).toThrow(ValidationError);
    expect(() => validators.attributeId(null)).toThrow(ValidationError);
    expect(() => validators.attributeId(123)).toThrow(ValidationError);
  });
});

describe('validators.attributeType', () => {
  test('accepts label and relation', () => {
    expect(validators.attributeType('label')).toBe('label');
    expect(validators.attributeType('relation')).toBe('relation');
  });

  test('throws for other values', () => {
    expect(() => validators.attributeType('foo')).toThrow(ValidationError);
    expect(() => validators.attributeType(null)).toThrow(ValidationError);
    expect(() => validators.attributeType('')).toThrow(ValidationError);
  });
});

describe('validators.attributeName', () => {
  test('accepts alphanumeric with underscore', () => {
    expect(validators.attributeName('myLabel')).toBe('myLabel');
    expect(validators.attributeName('my_label_2')).toBe('my_label_2');
    expect(validators.attributeName('  trim_me  ')).toBe('trim_me');
  });

  test('throws for special chars', () => {
    expect(() => validators.attributeName('my-label')).toThrow(ValidationError);
    expect(() => validators.attributeName('my label')).toThrow(ValidationError);
    expect(() => validators.attributeName('#tag')).toThrow(ValidationError);
    expect(() => validators.attributeName('')).toThrow(ValidationError);
  });
});

describe('validators.branchId', () => {
  test('returns trimmed string for valid id', () => {
    expect(validators.branchId('branch123')).toBe('branch123');
  });

  test('throws for empty or non-string', () => {
    expect(() => validators.branchId('')).toThrow(ValidationError);
    expect(() => validators.branchId(undefined)).toThrow(ValidationError);
  });
});
```

- [ ] **Step 2: Run test, devono fallire**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npx jest tests/validation.test.js 2>&1 | tail -15`
Expected: FAIL su tutti i 4 describe (validators non definiti).

- [ ] **Step 3: Implementa i validators**

Aggiungi in `src/utils/validation.js` PRIMA della chiusura `}` di `export const validators = {`:

```javascript
  attributeId: (id) => {
    if (!id || typeof id !== 'string') {
      throw new ValidationError('Attribute ID must be a non-empty string');
    }
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Attribute ID cannot be empty');
    }
    return trimmed;
  },

  attributeType: (type) => {
    if (type !== 'label' && type !== 'relation') {
      throw new ValidationError("Attribute type must be 'label' or 'relation'");
    }
    return type;
  },

  attributeName: (name) => {
    if (!name || typeof name !== 'string') {
      throw new ValidationError('Attribute name must be a non-empty string');
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Attribute name cannot be empty');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      throw new ValidationError('Attribute name can only contain letters, digits, and underscores');
    }
    return trimmed;
  },

  branchId: (id) => {
    if (!id || typeof id !== 'string') {
      throw new ValidationError('Branch ID must be a non-empty string');
    }
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Branch ID cannot be empty');
    }
    return trimmed;
  },
```

- [ ] **Step 4: Run test, devono passare**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npx jest tests/validation.test.js 2>&1 | tail -10`
Expected: tutti verdi.

- [ ] **Step 5: Run full suite per non-regressione**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npm test 2>&1 | tail -5`
Expected: tutti verdi.

- [ ] **Step 6: Commit**

```bash
git add src/utils/validation.js tests/validation.test.js
git commit -m "feat: add validators for attributeId, attributeType, attributeName, branchId

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Tool `list_attributes`

**Files:**
- Create: `src/tools/list-attributes.js`
- Create: `tests/list-attributes.test.js`
- Modify: `src/index.js` (registrazione tool)

- [ ] **Step 1: Scrivi test falliti**

Crea `tests/list-attributes.test.js`:

```javascript
import { jest } from '@jest/globals';
import { listAttributes } from '../src/tools/list-attributes.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

describe('listAttributes', () => {
  let mockClient;

  const mockAttributes = [
    { attributeId: 'a1', noteId: 'n1', type: 'label', name: 'project', value: 'sinapsy', position: 10 },
    { attributeId: 'a2', noteId: 'n1', type: 'label', name: 'priority', value: 'high', position: 20 },
    { attributeId: 'a3', noteId: 'n1', type: 'relation', name: 'related', value: 'n2', position: 30 }
  ];

  beforeEach(() => {
    mockClient = { get: jest.fn() };
    jest.clearAllMocks();
  });

  test('returns all attributes for a note', async () => {
    mockClient.get.mockResolvedValueOnce(mockAttributes);
    const result = await listAttributes(mockClient, { noteId: 'n1' });
    expect(mockClient.get).toHaveBeenCalledWith('notes/n1/attributes');
    expect(result.content[0].text).toContain('3 attribute');
    const data = JSON.parse(result.content[1].text);
    expect(data.result.attributes).toHaveLength(3);
  });

  test('filters by type when provided', async () => {
    mockClient.get.mockResolvedValueOnce(mockAttributes);
    const result = await listAttributes(mockClient, { noteId: 'n1', type: 'relation' });
    const data = JSON.parse(result.content[1].text);
    expect(data.result.attributes).toHaveLength(1);
    expect(data.result.attributes[0].type).toBe('relation');
  });

  test('validation error on missing noteId', async () => {
    const result = await listAttributes(mockClient, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Validation error');
  });

  test('validation error on invalid type', async () => {
    const result = await listAttributes(mockClient, { noteId: 'n1', type: 'foo' });
    expect(result.isError).toBe(true);
  });

  test('handles 404 from API', async () => {
    mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await listAttributes(mockClient, { noteId: 'missing' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Note not found');
  });

  test('handles generic 500', async () => {
    mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Server error', 500, {}));
    const result = await listAttributes(mockClient, { noteId: 'n1' });
    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, deve fallire**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npx jest tests/list-attributes.test.js 2>&1 | tail -10`
Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implementa il tool**

Crea `src/tools/list-attributes.js`:

```javascript
import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';

export async function listAttributes(triliumClient, args) {
  try {
    const noteId = validators.noteId(args.noteId);
    const type = args.type !== undefined ? validators.attributeType(args.type) : null;

    logger.debug(`Listing attributes for note: ${noteId}${type ? ` (type=${type})` : ''}`);

    const all = await triliumClient.get(`notes/${noteId}/attributes`);
    const attributes = Array.isArray(all) ? all : [];
    const filtered = type ? attributes.filter(a => a.type === type) : attributes;

    const data = {
      operation: 'list_attributes',
      timestamp: new Date().toISOString(),
      request: { noteId, type },
      result: { noteId, count: filtered.length, attributes: filtered }
    };

    return {
      content: [
        { type: 'text', text: `Found ${filtered.length} attribute${filtered.length === 1 ? '' : 's'} on note ${noteId}` },
        { type: 'text', text: JSON.stringify(data, null, 2) }
      ]
    };
  } catch (error) {
    logger.error(`list_attributes failed: ${error.message}`);
    const errorData = {
      operation: 'list_attributes',
      timestamp: new Date().toISOString(),
      request: { noteId: args.noteId, type: args.type },
      error: {
        type: error.constructor.name,
        message: error.message,
        ...(error instanceof TriliumAPIError && { status: error.status, details: error.details })
      }
    };
    if (error instanceof ValidationError) {
      return { content: [{ type: 'text', text: `Validation error: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    if (error instanceof TriliumAPIError && error.status === 404) {
      return { content: [{ type: 'text', text: `Note not found: ${args.noteId}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    return { content: [{ type: 'text', text: `Failed to list attributes: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
  }
}
```

- [ ] **Step 4: Run test, devono passare**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npx jest tests/list-attributes.test.js 2>&1 | tail -10`
Expected: tutti verdi (6 test).

- [ ] **Step 5: Registra il tool in `src/index.js`**

In `src/index.js`:

**5a)** Aggiungi import in cima (dopo riga 19 `import { updateNote } ...`):
```javascript
import { listAttributes } from './tools/list-attributes.js';
```

**5b)** Nella sezione `setupToolHandlers` → `ListToolsRequestSchema` → `tools: [...]`, aggiungi (dopo il blocco `update_note`):
```javascript
          {
            name: 'list_attributes',
            description: 'List all attributes (labels and relations) of a note',
            inputSchema: {
              type: 'object',
              properties: {
                noteId: { type: 'string', description: 'The ID of the note' },
                type: { type: 'string', enum: ['label', 'relation'], description: 'Filter by attribute type (optional)' }
              },
              required: ['noteId']
            }
          },
```

**5c)** Nello switch dentro `CallToolRequestSchema`, aggiungi case (prima di `default:`):
```javascript
          case 'list_attributes':
            return await this.listAttributes(request.params.arguments);
```

**5d)** Aggiungi metodo wrapper sulla classe (dopo `updateNote`):
```javascript
  async listAttributes(args) {
    return await listAttributes(this.triliumClient, args);
  }
```

- [ ] **Step 6: Run full suite per non-regressione**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npm test 2>&1 | tail -5`
Expected: tutti verdi.

- [ ] **Step 7: Commit**

```bash
git add src/tools/list-attributes.js tests/list-attributes.test.js src/index.js
git commit -m "feat: add list_attributes tool

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Tool `create_attribute`

**Files:**
- Create: `src/tools/create-attribute.js`
- Create: `tests/create-attribute.test.js`
- Modify: `src/index.js`

- [ ] **Step 1: Scrivi test falliti**

Crea `tests/create-attribute.test.js`:

```javascript
import { jest } from '@jest/globals';
import { createAttribute } from '../src/tools/create-attribute.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

describe('createAttribute', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = { get: jest.fn(), post: jest.fn() };
    jest.clearAllMocks();
  });

  test('creates a label successfully', async () => {
    const created = { attributeId: 'a99', noteId: 'n1', type: 'label', name: 'project', value: 'sinapsy', position: 10, isInheritable: false };
    mockClient.post.mockResolvedValueOnce(created);
    const result = await createAttribute(mockClient, { noteId: 'n1', type: 'label', name: 'project', value: 'sinapsy' });
    expect(mockClient.post).toHaveBeenCalledWith('attributes', expect.objectContaining({
      noteId: 'n1', type: 'label', name: 'project', value: 'sinapsy'
    }));
    expect(result.content[0].text).toContain('Attribute created');
    expect(result.isError).toBeUndefined();
  });

  test('creates a relation after verifying target exists', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n2', title: 'Target' });
    mockClient.post.mockResolvedValueOnce({ attributeId: 'a100', noteId: 'n1', type: 'relation', name: 'related', value: 'n2' });
    const result = await createAttribute(mockClient, { noteId: 'n1', type: 'relation', name: 'related', value: 'n2' });
    expect(mockClient.get).toHaveBeenCalledWith('notes/n2');
    expect(mockClient.post).toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
  });

  test('rejects relation with non-existent target', async () => {
    mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await createAttribute(mockClient, { noteId: 'n1', type: 'relation', name: 'related', value: 'ghost' });
    expect(mockClient.post).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Relation target');
  });

  test('rejects relation without value', async () => {
    const result = await createAttribute(mockClient, { noteId: 'n1', type: 'relation', name: 'related' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Validation error');
  });

  test('rejects invalid name', async () => {
    const result = await createAttribute(mockClient, { noteId: 'n1', type: 'label', name: 'my-label' });
    expect(result.isError).toBe(true);
  });

  test('rejects invalid type', async () => {
    const result = await createAttribute(mockClient, { noteId: 'n1', type: 'foo', name: 'x' });
    expect(result.isError).toBe(true);
  });

  test('handles 404 on noteId at create time', async () => {
    mockClient.post.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await createAttribute(mockClient, { noteId: 'ghost', type: 'label', name: 'x' });
    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, deve fallire**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npx jest tests/create-attribute.test.js 2>&1 | tail -10`
Expected: FAIL ("Cannot find module").

- [ ] **Step 3: Implementa il tool**

Crea `src/tools/create-attribute.js`:

```javascript
import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';

export async function createAttribute(triliumClient, args) {
  try {
    const noteId = validators.noteId(args.noteId);
    const type = validators.attributeType(args.type);
    const name = validators.attributeName(args.name);
    const value = args.value !== undefined && args.value !== null ? String(args.value) : '';
    const isInheritable = Boolean(args.isInheritable);
    const position = args.position !== undefined ? Number(args.position) : undefined;

    if (type === 'relation') {
      if (!value || value.trim().length === 0) {
        throw new ValidationError("Relations require 'value' to be the target noteId");
      }
      try {
        await triliumClient.get(`notes/${value}`);
      } catch (e) {
        if (e instanceof TriliumAPIError && e.status === 404) {
          throw new ValidationError(`Relation target does not exist: ${value}`);
        }
        throw e;
      }
    }

    const body = { noteId, type, name, value, isInheritable };
    if (position !== undefined) body.position = position;

    logger.debug(`Creating attribute: noteId=${noteId} type=${type} name=${name}`);
    const created = await triliumClient.post('attributes', body);

    const data = {
      operation: 'create_attribute',
      timestamp: new Date().toISOString(),
      request: body,
      result: created
    };
    return {
      content: [
        { type: 'text', text: `Attribute created: ${type} "${name}" on note ${noteId} (ID: ${created?.attributeId || 'unknown'})` },
        { type: 'text', text: JSON.stringify(data, null, 2) }
      ]
    };
  } catch (error) {
    logger.error(`create_attribute failed: ${error.message}`);
    const errorData = {
      operation: 'create_attribute',
      timestamp: new Date().toISOString(),
      request: args,
      error: {
        type: error.constructor.name,
        message: error.message,
        ...(error instanceof TriliumAPIError && { status: error.status, details: error.details })
      }
    };
    if (error instanceof ValidationError) {
      return { content: [{ type: 'text', text: `Validation error: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    if (error instanceof TriliumAPIError && error.status === 404) {
      return { content: [{ type: 'text', text: `Note not found: ${args.noteId}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    return { content: [{ type: 'text', text: `Failed to create attribute: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
  }
}
```

- [ ] **Step 4: Run test**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npx jest tests/create-attribute.test.js 2>&1 | tail -10`
Expected: tutti verdi (7 test).

- [ ] **Step 5: Registra in `src/index.js`**

**5a)** Import:
```javascript
import { createAttribute } from './tools/create-attribute.js';
```

**5b)** Schema tool (dopo `list_attributes`):
```javascript
          {
            name: 'create_attribute',
            description: 'Create a new label or relation on a note',
            inputSchema: {
              type: 'object',
              properties: {
                noteId: { type: 'string', description: 'Note to attach the attribute to' },
                type: { type: 'string', enum: ['label', 'relation'], description: "'label' for #tag, 'relation' for ~link" },
                name: { type: 'string', description: 'Attribute name without # or ~ prefix (a-zA-Z0-9_)' },
                value: { type: 'string', description: "Label value (optional, empty allowed) or target noteId for relations (required)" },
                isInheritable: { type: 'boolean', default: false },
                position: { type: 'number' }
              },
              required: ['noteId', 'type', 'name']
            }
          },
```

**5c)** Switch case:
```javascript
          case 'create_attribute':
            return await this.createAttribute(request.params.arguments);
```

**5d)** Wrapper:
```javascript
  async createAttribute(args) {
    return await createAttribute(this.triliumClient, args);
  }
```

- [ ] **Step 6: Run full suite**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npm test 2>&1 | tail -5`
Expected: tutti verdi.

- [ ] **Step 7: Commit**

```bash
git add src/tools/create-attribute.js tests/create-attribute.test.js src/index.js
git commit -m "feat: add create_attribute tool with relation target validation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Tool `update_attribute`

**Files:**
- Create: `src/tools/update-attribute.js`
- Create: `tests/update-attribute.test.js`
- Modify: `src/index.js`

- [ ] **Step 1: Scrivi test falliti**

Crea `tests/update-attribute.test.js`:

```javascript
import { jest } from '@jest/globals';
import { updateAttribute } from '../src/tools/update-attribute.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

describe('updateAttribute', () => {
  let mockClient;
  beforeEach(() => {
    mockClient = { put: jest.fn() };
    jest.clearAllMocks();
  });

  test('updates value only', async () => {
    mockClient.put.mockResolvedValueOnce({ attributeId: 'a1', value: 'newval', position: 10 });
    const result = await updateAttribute(mockClient, { attributeId: 'a1', value: 'newval' });
    expect(mockClient.put).toHaveBeenCalledWith('attributes/a1', { value: 'newval' });
    expect(result.isError).toBeUndefined();
  });

  test('updates position only', async () => {
    mockClient.put.mockResolvedValueOnce({ attributeId: 'a1', value: 'x', position: 99 });
    const result = await updateAttribute(mockClient, { attributeId: 'a1', position: 99 });
    expect(mockClient.put).toHaveBeenCalledWith('attributes/a1', { position: 99 });
    expect(result.isError).toBeUndefined();
  });

  test('updates both value and position', async () => {
    mockClient.put.mockResolvedValueOnce({});
    const result = await updateAttribute(mockClient, { attributeId: 'a1', value: 'v', position: 5 });
    expect(mockClient.put).toHaveBeenCalledWith('attributes/a1', { value: 'v', position: 5 });
    expect(result.isError).toBeUndefined();
  });

  test('rejects when no fields to update', async () => {
    const result = await updateAttribute(mockClient, { attributeId: 'a1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Validation error');
  });

  test('rejects missing attributeId', async () => {
    const result = await updateAttribute(mockClient, { value: 'x' });
    expect(result.isError).toBe(true);
  });

  test('handles 404', async () => {
    mockClient.put.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await updateAttribute(mockClient, { attributeId: 'ghost', value: 'x' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Attribute not found');
  });
});
```

- [ ] **Step 2: Run test, deve fallire**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npx jest tests/update-attribute.test.js 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Implementa**

Crea `src/tools/update-attribute.js`:

```javascript
import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';

export async function updateAttribute(triliumClient, args) {
  try {
    const attributeId = validators.attributeId(args.attributeId);

    const body = {};
    if (args.value !== undefined && args.value !== null) {
      body.value = String(args.value);
    }
    if (args.position !== undefined && args.position !== null) {
      body.position = Number(args.position);
    }
    if (Object.keys(body).length === 0) {
      throw new ValidationError("At least one of 'value' or 'position' must be provided");
    }

    logger.debug(`Updating attribute ${attributeId} with ${JSON.stringify(body)}`);
    const updated = await triliumClient.put(`attributes/${attributeId}`, body);

    const data = {
      operation: 'update_attribute',
      timestamp: new Date().toISOString(),
      request: { attributeId, ...body },
      result: updated
    };
    return {
      content: [
        { type: 'text', text: `Attribute updated: ${attributeId}` },
        { type: 'text', text: JSON.stringify(data, null, 2) }
      ]
    };
  } catch (error) {
    logger.error(`update_attribute failed: ${error.message}`);
    const errorData = {
      operation: 'update_attribute',
      timestamp: new Date().toISOString(),
      request: args,
      error: {
        type: error.constructor.name,
        message: error.message,
        ...(error instanceof TriliumAPIError && { status: error.status, details: error.details })
      }
    };
    if (error instanceof ValidationError) {
      return { content: [{ type: 'text', text: `Validation error: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    if (error instanceof TriliumAPIError && error.status === 404) {
      return { content: [{ type: 'text', text: `Attribute not found: ${args.attributeId}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    return { content: [{ type: 'text', text: `Failed to update attribute: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
  }
}
```

- [ ] **Step 4: Run test**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npx jest tests/update-attribute.test.js 2>&1 | tail -10`
Expected: tutti verdi (6 test).

- [ ] **Step 5: Registra in `src/index.js`**

**5a)** Import:
```javascript
import { updateAttribute } from './tools/update-attribute.js';
```

**5b)** Schema (dopo `create_attribute`):
```javascript
          {
            name: 'update_attribute',
            description: 'Update value or position of an existing attribute (type and name are immutable)',
            inputSchema: {
              type: 'object',
              properties: {
                attributeId: { type: 'string' },
                value: { type: 'string', description: 'New value (string for labels, target noteId for relations)' },
                position: { type: 'number' }
              },
              required: ['attributeId']
            }
          },
```

**5c)** Switch case:
```javascript
          case 'update_attribute':
            return await this.updateAttribute(request.params.arguments);
```

**5d)** Wrapper:
```javascript
  async updateAttribute(args) {
    return await updateAttribute(this.triliumClient, args);
  }
```

- [ ] **Step 6: Run full suite**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npm test 2>&1 | tail -5`
Expected: tutti verdi.

- [ ] **Step 7: Commit**

```bash
git add src/tools/update-attribute.js tests/update-attribute.test.js src/index.js
git commit -m "feat: add update_attribute tool

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Tool `delete_attribute`

**Files:**
- Create: `src/tools/delete-attribute.js`
- Create: `tests/delete-attribute.test.js`
- Modify: `src/index.js`

- [ ] **Step 1: Scrivi test falliti**

Crea `tests/delete-attribute.test.js`:

```javascript
import { jest } from '@jest/globals';
import { deleteAttribute } from '../src/tools/delete-attribute.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

describe('deleteAttribute', () => {
  let mockClient;
  beforeEach(() => {
    mockClient = { delete: jest.fn() };
    jest.clearAllMocks();
  });

  test('deletes attribute', async () => {
    mockClient.delete.mockResolvedValueOnce({});
    const result = await deleteAttribute(mockClient, { attributeId: 'a1' });
    expect(mockClient.delete).toHaveBeenCalledWith('attributes/a1');
    expect(result.content[0].text).toContain('Attribute deleted');
    expect(result.isError).toBeUndefined();
  });

  test('rejects missing attributeId', async () => {
    const result = await deleteAttribute(mockClient, {});
    expect(result.isError).toBe(true);
  });

  test('handles 404 as success (idempotent)', async () => {
    mockClient.delete.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await deleteAttribute(mockClient, { attributeId: 'ghost' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Attribute not found');
  });
});
```

- [ ] **Step 2: Run test, deve fallire**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npx jest tests/delete-attribute.test.js 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Implementa**

Crea `src/tools/delete-attribute.js`:

```javascript
import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';

export async function deleteAttribute(triliumClient, args) {
  try {
    const attributeId = validators.attributeId(args.attributeId);
    logger.debug(`Deleting attribute ${attributeId}`);
    await triliumClient.delete(`attributes/${attributeId}`);
    const data = {
      operation: 'delete_attribute',
      timestamp: new Date().toISOString(),
      request: { attributeId },
      result: { attributeId, deleted: true }
    };
    return {
      content: [
        { type: 'text', text: `Attribute deleted: ${attributeId}` },
        { type: 'text', text: JSON.stringify(data, null, 2) }
      ]
    };
  } catch (error) {
    logger.error(`delete_attribute failed: ${error.message}`);
    const errorData = {
      operation: 'delete_attribute',
      timestamp: new Date().toISOString(),
      request: args,
      error: {
        type: error.constructor.name,
        message: error.message,
        ...(error instanceof TriliumAPIError && { status: error.status, details: error.details })
      }
    };
    if (error instanceof ValidationError) {
      return { content: [{ type: 'text', text: `Validation error: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    if (error instanceof TriliumAPIError && error.status === 404) {
      return { content: [{ type: 'text', text: `Attribute not found: ${args.attributeId}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    return { content: [{ type: 'text', text: `Failed to delete attribute: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
  }
}
```

- [ ] **Step 4: Run test**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npx jest tests/delete-attribute.test.js 2>&1 | tail -10`
Expected: tutti verdi.

- [ ] **Step 5: Registra in `src/index.js`**

**5a)** Import:
```javascript
import { deleteAttribute } from './tools/delete-attribute.js';
```

**5b)** Schema:
```javascript
          {
            name: 'delete_attribute',
            description: 'Delete an attribute (label or relation) by its ID',
            inputSchema: {
              type: 'object',
              properties: { attributeId: { type: 'string' } },
              required: ['attributeId']
            }
          },
```

**5c)** Switch case:
```javascript
          case 'delete_attribute':
            return await this.deleteAttribute(request.params.arguments);
```

**5d)** Wrapper:
```javascript
  async deleteAttribute(args) {
    return await deleteAttribute(this.triliumClient, args);
  }
```

- [ ] **Step 6: Run full suite**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npm test 2>&1 | tail -5`
Expected: tutti verdi.

- [ ] **Step 7: Commit**

```bash
git add src/tools/delete-attribute.js tests/delete-attribute.test.js src/index.js
git commit -m "feat: add delete_attribute tool

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Smoke integrazione Fase 1 (attributes) su Trilium reale

**Files:** nessuna modifica codice. Solo verifica.

- [ ] **Step 1: Avvia il server in debug**

Run (in un terminale): `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && LOG_LEVEL=debug npm start`

Lascia girare in background. Stoppalo con Ctrl+C dopo gli smoke.

- [ ] **Step 2: Test connectivity per sanity**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npm run test-connectivity 2>&1 | tail -10`
Expected: connessione OK al server Trilium (`http://100.95.56.11:8080`).

- [ ] **Step 3: Smoke via curl ETAPI diretto (sanity di endpoint usati)**

Sostituisci `$TOKEN` con quello dell'utente (NON committarlo). Crea una nota dummy via API:

```bash
TOKEN="<chiedi all'utente o leggi da .env senza stamparlo>"
curl -s -X POST http://100.95.56.11:8080/etapi/create-note \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"parentNoteId":"root","title":"mcp-smoke-test","type":"text","content":"smoke"}'
```

Annota il `noteId` ritornato. Poi:
```bash
curl -s -X GET "http://100.95.56.11:8080/etapi/notes/<noteId>/attributes" -H "Authorization: Bearer $TOKEN"
```
Expected: array vuoto `[]`.

- [ ] **Step 4: Smoke MCP via Claude Code**

Aprire una sessione Claude Code e chiedere:
> "Usa list_attributes su `<noteId>`. Poi crea una label `#smoke` su quella nota. Poi crea una relation `~related` verso `root`. Poi listala filtrando per type=relation. Poi cancella entrambi gli attributi."

Verifica visivamente nell'UI Trilium che gli attributi appaiano/scompaiano.

- [ ] **Step 5: Cleanup nota dummy**

```bash
curl -s -X DELETE "http://100.95.56.11:8080/etapi/notes/<noteId>" -H "Authorization: Bearer $TOKEN"
```

- [ ] **Step 6: Se tutto verde, tag intermedio**

```bash
cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium
git tag phase-1-attributes-smoke-ok
```

---

## Task 7: Tool `list_children`

**Files:**
- Create: `src/tools/list-children.js`
- Create: `tests/list-children.test.js`
- Modify: `src/index.js`

- [ ] **Step 1: Scrivi test falliti**

Crea `tests/list-children.test.js`:

```javascript
import { jest } from '@jest/globals';
import { listChildren } from '../src/tools/list-children.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

describe('listChildren', () => {
  let mockClient;
  const mockChildren = {
    results: [
      { noteId: 'c1', title: 'Child 1', type: 'text', mime: 'text/html', dateModified: '2026-05-01T00:00:00Z' },
      { noteId: 'c2', title: 'Child 2', type: 'code', mime: 'text/x-javascript', dateModified: '2026-05-02T00:00:00Z' }
    ]
  };

  beforeEach(() => {
    mockClient = { get: jest.fn() };
    jest.clearAllMocks();
  });

  test('lists direct children', async () => {
    mockClient.get.mockResolvedValueOnce(mockChildren);
    const result = await listChildren(mockClient, { noteId: 'parent1' });
    expect(mockClient.get).toHaveBeenCalledWith(expect.stringContaining('ancestorNoteId=parent1'));
    expect(mockClient.get).toHaveBeenCalledWith(expect.stringContaining('ancestorDepth=eq1'));
    const data = JSON.parse(result.content[1].text);
    expect(data.result.children).toHaveLength(2);
    expect(data.result.children[0]).toEqual(expect.objectContaining({ noteId: 'c1', title: 'Child 1' }));
  });

  test('respects limit parameter', async () => {
    mockClient.get.mockResolvedValueOnce(mockChildren);
    await listChildren(mockClient, { noteId: 'parent1', limit: 5 });
    expect(mockClient.get).toHaveBeenCalledWith(expect.stringContaining('limit=5'));
  });

  test('default limit is 50', async () => {
    mockClient.get.mockResolvedValueOnce(mockChildren);
    await listChildren(mockClient, { noteId: 'parent1' });
    expect(mockClient.get).toHaveBeenCalledWith(expect.stringContaining('limit=50'));
  });

  test('handles empty results', async () => {
    mockClient.get.mockResolvedValueOnce({ results: [] });
    const result = await listChildren(mockClient, { noteId: 'leaf' });
    const data = JSON.parse(result.content[1].text);
    expect(data.result.children).toHaveLength(0);
  });

  test('handles array response (some ETAPI versions return bare array)', async () => {
    mockClient.get.mockResolvedValueOnce(mockChildren.results);
    const result = await listChildren(mockClient, { noteId: 'parent1' });
    const data = JSON.parse(result.content[1].text);
    expect(data.result.children).toHaveLength(2);
  });

  test('rejects missing noteId', async () => {
    const result = await listChildren(mockClient, {});
    expect(result.isError).toBe(true);
  });

  test('rejects limit out of range', async () => {
    const result = await listChildren(mockClient, { noteId: 'n', limit: 999 });
    expect(result.isError).toBe(true);
  });

  test('handles 404', async () => {
    mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await listChildren(mockClient, { noteId: 'ghost' });
    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, deve fallire**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npx jest tests/list-children.test.js 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Implementa**

Crea `src/tools/list-children.js`:

```javascript
import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';

const PICK_FIELDS = ['noteId', 'title', 'type', 'mime', 'dateModified'];

function projectNote(n) {
  const out = {};
  for (const k of PICK_FIELDS) {
    if (n[k] !== undefined) out[k] = n[k];
  }
  return out;
}

export async function listChildren(triliumClient, args) {
  try {
    const noteId = validators.noteId(args.noteId);
    const limit = validators.limit(args.limit ?? 50);

    const params = new URLSearchParams({
      search: '',
      ancestorNoteId: noteId,
      ancestorDepth: 'eq1',
      limit: String(limit)
    });
    const url = `notes?${params.toString()}`;
    logger.debug(`Listing children: ${url}`);
    const raw = await triliumClient.get(url);

    let children = [];
    if (Array.isArray(raw)) {
      children = raw;
    } else if (raw && Array.isArray(raw.results)) {
      children = raw.results;
    }

    const projected = children.map(projectNote);

    const data = {
      operation: 'list_children',
      timestamp: new Date().toISOString(),
      request: { noteId, limit },
      result: { noteId, count: projected.length, children: projected }
    };
    return {
      content: [
        { type: 'text', text: `Found ${projected.length} direct child note${projected.length === 1 ? '' : 'ren'} under ${noteId}` },
        { type: 'text', text: JSON.stringify(data, null, 2) }
      ]
    };
  } catch (error) {
    logger.error(`list_children failed: ${error.message}`);
    const errorData = {
      operation: 'list_children',
      timestamp: new Date().toISOString(),
      request: args,
      error: {
        type: error.constructor.name,
        message: error.message,
        ...(error instanceof TriliumAPIError && { status: error.status, details: error.details })
      }
    };
    if (error instanceof ValidationError) {
      return { content: [{ type: 'text', text: `Validation error: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    if (error instanceof TriliumAPIError && error.status === 404) {
      return { content: [{ type: 'text', text: `Note not found: ${args.noteId}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    return { content: [{ type: 'text', text: `Failed to list children: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
  }
}
```

- [ ] **Step 4: Run test**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npx jest tests/list-children.test.js 2>&1 | tail -10`
Expected: tutti verdi (8 test).

- [ ] **Step 5: Registra in `src/index.js`**

**5a)** Import:
```javascript
import { listChildren } from './tools/list-children.js';
```

**5b)** Schema:
```javascript
          {
            name: 'list_children',
            description: 'List direct children (depth=1) of a note in the tree',
            inputSchema: {
              type: 'object',
              properties: {
                noteId: { type: 'string' },
                limit: { type: 'number', minimum: 1, maximum: 100, default: 50 }
              },
              required: ['noteId']
            }
          },
```

**5c)** Switch case:
```javascript
          case 'list_children':
            return await this.listChildren(request.params.arguments);
```

**5d)** Wrapper:
```javascript
  async listChildren(args) {
    return await listChildren(this.triliumClient, args);
  }
```

- [ ] **Step 6: Run full suite**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npm test 2>&1 | tail -5`
Expected: tutti verdi.

- [ ] **Step 7: Commit**

```bash
git add src/tools/list-children.js tests/list-children.test.js src/index.js
git commit -m "feat: add list_children tool

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Tool `move_note` (con supporto cloni)

**Files:**
- Create: `src/tools/move-note.js`
- Create: `tests/move-note.test.js`
- Modify: `src/index.js`

- [ ] **Step 1: Scrivi test falliti**

Crea `tests/move-note.test.js`:

```javascript
import { jest } from '@jest/globals';
import { moveNote } from '../src/tools/move-note.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

describe('moveNote', () => {
  let mockClient;
  beforeEach(() => {
    mockClient = { get: jest.fn(), put: jest.fn() };
    jest.clearAllMocks();
  });

  test('moves single-branch note', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', branchIds: ['b1'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'old' });
    mockClient.put.mockResolvedValueOnce({ branchId: 'b1', parentNoteId: 'new' });

    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new' });

    expect(mockClient.put).toHaveBeenCalledWith('branches/b1', { parentNoteId: 'new' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[1].text);
    expect(data.result.branchId).toBe('b1');
    expect(data.result.oldParentNoteId).toBe('old');
    expect(data.result.newParentNoteId).toBe('new');
  });

  test('multi-branch with explicit branchId', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', branchIds: ['b1', 'b2'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'p1' });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b2', noteId: 'n1', parentNoteId: 'p2' });
    mockClient.put.mockResolvedValueOnce({});

    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new', branchId: 'b2' });

    expect(mockClient.put).toHaveBeenCalledWith('branches/b2', { parentNoteId: 'new' });
    expect(result.isError).toBeUndefined();
  });

  test('multi-branch with oldParentNoteId resolves correct branch', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', branchIds: ['b1', 'b2'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'p1' });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b2', noteId: 'n1', parentNoteId: 'p2' });
    mockClient.put.mockResolvedValueOnce({});

    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new', oldParentNoteId: 'p2' });

    expect(mockClient.put).toHaveBeenCalledWith('branches/b2', { parentNoteId: 'new' });
    expect(result.isError).toBeUndefined();
  });

  test('multi-branch without disambiguation errors with hint', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', branchIds: ['b1', 'b2'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'p1' });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b2', noteId: 'n1', parentNoteId: 'p2' });

    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('multiple branches');
    expect(mockClient.put).not.toHaveBeenCalled();
  });

  test('rejects missing newParentNoteId', async () => {
    const result = await moveNote(mockClient, { noteId: 'n1' });
    expect(result.isError).toBe(true);
  });

  test('rejects branchId not owned by note', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', branchIds: ['b1'] });
    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new', branchId: 'b99' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('does not belong');
  });

  test('handles 404 on note', async () => {
    mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await moveNote(mockClient, { noteId: 'ghost', newParentNoteId: 'new' });
    expect(result.isError).toBe(true);
  });

  test('handles 409 conflict (cycle)', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', branchIds: ['b1'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'old' });
    mockClient.put.mockRejectedValueOnce(new TriliumAPIError('Conflict', 409, { message: 'cycle' }));
    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'descendant' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Conflict');
  });
});
```

- [ ] **Step 2: Run test, deve fallire**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npx jest tests/move-note.test.js 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Implementa**

Crea `src/tools/move-note.js`:

```javascript
import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';

export async function moveNote(triliumClient, args) {
  try {
    const noteId = validators.noteId(args.noteId);
    const newParentNoteId = validators.noteId(args.newParentNoteId);
    const explicitBranchId = args.branchId ? validators.branchId(args.branchId) : null;
    const oldParentHint = args.oldParentNoteId ? validators.noteId(args.oldParentNoteId) : null;

    const note = await triliumClient.get(`notes/${noteId}`);
    const branchIds = Array.isArray(note?.branchIds) ? note.branchIds : [];

    if (branchIds.length === 0) {
      throw new ValidationError(`Note ${noteId} has no branches; cannot move`);
    }

    let branchId;
    let resolvedOldParent;

    if (explicitBranchId) {
      if (!branchIds.includes(explicitBranchId)) {
        throw new ValidationError(`Branch ${explicitBranchId} does not belong to note ${noteId}. Available branches: ${branchIds.join(', ')}`);
      }
      branchId = explicitBranchId;
    } else if (branchIds.length === 1) {
      branchId = branchIds[0];
    } else {
      const branches = await Promise.all(branchIds.map(id => triliumClient.get(`branches/${id}`)));
      if (oldParentHint) {
        const match = branches.find(b => b.parentNoteId === oldParentHint);
        if (!match) {
          throw new ValidationError(`No branch of note ${noteId} found under parent ${oldParentHint}. Available parents: ${branches.map(b => b.parentNoteId).join(', ')}`);
        }
        branchId = match.branchId;
        resolvedOldParent = match.parentNoteId;
      } else {
        const hint = branches.map(b => `${b.branchId} (under ${b.parentNoteId})`).join('; ');
        throw new ValidationError(`Note ${noteId} has multiple branches — specify branchId or oldParentNoteId. Branches: ${hint}`);
      }
    }

    if (resolvedOldParent === undefined) {
      const currentBranch = await triliumClient.get(`branches/${branchId}`);
      resolvedOldParent = currentBranch?.parentNoteId;
    }

    logger.debug(`Moving branch ${branchId} from ${resolvedOldParent} to ${newParentNoteId}`);
    await triliumClient.put(`branches/${branchId}`, { parentNoteId: newParentNoteId });

    const data = {
      operation: 'move_note',
      timestamp: new Date().toISOString(),
      request: { noteId, newParentNoteId, branchId: explicitBranchId, oldParentNoteId: oldParentHint },
      result: { noteId, branchId, oldParentNoteId: resolvedOldParent, newParentNoteId }
    };
    return {
      content: [
        { type: 'text', text: `Note ${noteId} moved (branch ${branchId}: ${resolvedOldParent} → ${newParentNoteId})` },
        { type: 'text', text: JSON.stringify(data, null, 2) }
      ]
    };
  } catch (error) {
    logger.error(`move_note failed: ${error.message}`);
    const errorData = {
      operation: 'move_note',
      timestamp: new Date().toISOString(),
      request: args,
      error: {
        type: error.constructor.name,
        message: error.message,
        ...(error instanceof TriliumAPIError && { status: error.status, details: error.details })
      }
    };
    if (error instanceof ValidationError) {
      const text = error.message.includes('multiple branches') ? `Note has multiple branches: ${error.message}` : `Validation error: ${error.message}`;
      return { content: [{ type: 'text', text }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    if (error instanceof TriliumAPIError && error.status === 404) {
      return { content: [{ type: 'text', text: `Note or parent not found` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    if (error instanceof TriliumAPIError && error.status === 409) {
      return { content: [{ type: 'text', text: `Conflict: cannot move note (cycle or duplicate)` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    return { content: [{ type: 'text', text: `Failed to move note: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
  }
}
```

- [ ] **Step 4: Run test**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npx jest tests/move-note.test.js 2>&1 | tail -15`
Expected: tutti verdi (8 test).

- [ ] **Step 5: Registra in `src/index.js`**

**5a)** Import:
```javascript
import { moveNote } from './tools/move-note.js';
```

**5b)** Schema:
```javascript
          {
            name: 'move_note',
            description: 'Move a note to a new parent. For cloned notes (multi-branch), pass branchId or oldParentNoteId to disambiguate.',
            inputSchema: {
              type: 'object',
              properties: {
                noteId: { type: 'string' },
                newParentNoteId: { type: 'string' },
                branchId: { type: 'string', description: 'Explicit branch to move (required if note has multiple branches and oldParentNoteId is not provided)' },
                oldParentNoteId: { type: 'string', description: 'Current parent of the branch to move (alternative to branchId)' }
              },
              required: ['noteId', 'newParentNoteId']
            }
          },
```

**5c)** Switch case:
```javascript
          case 'move_note':
            return await this.moveNote(request.params.arguments);
```

**5d)** Wrapper:
```javascript
  async moveNote(args) {
    return await moveNote(this.triliumClient, args);
  }
```

- [ ] **Step 6: Run full suite**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npm test 2>&1 | tail -5`
Expected: tutti verdi.

- [ ] **Step 7: Commit**

```bash
git add src/tools/move-note.js tests/move-note.test.js src/index.js
git commit -m "feat: add move_note tool with clone (multi-branch) support

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Smoke integrazione Fase 2 (tree) su Trilium reale

- [ ] **Step 1: Crea struttura di test via UI Trilium**

Manualmente nell'UI Trilium crea:
- Nota `mcp-smoke-tree-root`
- Sotto di essa: `child-a`, `child-b`, `child-c`
- Sotto `child-a`: `grand-1`, `grand-2`
- Annota i 6 noteId.

- [ ] **Step 2: Smoke via Claude Code — list_children**

> "Lista i figli di `<mcp-smoke-tree-root noteId>`."

Expected: 3 figli (`child-a`, `child-b`, `child-c`).

- [ ] **Step 3: Smoke — move_note single-branch**

> "Sposta `grand-1` sotto `child-b`."

Verifica via UI Trilium che la nota si sia spostata.

- [ ] **Step 4: Smoke — clone + move multi-branch**

Manualmente nell'UI: clone di `grand-2` sotto `child-c` (oltre al parent originale `child-a`).

> "Sposta il branch di `grand-2` che sta sotto `child-c` verso `child-b`. Usa `oldParentNoteId`."

Verifica UI: `grand-2` ora ha branch sotto `child-a` (originale) e `child-b` (nuovo, sostituisce quello sotto `child-c`).

- [ ] **Step 5: Smoke — move che genera ciclo**

> "Sposta `mcp-smoke-tree-root` sotto `child-a`."

Expected: errore esplicito 409/Conflict.

- [ ] **Step 6: Cleanup**

Manualmente cancella `mcp-smoke-tree-root` dall'UI Trilium.

- [ ] **Step 7: Tag**

```bash
cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium
git tag phase-2-tree-smoke-ok
```

---

## Task 10: Tool `delete_note`

**Files:**
- Create: `src/tools/delete-note.js`
- Create: `tests/delete-note.test.js`
- Modify: `src/index.js`

- [ ] **Step 1: Scrivi test falliti**

Crea `tests/delete-note.test.js`:

```javascript
import { jest } from '@jest/globals';
import { deleteNote } from '../src/tools/delete-note.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

describe('deleteNote', () => {
  let mockClient;
  beforeEach(() => {
    mockClient = { get: jest.fn(), delete: jest.fn() };
    jest.clearAllMocks();
  });

  test('deletes a leaf note (no children) directly', async () => {
    mockClient.get.mockResolvedValueOnce({ results: [] });
    mockClient.delete.mockResolvedValueOnce({});

    const result = await deleteNote(mockClient, { noteId: 'leaf1' });

    expect(mockClient.delete).toHaveBeenCalledWith('notes/leaf1');
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[1].text);
    expect(data.result.hadChildren).toBe(false);
  });

  test('refuses subtree delete without confirmCascade', async () => {
    mockClient.get.mockResolvedValueOnce({ results: [{ noteId: 'child1' }] });

    const result = await deleteNote(mockClient, { noteId: 'parent1' });

    expect(mockClient.delete).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('confirmCascade');
  });

  test('deletes subtree with confirmCascade:true', async () => {
    mockClient.get.mockResolvedValueOnce({ results: [{ noteId: 'child1' }, { noteId: 'child2' }] });
    mockClient.delete.mockResolvedValueOnce({});

    const result = await deleteNote(mockClient, { noteId: 'parent1', confirmCascade: true });

    expect(mockClient.delete).toHaveBeenCalledWith('notes/parent1');
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[1].text);
    expect(data.result.hadChildren).toBe(true);
  });

  test('rejects root deletion', async () => {
    const result = await deleteNote(mockClient, { noteId: 'root' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Cannot delete root');
    expect(mockClient.delete).not.toHaveBeenCalled();
  });

  test('rejects missing noteId', async () => {
    const result = await deleteNote(mockClient, {});
    expect(result.isError).toBe(true);
  });

  test('handles 404 on note', async () => {
    mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await deleteNote(mockClient, { noteId: 'ghost' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Note not found');
  });

  test('handles array response from children query', async () => {
    mockClient.get.mockResolvedValueOnce([]);
    mockClient.delete.mockResolvedValueOnce({});
    const result = await deleteNote(mockClient, { noteId: 'leaf2' });
    expect(result.isError).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test, deve fallire**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npx jest tests/delete-note.test.js 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Implementa**

Crea `src/tools/delete-note.js`:

```javascript
import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';

export async function deleteNote(triliumClient, args) {
  try {
    const noteId = validators.noteId(args.noteId);
    if (noteId === 'root') {
      throw new ValidationError('Cannot delete root note');
    }
    const confirmCascade = Boolean(args.confirmCascade);

    const params = new URLSearchParams({
      search: '',
      ancestorNoteId: noteId,
      ancestorDepth: 'eq1',
      limit: '1'
    });
    const childrenRaw = await triliumClient.get(`notes?${params.toString()}`);
    let childCount = 0;
    if (Array.isArray(childrenRaw)) {
      childCount = childrenRaw.length;
    } else if (childrenRaw && Array.isArray(childrenRaw.results)) {
      childCount = childrenRaw.results.length;
    }
    const hadChildren = childCount > 0;

    if (hadChildren && !confirmCascade) {
      throw new ValidationError(`Note ${noteId} has children; pass confirmCascade:true to delete subtree`);
    }

    logger.debug(`Deleting note ${noteId} (hadChildren=${hadChildren}, confirmCascade=${confirmCascade})`);
    await triliumClient.delete(`notes/${noteId}`);

    const data = {
      operation: 'delete_note',
      timestamp: new Date().toISOString(),
      request: { noteId, confirmCascade },
      result: { noteId, deleted: true, hadChildren }
    };
    return {
      content: [
        { type: 'text', text: `Note deleted: ${noteId}${hadChildren ? ' (with subtree)' : ''}` },
        { type: 'text', text: JSON.stringify(data, null, 2) }
      ]
    };
  } catch (error) {
    logger.error(`delete_note failed: ${error.message}`);
    const errorData = {
      operation: 'delete_note',
      timestamp: new Date().toISOString(),
      request: args,
      error: {
        type: error.constructor.name,
        message: error.message,
        ...(error instanceof TriliumAPIError && { status: error.status, details: error.details })
      }
    };
    if (error instanceof ValidationError) {
      return { content: [{ type: 'text', text: `Validation error: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    if (error instanceof TriliumAPIError && error.status === 404) {
      return { content: [{ type: 'text', text: `Note not found: ${args.noteId}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    return { content: [{ type: 'text', text: `Failed to delete note: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
  }
}
```

- [ ] **Step 4: Run test**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npx jest tests/delete-note.test.js 2>&1 | tail -10`
Expected: tutti verdi (7 test).

- [ ] **Step 5: Registra in `src/index.js`**

**5a)** Import:
```javascript
import { deleteNote } from './tools/delete-note.js';
```

**5b)** Schema:
```javascript
          {
            name: 'delete_note',
            description: 'Delete a note. If the note has children, confirmCascade must be true.',
            inputSchema: {
              type: 'object',
              properties: {
                noteId: { type: 'string' },
                confirmCascade: { type: 'boolean', default: false, description: 'Required true if the note has children' }
              },
              required: ['noteId']
            }
          },
```

**5c)** Switch case:
```javascript
          case 'delete_note':
            return await this.deleteNote(request.params.arguments);
```

**5d)** Wrapper:
```javascript
  async deleteNote(args) {
    return await deleteNote(this.triliumClient, args);
  }
```

- [ ] **Step 6: Run full suite**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npm test 2>&1 | tail -5`
Expected: tutti verdi.

- [ ] **Step 7: Coverage check**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npm run test:coverage 2>&1 | tail -15`
Expected: coverage ≥90% sui nuovi 7 file `src/tools/*.js` aggiunti in questo plan.

- [ ] **Step 8: Commit**

```bash
git add src/tools/delete-note.js tests/delete-note.test.js src/index.js
git commit -m "feat: add delete_note tool with confirmCascade guardrail

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Smoke integrazione Fase 3 (delete) su Trilium reale

- [ ] **Step 1: Crea albero di test via UI Trilium**

Crea:
- Nota `mcp-smoke-delete-root`
- Sotto di essa: `to-delete-leaf` e `to-delete-parent` con `to-delete-child`.

Annota i noteId.

- [ ] **Step 2: Smoke — cancellazione foglia diretta**

> "Cancella la nota `<to-delete-leaf noteId>`."

Verifica UI: nota sparita (o spostata in cestino).

- [ ] **Step 3: Smoke — cancellazione subtree senza confirmCascade**

> "Cancella la nota `<to-delete-parent noteId>`."

Expected: errore esplicito che chiede `confirmCascade:true`. Verifica UI: nota intatta.

- [ ] **Step 4: Smoke — cancellazione subtree con confirmCascade**

> "Cancella la nota `<to-delete-parent noteId>` con confirmCascade:true."

Verifica UI: nota e child cancellati.

- [ ] **Step 5: Smoke — protezione root**

> "Cancella la nota root."

Expected: ValidationError immediato.

- [ ] **Step 6: Cleanup**

Cancella manualmente `mcp-smoke-delete-root` dall'UI Trilium.

- [ ] **Step 7: Tag**

```bash
cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium
git tag phase-3-delete-smoke-ok
```

---

## Task 12: Release 0.2.0

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump versione in `package.json`**

In `package.json`, cambia:
```json
"version": "0.2.0",
```

- [ ] **Step 2: Aggiorna `README.md` con i nuovi tool**

Nella sezione `### 🛠️ Tools` del README, aggiungi sotto i 4 esistenti:
```markdown
- **list_attributes** - List all labels and relations of a note (optional filter by type)
- **create_attribute** - Create a new label or relation (with target validation for relations)
- **update_attribute** - Update value or position of an attribute
- **delete_attribute** - Delete an attribute by its ID
- **list_children** - List direct children of a note in the tree
- **move_note** - Move a note under a new parent (supports cloned notes via branchId or oldParentNoteId)
- **delete_note** - Delete a note (requires confirmCascade for non-leaf notes)
```

Nella sezione "Changelog" del README aggiungi:
```markdown
### v0.2.0
- Add 7 new tools: list_attributes, create_attribute, update_attribute, delete_attribute, list_children, move_note, delete_note
- Align MCP response mime type to 'text' (spec-compliant)
- Add validators for attributes and branches
```

- [ ] **Step 3: Aggiorna `CLAUDE.md`**

Nella sezione `### MCP Protocol Implementation` di `CLAUDE.md`, sostituisci:
```
- **4 Tools**: create_note, search_notes, get_note, update_note
```
con:
```
- **11 Tools**: create_note, search_notes, get_note, update_note, list_attributes, create_attribute, update_attribute, delete_attribute, list_children, move_note, delete_note
```

- [ ] **Step 4: Run final test + coverage**

Run: `cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium && npm test 2>&1 | tail -5 && npm run test:coverage 2>&1 | tail -10`
Expected: tutti verdi, coverage globale invariato o migliorato.

- [ ] **Step 5: Commit + tag**

```bash
cd /home/domenico/Scrivania/Progetti/TriliumClaude/mcp-trilium
git add package.json README.md CLAUDE.md
git commit -m "chore: release 0.2.0 — tree navigation & attributes tools

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git tag v0.2.0
```

- [ ] **Step 6: Sync MCP server con la nuova versione**

Riavviare Claude Code per ricaricare il MCP server stdio (oppure usare il comando appropriato di Claude Code per ricaricare i MCP servers).

Verifica con `claude mcp list` o equivalente che `triliumnext-mcp` esponga ora 11 tool.

- [ ] **Step 7: Salva memoria su Basic Memory**

Scrivi una nota in Basic Memory (project: main) sotto `progetti/trilium-mcp/` con titolo "2026-05-22 mcp-trilium 0.2.0 — tree e attributes":
- Cosa è stato fatto: 7 nuovi tool, scope medio dal design del 2026-05-22.
- Why: pattern Claude Code + Obsidian replicato su Trilium per "second brain".
- How to apply: in futuro Claude può listare children, spostare, taggare e linkare note tramite MCP. Tool elencati.

---

## Riassunto criteri di successo

Al termine del plan:
- 11 tool MCP esposti (4 pre-esistenti + 7 nuovi)
- 100+ test Jest verdi (94 pre-esistenti + ~45 nuovi)
- Coverage ≥90% sui nuovi file
- Smoke su Trilium reale superati per le 3 fasi
- Tag `v0.2.0` creato
- README e CLAUDE.md aggiornati
