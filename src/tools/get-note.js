import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';

export async function getNote(triliumClient, args) {
  try {
    // Validate inputs
    const noteId = validators.noteId(args.noteId);

    logger.debug(`Getting note: noteId="${noteId}"`);

    // Get note metadata and content from TriliumNext API
    const [note, content] = await Promise.all([
      triliumClient.get(`notes/${noteId}`),
      triliumClient.get(`notes/${noteId}/content`)
    ]);
    
    if (!note) {
      throw new TriliumAPIError('Note not found', 404);
    }

    logger.info(`Retrieved note: ${note.title || 'Untitled'} (${noteId})`);

    // Prepare structured response data
    const noteData = {
      operation: 'get_note',
      timestamp: new Date().toISOString(),
      note: {
        noteId,
        title: note.title || 'Untitled',
        type: note.type || 'text',
        mime: note.mime,
        isProtected: note.isProtected || false,
        isDeleted: note.isDeleted || false,
        dateCreated: note.dateCreated,
        dateModified: note.dateModified,
        utcDateCreated: note.utcDateCreated,
        utcDateModified: note.utcDateModified,
        parentNoteIds: note.parentNoteIds || [],
        childNoteIds: note.childNoteIds || [],
        attributes: note.attributes || [],
        content: {
          type: typeof content === 'string' ? 'text' : 'binary',
          length: typeof content === 'string' ? content.length : 0,
          ...(typeof content === 'string' && content.length <= 10000 && { 
            data: content 
          }),
          ...(typeof content === 'string' && content.length > 10000 && { 
            preview: content.substring(0, 1000) + '...',
            truncated: true,
            fullLength: content.length
          })
        },
        triliumUrl: `trilium://note/${noteId}`
      }
    };

    // Create concise summary
    const summary = `Note: "${note.title || 'Untitled'}" (${note.type || 'text'}, ${typeof content === 'string' ? content.length + ' chars' : 'binary'})`;

    return {
      content: [
        {
          type: 'text',
          text: summary
        },
        {
          type: 'text',
          text: JSON.stringify(noteData, null, 2)
        }
      ],
    };
  } catch (error) {
    logger.error(`Failed to get note: ${error.message}`);
    
    // Create structured error response
    const errorData = {
      operation: 'get_note',
      timestamp: new Date().toISOString(),
      request: {
        noteId: args.noteId
      },
      error: {
        type: error.constructor.name,
        message: error.message,
        ...(error instanceof TriliumAPIError && { status: error.status }),
        ...(error instanceof TriliumAPIError && error.details && { details: error.details })
      }
    };

    if (error instanceof ValidationError) {
      return {
        content: [
          {
            type: 'text',
            text: `Validation error: ${error.message}`
          },
          {
            type: 'text',
            text: JSON.stringify(errorData, null, 2)
          }
        ],
        isError: true,
      };
    }
    
    if (error instanceof TriliumAPIError) {
      if (error.status === 404) {
        return {
          content: [
            {
              type: 'text',
              text: `Note not found: ${args.noteId}`
            },
            {
              type: 'text',
              text: JSON.stringify(errorData, null, 2)
            }
          ],
          isError: true,
        };
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `TriliumNext API error: ${error.message}`
          },
          {
            type: 'text',
            text: JSON.stringify(errorData, null, 2)
          }
        ],
        isError: true,
      };
    }
    
    // Unknown error
    return {
      content: [
        {
          type: 'text',
          text: `Failed to get note: ${error.message}`
        },
        {
          type: 'text',
          text: JSON.stringify(errorData, null, 2)
        }
      ],
      isError: true,
    };
  }
}