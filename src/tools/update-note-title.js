import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';

export async function updateNoteTitle(triliumClient, args) {
  try {
    const noteId = validators.noteId(args.noteId);
    const title = validators.title(args.title);

    logger.debug(`Updating title of note ${noteId} to "${title}"`);
    const result = await triliumClient.patch(`notes/${noteId}`, { title });

    const data = {
      operation: 'update_note_title',
      timestamp: new Date().toISOString(),
      request: { noteId, title },
      result: { noteId, title: result?.title || title, type: result?.type }
    };
    return {
      content: [
        { type: 'text', text: `Note title updated: "${title}" (ID: ${noteId})` },
        { type: 'text', text: JSON.stringify(data, null, 2) }
      ]
    };
  } catch (error) {
    logger.error(`update_note_title failed: ${error.message}`);
    const errorData = {
      operation: 'update_note_title',
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
    return { content: [{ type: 'text', text: `Failed to update note title: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
  }
}
