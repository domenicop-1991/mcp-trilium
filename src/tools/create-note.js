import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';
import { markdownToHtml, shouldConvertMarkdown } from '../utils/md-to-html.js';

export async function createNote(triliumClient, args) {
  try {
    const title = validators.title(args.title);
    const rawContent = validators.content(args.content);
    const type = validators.noteType(args.type);
    const mime = validators.mime(args.mime);
    const format = validators.contentFormat(args.format);
    const parentNoteId = args.parentNoteId ? validators.noteId(args.parentNoteId) : 'root';

    let content = rawContent;
    let resolvedMime = mime;
    let converted = false;
    if (format === 'markdown' && shouldConvertMarkdown({ type, mime })) {
      content = markdownToHtml(rawContent, { type, mime });
      converted = content !== rawContent;
      if (converted && !resolvedMime) resolvedMime = 'text/html';
    }

    logger.debug(`Creating note: title="${title}", type="${type}", parent="${parentNoteId}", format=${format}, converted=${converted}`);

    const noteData = { title, content, type, parentNoteId };
    if (resolvedMime !== undefined) noteData.mime = resolvedMime;

    const result = await triliumClient.post('create-note', noteData);
    if (!result || !result.note || !result.note.noteId) {
      throw new TriliumAPIError('Invalid response from TriliumNext API - missing note ID');
    }

    const noteId = result.note.noteId;
    logger.info(`Note created successfully with ID: ${noteId}`);

    const payload = {
      operation: 'create_note',
      request: {
        title,
        type,
        format,
        converted,
        inputLength: rawContent.length,
        storedLength: content.length,
        parentNoteId,
      },
      result: {
        noteId,
        ...(resolvedMime && { mime: resolvedMime }),
      },
    };

    const summary = `Note created: "${title}" (ID: ${noteId}${converted ? ', md→html' : ''})`;
    return {
      content: [
        { type: 'text', text: summary },
        { type: 'text', text: JSON.stringify(payload) },
      ],
    };
  } catch (error) {
    logger.error(`Failed to create note: ${error.message}`);

    const errorPayload = {
      operation: 'create_note',
      request: {
        title: args.title,
        type: args.type,
        format: args.format,
        contentLength: args.content?.length,
        parentNoteId: args.parentNoteId,
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
    else if (error instanceof TriliumAPIError) prefix = `TriliumNext API error: ${error.message}`;
    else prefix = `Note creation failed: ${error.message}`;

    return {
      content: [
        { type: 'text', text: prefix },
        { type: 'text', text: JSON.stringify(errorPayload) },
      ],
      isError: true,
    };
  }
}
