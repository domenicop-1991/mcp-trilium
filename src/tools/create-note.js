import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';

export async function createNote(triliumClient, args) {
  try {
    // Validate inputs
    const title = validators.title(args.title);
    const content = validators.content(args.content);
    const type = validators.noteType(args.type);
    const parentNoteId = args.parentNoteId ? validators.noteId(args.parentNoteId) : undefined;

    logger.debug(`Creating note: title="${title}", type="${type}", parent="${parentNoteId || 'root'}"`);

    // Prepare note data for TriliumNext API
    const noteData = {
      title,
      content,
      type,
      ...(parentNoteId && { parentNoteId }),
    };

    // Create the note via TriliumNext API
    const result = await triliumClient.post('create-note', noteData);
    
    if (!result || !result.note || !result.note.noteId) {
      throw new TriliumAPIError('Invalid response from TriliumNext API - missing note ID');
    }

    const noteId = result.note.noteId;
    logger.info(`Note created successfully with ID: ${noteId}`);

    return {
      content: [
        {
          type: 'text',
          text: `✅ Note created successfully!

**Note ID:** ${noteId}
**Title:** ${title}
**Type:** ${type}
**Parent:** ${parentNoteId || 'root'}

The note has been created and is now available in your TriliumNext instance.`,
        },
      ],
    };
  } catch (error) {
    logger.error(`Failed to create note: ${error.message}`);
    
    if (error instanceof ValidationError) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Validation Error:** ${error.message}

Please check your input and try again.`,
          },
        ],
        isError: true,
      };
    }
    
    if (error instanceof TriliumAPIError) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **TriliumNext API Error:** ${error.message}

Status: ${error.status || 'Unknown'}
Please check your TriliumNext connection and authentication.`,
          },
        ],
        isError: true,
      };
    }
    
    // Unknown error
    return {
      content: [
        {
          type: 'text',
          text: `❌ **Unexpected Error:** ${error.message}

Please try again or check the server logs for more details.`,
        },
      ],
      isError: true,
    };
  }
}