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

    let children;
    if (Array.isArray(raw)) {
      children = raw;
    } else if (raw && Array.isArray(raw.results)) {
      children = raw.results;
    } else {
      throw new TriliumAPIError(`Unexpected response format from notes search (expected array or {results: []}, got ${typeof raw})`, 500, { response: raw });
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
    if (error instanceof TriliumAPIError) {
      return { content: [{ type: 'text', text: `TriliumNext API error: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    return { content: [{ type: 'text', text: `Failed to list children: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
  }
}
