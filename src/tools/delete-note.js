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

    const note = await triliumClient.get(`notes/${noteId}`);
    const childNoteIds = Array.isArray(note?.childNoteIds) ? note.childNoteIds : [];
    const hadChildren = childNoteIds.length > 0;

    if (hadChildren && !confirmCascade) {
      throw new ValidationError(`Note ${noteId} has ${childNoteIds.length} child note(s); pass confirmCascade:true to delete subtree`);
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
    if (error instanceof TriliumAPIError) {
      return { content: [{ type: 'text', text: `TriliumNext API error: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    return { content: [{ type: 'text', text: `Failed to delete note: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
  }
}
