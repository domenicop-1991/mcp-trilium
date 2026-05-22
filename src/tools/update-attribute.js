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
      const pos = Number(args.position);
      if (Number.isNaN(pos)) {
        throw new ValidationError('position must be a valid number');
      }
      body.position = pos;
    }
    if (Object.keys(body).length === 0) {
      throw new ValidationError("At least one of 'value' or 'position' must be provided");
    }

    logger.debug(`Updating attribute ${attributeId} with ${JSON.stringify(body)}`);
    const updated = await triliumClient.patch(`attributes/${attributeId}`, body);

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
    if (error instanceof TriliumAPIError) {
      return { content: [{ type: 'text', text: `TriliumNext API error: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    return { content: [{ type: 'text', text: `Failed to update attribute: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
  }
}
