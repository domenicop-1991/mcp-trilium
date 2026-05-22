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
