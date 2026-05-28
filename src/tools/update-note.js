import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';
import { markdownToHtml, shouldConvertMarkdown } from '../utils/md-to-html.js';

export async function updateNote(triliumClient, args) {
  try {
    const noteId = validators.noteId(args.noteId);
    const rawContent = validators.content(args.content);
    const format = validators.contentFormat(args.format);

    logger.debug(`Updating note: noteId="${noteId}" format=${format}`);

    let existingNote;
    try {
      existingNote = await triliumClient.get(`notes/${noteId}`);
      if (!existingNote) throw new TriliumAPIError('Note not found', 404);
    } catch (error) {
      if (error instanceof TriliumAPIError && error.status === 404) {
        throw new TriliumAPIError('Note not found', 404);
      }
      throw error;
    }

    let content = rawContent;
    let converted = false;
    if (format === 'markdown' && shouldConvertMarkdown({ type: existingNote.type, mime: existingNote.mime })) {
      content = markdownToHtml(rawContent, { type: existingNote.type, mime: existingNote.mime });
      converted = content !== rawContent;
    }

    await triliumClient.putRaw(`notes/${noteId}/content`, content);
    logger.info(`Note content updated successfully: ${noteId} converted=${converted}`);

    const updatedNote = await triliumClient.get(`notes/${noteId}`);

    const payload = {
      operation: 'update_note',
      request: {
        noteId,
        format,
        converted,
        inputLength: rawContent.length,
        storedLength: content.length,
      },
      result: {
        noteId,
        title: updatedNote.title || 'Untitled',
        type: updatedNote.type || 'text',
        ...(updatedNote.dateModified && { dateModified: updatedNote.dateModified }),
      },
    };

    const summary = `Note updated: "${updatedNote.title || 'Untitled'}" (ID: ${noteId}${converted ? ', md→html' : ''})`;
    return {
      content: [
        { type: 'text', text: summary },
        { type: 'text', text: JSON.stringify(payload) },
      ],
    };
  } catch (error) {
    logger.error(`Failed to update note: ${error.message}`);

    const errorPayload = {
      operation: 'update_note',
      request: {
        noteId: args.noteId,
        format: args.format,
        contentLength: args.content?.length,
      },
      error: {
        type: error.constructor.name,
        message: error.message,
        ...(error instanceof TriliumAPIError && { status: error.status }),
        ...(error instanceof TriliumAPIError && error.details && { details: error.details }),
      },
    };

    let prefix;
    if (error instanceof ValidationError) prefix = `Validation error: ${error.message}`;
    else if (error instanceof TriliumAPIError) {
      if (error.status === 404) prefix = `Note not found: ${args.noteId}`;
      else if (error.status === 403) prefix = `Access denied: Cannot update note ${args.noteId}`;
      else prefix = `TriliumNext API error: ${error.message}`;
    } else prefix = `Failed to update note: ${error.message}`;

    return {
      content: [
        { type: 'text', text: prefix },
        { type: 'text', text: JSON.stringify(errorPayload) },
      ],
      isError: true,
    };
  }
}
