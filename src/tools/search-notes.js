import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';

export async function searchNotes(triliumClient, args) {
  try {
    // Validate inputs
    const query = validators.searchQuery(args.query);
    const limit = validators.limit(args.limit);

    logger.debug(`Searching notes: query="${query}", limit=${limit}`);

    // Prepare search parameters for TriliumNext API
    const params = new URLSearchParams({
      search: query,
      limit: limit.toString(),
    });

    // Search notes via TriliumNext API
    const response = await triliumClient.get(`notes?${params}`);
    
    if (!response || typeof response !== 'object' || !Array.isArray(response.results)) {
      throw new TriliumAPIError('Invalid response from TriliumNext API - expected object with results array');
    }
    
    const results = response.results;
    logger.info(`Found ${results.length} notes matching query "${query}"`);

    // Prepare structured response data
    const searchData = {
      query,
      limit,
      totalResults: results.length,
      hasMore: results.length === limit, // Might be more results if we hit the limit
      timestamp: new Date().toISOString(),
      notes: results.map(note => ({
        noteId: note.noteId,
        title: note.title || 'Untitled',
        type: note.type || 'text',
        dateCreated: note.dateCreated,
        dateModified: note.dateModified,
        parentNoteIds: note.parentNoteIds || [],
        isProtected: note.isProtected || false,
        // Preserve additional fields that might be useful
        ...(note.mime && { mime: note.mime }),
        ...(note.attributes && { attributes: note.attributes }),
        ...(note.contentLength && { contentLength: note.contentLength })
      }))
    };

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No notes found for "${query}"`
          },
          {
            type: 'text',
            text: JSON.stringify(searchData, null, 2)
          }
        ],
      };
    }

    // Create concise summary
    const summary = `Found ${results.length} note${results.length === 1 ? '' : 's'} for "${query}"${searchData.hasMore ? ' (showing first ' + limit + ')' : ''}`;

    return {
      content: [
        {
          type: 'text',
          text: summary
        },
        {
          type: 'text',
          text: JSON.stringify(searchData, null, 2)
        }
      ],
    };
  } catch (error) {
    logger.error(`Failed to search notes: ${error.message}`);
    
    // Create structured error response
    const errorData = {
      query: args.query,
      limit: args.limit,
      timestamp: new Date().toISOString(),
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
          text: `Search failed: ${error.message}`
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