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

    logger.debug(`Listing children of note ${noteId}`);
    const note = await triliumClient.get(`notes/${noteId}`);
    const childNoteIds = Array.isArray(note?.childNoteIds) ? note.childNoteIds : [];

    const sliced = childNoteIds.slice(0, limit);
    const settled = await Promise.allSettled(sliced.map(id => triliumClient.get(`notes/${id}`)));
    const children = settled.filter(s => s.status === 'fulfilled').map(s => s.value);
    const failedCount = settled.length - children.length;
    if (failedCount > 0) {
      logger.warn(`list_children: ${failedCount} child note(s) under ${noteId} failed to fetch (possibly deleted concurrently)`);
    }
    const projected = children.map(projectNote);

    const data = {
      operation: 'list_children',
      timestamp: new Date().toISOString(),
      request: { noteId, limit },
      result: { noteId, count: projected.length, ...(failedCount > 0 && { failedCount }), children: projected }
    };
    return {
      content: [
        { type: 'text', text: `Found ${projected.length} direct ${projected.length === 1 ? 'child' : 'children'} under ${noteId}` },
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
