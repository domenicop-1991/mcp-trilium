import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';
import { htmlToMarkdown, isHtmlContent } from '../utils/html-to-markdown.js';

const VALID_FORMATS = ['markdown', 'html', 'raw'];

function parseFormat(value) {
  if (value === undefined || value === null) return 'markdown';
  if (typeof value !== 'string' || !VALID_FORMATS.includes(value)) {
    throw new ValidationError(`format must be one of: ${VALID_FORMATS.join(', ')}`);
  }
  return value;
}

function parseMaxContentChars(value) {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  if (isNaN(n) || n < 1) {
    throw new ValidationError('maxContentChars must be a positive integer');
  }
  return n;
}

function buildErrorResponse(operation, args, error) {
  const errorPayload = {
    operation,
    request: { noteId: args.noteId },
    error: {
      type: error.constructor.name,
      message: error.message,
      ...(error instanceof TriliumAPIError && { status: error.status }),
      ...(error instanceof TriliumAPIError && error.details && { details: error.details }),
    },
  };

  let prefix;
  if (error instanceof ValidationError) {
    prefix = `Validation error: ${error.message}`;
  } else if (error instanceof TriliumAPIError) {
    prefix = error.status === 404
      ? `Note not found: ${args.noteId}`
      : `TriliumNext API error: ${error.message}`;
  } else {
    prefix = `Failed to get note: ${error.message}`;
  }

  return {
    content: [
      { type: 'text', text: prefix },
      { type: 'text', text: JSON.stringify(errorPayload) },
    ],
    isError: true,
  };
}

export async function getNote(triliumClient, args) {
  try {
    const noteId = validators.noteId(args.noteId);
    const format = parseFormat(args.format);
    const includeContent = args.includeContent !== false;
    const maxContentChars = parseMaxContentChars(args.maxContentChars);

    logger.debug(`Getting note: noteId="${noteId}" format=${format} includeContent=${includeContent}`);

    const requests = [triliumClient.get(`notes/${noteId}`)];
    if (includeContent) {
      requests.push(triliumClient.getRaw(`notes/${noteId}/content`));
    }
    const results = await Promise.all(requests);
    const note = results[0];
    const rawContent = includeContent ? results[1] : undefined;

    if (!note) {
      throw new TriliumAPIError('Note not found', 404);
    }

    logger.info(`Retrieved note: ${note.title || 'Untitled'} (${noteId})`);

    const noteData = {
      noteId,
      title: note.title || 'Untitled',
      type: note.type || 'text',
    };
    if (note.mime) noteData.mime = note.mime;
    if (note.isProtected) noteData.isProtected = true;
    if (note.isDeleted) noteData.isDeleted = true;
    if (note.dateCreated) noteData.dateCreated = note.dateCreated;
    if (note.dateModified) noteData.dateModified = note.dateModified;
    if (note.parentNoteIds && note.parentNoteIds.length) noteData.parentNoteIds = note.parentNoteIds;
    if (note.childNoteIds && note.childNoteIds.length) noteData.childNoteIds = note.childNoteIds;
    if (note.attributes && note.attributes.length) noteData.attributes = note.attributes;

    let contentLabel = 'metadata only';

    if (includeContent) {
      const isString = typeof rawContent === 'string';
      const contentObj = {
        type: isString ? 'text' : 'binary',
        length: isString ? rawContent.length : 0,
      };

      if (isString) {
        let body = rawContent;
        let resolvedFormat = note.mime || 'text/plain';
        const sourceIsHtml = isHtmlContent(body, { mime: note.mime, type: note.type });

        if (format === 'markdown' && sourceIsHtml) {
          body = htmlToMarkdown(body, { mime: note.mime, type: note.type });
          resolvedFormat = 'text/markdown';
        } else if (format === 'html') {
          resolvedFormat = sourceIsHtml ? (note.mime || 'text/html') : (note.mime || 'text/plain');
        } else if (format === 'raw') {
          resolvedFormat = note.mime || 'text/plain';
        }

        if (maxContentChars !== undefined && body.length > maxContentChars) {
          contentObj.originalLength = body.length;
          contentObj.truncated = true;
          body = body.slice(0, maxContentChars);
        }

        contentObj.format = resolvedFormat;
        contentObj.data = body;
        contentObj.length = body.length;
        contentLabel = `${body.length} chars`;
      } else {
        contentLabel = 'binary';
      }

      noteData.content = contentObj;
    }

    const summary = `Note: "${noteData.title}" (${noteData.type}, ${contentLabel})`;
    const payload = {
      operation: 'get_note',
      summary,
      note: noteData,
    };

    return {
      content: [
        { type: 'text', text: summary },
        { type: 'text', text: JSON.stringify(payload) },
      ],
    };
  } catch (error) {
    logger.error(`Failed to get note: ${error.message}`);
    return buildErrorResponse('get_note', args, error);
  }
}
