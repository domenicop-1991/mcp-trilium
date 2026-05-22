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
    let position;
    if (args.position !== undefined && args.position !== null) {
      position = Number(args.position);
      if (Number.isNaN(position)) {
        throw new ValidationError('position must be a valid number');
      }
    }

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
    if (error instanceof TriliumAPIError) {
      return { content: [{ type: 'text', text: `TriliumNext API error: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    return { content: [{ type: 'text', text: `Failed to create attribute: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
  }
}
