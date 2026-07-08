import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';
import { markdownToHtml, shouldConvertMarkdown } from '../utils/md-to-html.js';

export async function appendNote(triliumClient, args) {
  try {
    const noteId = validators.noteId(args.noteId);
    const rawContent = validators.content(args.content);
    const format = validators.contentFormat(args.format);

    logger.debug(`Appending to note: noteId="${noteId}" format=${format}`);

    const note = await triliumClient.get(`notes/${noteId}`);
    if (!note) throw new TriliumAPIError('Note not found', 404);

    const existing = await triliumClient.get(`notes/${noteId}/content`);
    const base = typeof existing === 'string' ? existing : '';

    let addition = rawContent;
    let converted = false;
    if (format === 'markdown' && shouldConvertMarkdown({ type: note.type, mime: note.mime })) {
      addition = markdownToHtml(rawContent, { type: note.type, mime: note.mime });
      converted = addition !== rawContent;
    }

    const newContent = base + addition;
    await triliumClient.putRaw(`notes/${noteId}/content`, newContent);
    logger.info(`Appended to note ${noteId} (converted=${converted}, +${addition.length} chars)`);

    const payload = {
      operation: 'append_to_note',
      request: { noteId, format, converted, appendedLength: addition.length },
      result: { noteId, title: note.title || 'Untitled', storedLength: newContent.length },
    };
    const summary = `Appended to "${note.title || 'Untitled'}" (ID: ${noteId}${converted ? ', md→html' : ''})`;
    return {
      content: [
        { type: 'text', text: summary },
        { type: 'text', text: JSON.stringify(payload) },
      ],
    };
  } catch (error) {
    logger.error(`Failed to append to note: ${error.message}`);
    const errorPayload = {
      operation: 'append_to_note',
      request: { noteId: args.noteId, format: args.format },
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
      prefix = error.status === 404 ? `Note not found: ${args.noteId}` : `TriliumNext API error: ${error.message}`;
    } else prefix = `Failed to append to note: ${error.message}`;
    return {
      content: [
        { type: 'text', text: prefix },
        { type: 'text', text: JSON.stringify(errorPayload) },
      ],
      isError: true,
    };
  }
}
