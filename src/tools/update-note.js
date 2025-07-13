import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';

export async function updateNote(triliumClient, args) {
  try {
    // Validate inputs
    const noteId = validators.noteId(args.noteId);
    const content = validators.content(args.content);

    logger.debug(`Updating note: noteId="${noteId}"`);

    // First, check if the note exists by getting its metadata
    try {
      const note = await triliumClient.get(`notes/${noteId}`);
      if (!note) {
        throw new TriliumAPIError('Note not found', 404);
      }
      logger.debug(`Note exists: ${note.title || 'Untitled'}`);
    } catch (error) {
      if (error instanceof TriliumAPIError && error.status === 404) {
        throw new TriliumAPIError('Note not found', 404);
      }
      throw error;
    }

    // Update the note content via TriliumNext API
    await triliumClient.put(`notes/${noteId}/content`, { content });
    
    logger.info(`Note content updated successfully: ${noteId}`);

    // Get updated note info for confirmation
    const updatedNote = await triliumClient.get(`notes/${noteId}`);

    return {
      content: [
        {
          type: 'text',
          text: `✅ **Note updated successfully!**

**Note ID:** \`${noteId}\`
**Title:** ${updatedNote.title || 'Untitled'}
**Type:** ${updatedNote.type || 'text'}
**Last Modified:** ${updatedNote.dateModified ? new Date(updatedNote.dateModified).toLocaleString() : 'Unknown'}

**Content Length:** ${content.length} characters

The note content has been updated in your TriliumNext instance.`,
        },
      ],
    };
  } catch (error) {
    logger.error(`Failed to update note: ${error.message}`);
    
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
      if (error.status === 404) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ **Note Not Found**

The note with ID \`${args.noteId}\` does not exist or you don't have permission to modify it.

**Possible reasons:**
- The note ID is incorrect
- The note has been deleted
- You don't have permission to edit this note
- The note might be protected`,
            },
          ],
          isError: true,
        };
      } else if (error.status === 403) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ **Access Denied**

You don't have permission to update this note.

**Possible reasons:**
- The note is protected and requires a password
- Your authentication token doesn't have write permissions
- The note is in a read-only subtree`,
            },
          ],
          isError: true,
        };
      }
      
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