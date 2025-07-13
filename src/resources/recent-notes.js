import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';

export async function getRecentNotesResource(triliumClient) {
  try {
    logger.debug('Fetching recent notes resource');

    // Get recently modified notes from TriliumNext API
    const notes = await triliumClient.get('notes?orderBy=dateModified&orderDirection=desc&limit=10');
    
    if (!Array.isArray(notes)) {
      throw new TriliumAPIError('Invalid response from TriliumNext API - expected array of notes');
    }

    logger.info(`Retrieved ${notes.length} recent notes`);

    // Format the notes data for the resource
    const formattedNotes = notes.map(note => ({
      noteId: note.noteId,
      title: note.title || 'Untitled',
      type: note.type || 'text',
      dateCreated: note.dateCreated,
      dateModified: note.dateModified,
      parentNoteId: note.parentNoteId,
      isProtected: note.isProtected || false,
      // Include basic metadata but not full content for performance
      contentLength: note.contentLength || 0,
      attributes: note.attributes || []
    }));

    const resourceData = {
      notes: formattedNotes,
      timestamp: new Date().toISOString(),
      count: formattedNotes.length,
      description: 'Recently modified notes from TriliumNext'
    };

    return {
      contents: [
        {
          uri: 'trilium://recent-notes',
          mimeType: 'application/json',
          text: JSON.stringify(resourceData, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error(`Failed to get recent notes resource: ${error.message}`);
    
    if (error instanceof TriliumAPIError) {
      // Return an error resource instead of throwing
      const errorData = {
        error: error.message,
        status: error.status || 'Unknown',
        timestamp: new Date().toISOString(),
        notes: []
      };
      
      return {
        contents: [
          {
            uri: 'trilium://recent-notes',
            mimeType: 'application/json',
            text: JSON.stringify(errorData, null, 2),
          },
        ],
      };
    }
    
    // For unknown errors, re-throw to be handled by the main server
    throw error;
  }
}