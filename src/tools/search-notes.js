import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';

export async function searchNotes(triliumClient, args) {
  try {
    // Validate inputs
    const query = validators.searchQuery(args.query);
    const limit = validators.limit(args.limit);
    const ancestorNoteId = args.ancestorNoteId != null ? validators.noteId(args.ancestorNoteId) : undefined;
    const ancestorDepth = validators.searchField(args.ancestorDepth, 'ancestorDepth');
    const orderBy = validators.searchField(args.orderBy, 'orderBy');
    const orderDirection = validators.orderDirection(args.orderDirection);
    const fastSearch = validators.boolean(args.fastSearch, 'fastSearch');
    const includeArchivedNotes = validators.boolean(args.includeArchivedNotes, 'includeArchivedNotes');

    logger.debug(`Searching notes: query="${query}", limit=${limit}`);

    // Prepare search parameters for TriliumNext API
    const params = new URLSearchParams({
      search: query,
      limit: limit.toString(),
    });
    const filters = {};
    if (ancestorNoteId !== undefined) { params.append('ancestorNoteId', ancestorNoteId); filters.ancestorNoteId = ancestorNoteId; }
    if (ancestorDepth !== undefined) { params.append('ancestorDepth', ancestorDepth); filters.ancestorDepth = ancestorDepth; }
    if (orderBy !== undefined) { params.append('orderBy', orderBy); filters.orderBy = orderBy; }
    if (orderDirection !== undefined) { params.append('orderDirection', orderDirection); filters.orderDirection = orderDirection; }
    if (fastSearch !== undefined) { params.append('fastSearch', String(fastSearch)); filters.fastSearch = fastSearch; }
    if (includeArchivedNotes !== undefined) { params.append('includeArchivedNotes', String(includeArchivedNotes)); filters.includeArchivedNotes = includeArchivedNotes; }

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
      ...(Object.keys(filters).length > 0 && { filters }),
      notes: results.map(note => ({
        noteId: note.noteId,
        title: note.title || 'Untitled',
        type: note.type || 'text',
        dateModified: note.dateModified,
        parentNoteIds: note.parentNoteIds || [],
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