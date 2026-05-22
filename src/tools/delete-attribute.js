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
    if (error instanceof TriliumAPIError) {
      return { content: [{ type: 'text', text: `TriliumNext API error: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    return { content: [{ type: 'text', text: `Failed to delete attribute: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
  }
}
