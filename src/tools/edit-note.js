import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';
import { markdownToHtml, shouldConvertMarkdown } from '../utils/md-to-html.js';

function countOccurrences(haystack, needle) {
  if (needle === '') return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

function replaceFirst(haystack, needle, replacement) {
  const parts = haystack.split(needle);
  return parts[0] + replacement + parts.slice(1).join(needle);
}

export async function editNote(triliumClient, args) {
  try {
    const noteId = validators.noteId(args.noteId);
    if (typeof args.oldString !== 'string' || args.oldString.length === 0) {
      throw new ValidationError('oldString must be a non-empty string');
    }
    if (typeof args.newString !== 'string') {
      throw new ValidationError('newString must be a string');
    }
    validators.content(args.oldString);
    validators.content(args.newString);
    const format = validators.contentFormat(args.format);
    const replaceAll = validators.boolean(args.replaceAll, 'replaceAll') || false;

    logger.debug(`Editing note: noteId="${noteId}" format=${format} replaceAll=${replaceAll}`);

    const note = await triliumClient.get(`notes/${noteId}`);
    if (!note) throw new TriliumAPIError('Note not found', 404);

    const existing = await triliumClient.getRaw(`notes/${noteId}/content`);
    if (typeof existing !== 'string') {
      throw new TriliumAPIError('Cannot edit binary note content', 415);
    }

    const convertible = format === 'markdown' && shouldConvertMarkdown({ type: note.type, mime: note.mime });

    let search = args.oldString;
    let replacement = args.newString;
    let matchedAs = 'literal';

    if (convertible) {
      const oldHtml = markdownToHtml(args.oldString, { type: note.type, mime: note.mime });
      const htmlCount = oldHtml !== args.oldString ? countOccurrences(existing, oldHtml) : 0;
      if (htmlCount > 0) {
        const literalCount = countOccurrences(existing, args.oldString);
        if (literalCount > htmlCount && !replaceAll) {
          throw new ValidationError(
            `oldString is ambiguous: it matches ${htmlCount} block occurrence(s) but also appears ${literalCount} time(s) inline. Use format='html' with an exact fragment (fetch it via get_note format=html), or pass a more specific string.`
          );
        }
        search = oldHtml;
        replacement = markdownToHtml(args.newString, { type: note.type, mime: note.mime });
        matchedAs = 'markdown';
      }
    }

    const occurrences = countOccurrences(existing, search);
    if (occurrences === 0) {
      throw new ValidationError(
        'oldString not found in note content. Fetch the exact fragment with get_note (format=html for surgical edits) and check whitespace/markup.'
      );
    }
    if (occurrences > 1 && !replaceAll) {
      throw new ValidationError(
        `oldString found ${occurrences} times; provide a more specific string or pass replaceAll=true.`
      );
    }

    const newContent = replaceAll
      ? existing.split(search).join(replacement)
      : replaceFirst(existing, search, replacement);

    await triliumClient.putRaw(`notes/${noteId}/content`, newContent);
    const replacedCount = replaceAll ? occurrences : 1;
    logger.info(`Edited note ${noteId} (matchedAs=${matchedAs}, replaced=${replacedCount})`);

    const payload = {
      operation: 'edit_note',
      request: { noteId, format, replaceAll, matchedAs },
      result: {
        noteId,
        title: note.title || 'Untitled',
        replaced: replacedCount,
        storedLength: newContent.length,
      },
    };
    const summary = `Edited "${note.title || 'Untitled'}" (ID: ${noteId}, ${replacedCount}×, matched ${matchedAs})`;
    return {
      content: [
        { type: 'text', text: summary },
        { type: 'text', text: JSON.stringify(payload) },
      ],
    };
  } catch (error) {
    logger.error(`Failed to edit note: ${error.message}`);
    const errorPayload = {
      operation: 'edit_note',
      request: { noteId: args.noteId, format: args.format, replaceAll: args.replaceAll },
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
    } else prefix = `Failed to edit note: ${error.message}`;
    return {
      content: [
        { type: 'text', text: prefix },
        { type: 'text', text: JSON.stringify(errorPayload) },
      ],
      isError: true,
    };
  }
}
