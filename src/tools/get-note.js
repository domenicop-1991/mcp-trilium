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

    // Format note information for display
    const noteInfo = [];
    
    noteInfo.push(`# ${note.title || 'Untitled'}`);
    noteInfo.push('');
    
    // Metadata section
    noteInfo.push('## 📋 Note Information');
    noteInfo.push(`- **ID:** \`${noteId}\``);
    noteInfo.push(`- **Type:** ${note.type || 'text'}`);
    
    if (note.dateCreated) {
      noteInfo.push(`- **Created:** ${new Date(note.dateCreated).toLocaleString()}`);
    }
    
    if (note.dateModified) {
      noteInfo.push(`- **Modified:** ${new Date(note.dateModified).toLocaleString()}`);
    }
    
    if (note.parentNoteId) {
      noteInfo.push(`- **Parent Note:** \`${note.parentNoteId}\``);
    }
    
    if (note.isProtected) {
      noteInfo.push('- **🔒 Protected Note**');
    }
    
    // Attributes section (if any)
    if (note.attributes && note.attributes.length > 0) {
      noteInfo.push('');
      noteInfo.push('## 🏷️ Attributes');
      note.attributes.forEach(attr => {
        if (attr.type === 'label') {
          noteInfo.push(`- **${attr.name}:** ${attr.value || '(no value)'}`);
        } else if (attr.type === 'relation') {
          noteInfo.push(`- **→ ${attr.name}:** ${attr.value}`);
        }
      });
    }
    
    // Content section
    noteInfo.push('');
    noteInfo.push('## 📄 Content');
    
    if (typeof content === 'string') {
      if (content.trim().length === 0) {
        noteInfo.push('*(No content)*');
      } else {
        // Limit content display for very long notes
        const contentLimit = 5000;
        if (content.length > contentLimit) {
          noteInfo.push(content.substring(0, contentLimit));
          noteInfo.push('');
          noteInfo.push(`*(Content truncated - showing first ${contentLimit} characters of ${content.length} total)*`);
        } else {
          noteInfo.push(content);
        }
      }
    } else {
      noteInfo.push('*(Binary content - cannot display)*');
    }

    return {
      content: [
        {
          type: 'text',
          text: noteInfo.join('\n'),
        },
      ],
    };
  } catch (error) {
    logger.error(`Failed to get note: ${error.message}`);
    
    if (error instanceof ValidationError) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ **Validation Error:** ${error.message}

Please check the note ID and try again.`,
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

The note with ID \`${args.noteId}\` does not exist or you don't have permission to access it.

**Possible reasons:**
- The note ID is incorrect
- The note has been deleted
- You don't have permission to view this note`,
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