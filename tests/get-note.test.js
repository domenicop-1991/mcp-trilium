import { jest } from '@jest/globals';
import { getNote } from '../src/tools/get-note.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

function getPayload(result) {
  return JSON.parse(result.content[1].text);
}

describe('getNote', () => {
  let mockTriliumClient;

  beforeEach(() => {
    mockTriliumClient = { get: jest.fn(), getRaw: jest.fn() };
    jest.clearAllMocks();
  });

  describe('successful note retrieval', () => {
    test('returns plain text content unchanged when not HTML', async () => {
      const mockNote = {
        noteId: 'note123',
        title: 'Test Note',
        type: 'text',
        mime: 'text/plain',
        dateCreated: '2024-01-01T10:00:00.000Z',
        dateModified: '2024-01-15T14:30:00.000Z',
        parentNoteIds: ['parent123'],
        childNoteIds: ['child456'],
      };
      const mockContent = 'This is the note content';

      mockTriliumClient.get.mockResolvedValueOnce(mockNote);
      mockTriliumClient.getRaw.mockResolvedValueOnce(mockContent);

      const result = await getNote(mockTriliumClient, { noteId: 'note123' });

      expect(mockTriliumClient.get).toHaveBeenCalledTimes(1);
      expect(mockTriliumClient.get).toHaveBeenNthCalledWith(1, 'notes/note123');
      expect(mockTriliumClient.getRaw).toHaveBeenCalledTimes(1);
      expect(mockTriliumClient.getRaw).toHaveBeenNthCalledWith(1, 'notes/note123/content');

      expect(result.content[0].text).toBe('Note: "Test Note" (text, 24 chars)');
      const payload = getPayload(result);
      expect(payload.operation).toBe('get_note');
      expect(payload.note.noteId).toBe('note123');
      expect(payload.note.title).toBe('Test Note');
      expect(payload.note.content.data).toBe('This is the note content');
      expect(payload.note.content.length).toBe(24);
      expect(payload.note.content.format).toBe('text/plain');
    });

    test('converts HTML content to markdown by default', async () => {
      const mockNote = {
        noteId: 'note123',
        title: 'HTML Note',
        type: 'text',
        mime: 'text/html',
      };
      const mockContent = '<h1>Titolo</h1><p>Ciao <strong>mondo</strong></p>';

      mockTriliumClient.get.mockResolvedValueOnce(mockNote);
      mockTriliumClient.getRaw.mockResolvedValueOnce(mockContent);

      const result = await getNote(mockTriliumClient, { noteId: 'note123' });

      const payload = getPayload(result);
      expect(payload.note.content.format).toBe('text/markdown');
      expect(payload.note.content.data).toContain('# Titolo');
      expect(payload.note.content.data).toContain('**mondo**');
      expect(payload.note.content.data).not.toContain('<h1>');
    });

    test('returns raw HTML when format=html', async () => {
      const mockNote = {
        noteId: 'note123',
        title: 'HTML Note',
        type: 'text',
        mime: 'text/html',
      };
      const html = '<p>Ciao <strong>mondo</strong></p>';

      mockTriliumClient.get.mockResolvedValueOnce(mockNote);
      mockTriliumClient.getRaw.mockResolvedValueOnce(html);

      const result = await getNote(mockTriliumClient, { noteId: 'note123', format: 'html' });
      const payload = getPayload(result);
      expect(payload.note.content.data).toBe(html);
      expect(payload.note.content.format).toBe('text/html');
    });

    test('returns content untouched when format=raw', async () => {
      const mockNote = { noteId: 'note123', title: 'HTML Note', type: 'text', mime: 'text/html' };
      const html = '<p>raw</p>';

      mockTriliumClient.get.mockResolvedValueOnce(mockNote);
      mockTriliumClient.getRaw.mockResolvedValueOnce(html);

      const result = await getNote(mockTriliumClient, { noteId: 'note123', format: 'raw' });
      expect(getPayload(result).note.content.data).toBe(html);
    });

    test('skips content fetch when includeContent=false', async () => {
      const mockNote = { noteId: 'note123', title: 'Test', type: 'text' };
      mockTriliumClient.get.mockResolvedValueOnce(mockNote);

      const result = await getNote(mockTriliumClient, { noteId: 'note123', includeContent: false });

      expect(mockTriliumClient.get).toHaveBeenCalledTimes(1);
      expect(mockTriliumClient.get).toHaveBeenCalledWith('notes/note123');
      expect(mockTriliumClient.getRaw).not.toHaveBeenCalled();
      expect(result.content[0].text).toBe('Note: "Test" (text, metadata only)');
      const payload = getPayload(result);
      expect(payload.note.content).toBeUndefined();
    });

    test('truncates content when maxContentChars is set', async () => {
      const mockNote = { noteId: 'note123', title: 'Long', type: 'text', mime: 'text/plain' };
      const body = 'A'.repeat(500);

      mockTriliumClient.get.mockResolvedValueOnce(mockNote);
      mockTriliumClient.getRaw.mockResolvedValueOnce(body);

      const result = await getNote(mockTriliumClient, { noteId: 'note123', maxContentChars: 100 });
      const payload = getPayload(result);
      expect(payload.note.content.truncated).toBe(true);
      expect(payload.note.content.originalLength).toBe(500);
      expect(payload.note.content.data.length).toBe(100);
      expect(payload.note.content.length).toBe(100);
    });

    test('does not truncate when content is shorter than maxContentChars', async () => {
      const mockNote = { noteId: 'note123', title: 'Short', type: 'text', mime: 'text/plain' };
      const body = 'ABC';

      mockTriliumClient.get.mockResolvedValueOnce(mockNote);
      mockTriliumClient.getRaw.mockResolvedValueOnce(body);

      const result = await getNote(mockTriliumClient, { noteId: 'note123', maxContentChars: 100 });
      const payload = getPayload(result);
      expect(payload.note.content.truncated).toBeUndefined();
      expect(payload.note.content.originalLength).toBeUndefined();
      expect(payload.note.content.data).toBe('ABC');
    });

    test('omits empty/derivable metadata fields', async () => {
      const mockNote = { noteId: 'note123', title: 'Lean', type: 'text' };
      mockTriliumClient.get.mockResolvedValueOnce(mockNote);
      mockTriliumClient.getRaw.mockResolvedValueOnce('x');

      const result = await getNote(mockTriliumClient, { noteId: 'note123' });
      const payload = getPayload(result);
      expect(payload.note.parentNoteIds).toBeUndefined();
      expect(payload.note.childNoteIds).toBeUndefined();
      expect(payload.note.attributes).toBeUndefined();
      expect(payload.note.isProtected).toBeUndefined();
      expect(payload.note.triliumUrl).toBeUndefined();
    });

    test('includes optional metadata when present', async () => {
      const mockNote = {
        noteId: 'note123',
        title: 'Complete',
        type: 'code',
        mime: 'text/javascript',
        isProtected: true,
        parentNoteIds: ['p1', 'p2'],
        childNoteIds: ['c1'],
        attributes: [{ name: 'lang', value: 'javascript' }],
      };
      mockTriliumClient.get.mockResolvedValueOnce(mockNote);
      mockTriliumClient.getRaw.mockResolvedValueOnce('console.log("ok");');

      const result = await getNote(mockTriliumClient, { noteId: 'note123' });
      const payload = getPayload(result);
      expect(payload.note.isProtected).toBe(true);
      expect(payload.note.parentNoteIds).toEqual(['p1', 'p2']);
      expect(payload.note.childNoteIds).toEqual(['c1']);
      expect(payload.note.attributes).toEqual([{ name: 'lang', value: 'javascript' }]);
      expect(payload.note.mime).toBe('text/javascript');
    });

    test('handles binary content', async () => {
      const mockNote = { noteId: 'note123', title: 'Image', type: 'image', mime: 'image/png' };
      const binary = new ArrayBuffer(1024);
      mockTriliumClient.get.mockResolvedValueOnce(mockNote);
      mockTriliumClient.getRaw.mockResolvedValueOnce(binary);

      const result = await getNote(mockTriliumClient, { noteId: 'note123' });
      expect(result.content[0].text).toBe('Note: "Image" (image, binary)');
      const payload = getPayload(result);
      expect(payload.note.content.type).toBe('binary');
      expect(payload.note.content.data).toBeUndefined();
    });

    test('handles empty content', async () => {
      const mockNote = { noteId: 'note123', title: 'Empty', type: 'text', mime: 'text/plain' };
      mockTriliumClient.get.mockResolvedValueOnce(mockNote);
      mockTriliumClient.getRaw.mockResolvedValueOnce('');

      const result = await getNote(mockTriliumClient, { noteId: 'note123' });
      expect(result.content[0].text).toBe('Note: "Empty" (text, 0 chars)');
      const payload = getPayload(result);
      expect(payload.note.content.data).toBe('');
      expect(payload.note.content.length).toBe(0);
    });

    test('handles unicode in title and content', async () => {
      const mockNote = { noteId: 'note123', title: '日本語 🌸', type: 'text', mime: 'text/plain' };
      mockTriliumClient.get.mockResolvedValueOnce(mockNote);
      mockTriliumClient.getRaw.mockResolvedValueOnce('こんにちは 🎌');

      const result = await getNote(mockTriliumClient, { noteId: 'note123' });
      const payload = getPayload(result);
      expect(payload.note.title).toBe('日本語 🌸');
      expect(payload.note.content.data).toBe('こんにちは 🎌');
    });

    test('reports JSON-like content as text, not binary (regression)', async () => {
      const mockNote = { noteId: 'note123', title: 'Code', type: 'code', mime: 'application/json' };
      mockTriliumClient.get.mockResolvedValueOnce(mockNote);
      mockTriliumClient.getRaw.mockResolvedValueOnce('{"k":1}');

      const result = await getNote(mockTriliumClient, { noteId: 'note123' });
      const payload = getPayload(result);

      expect(payload.note.content.type).toBe('text');
      expect(payload.note.content.data).toBe('{"k":1}');
      expect(payload.note.content.length).toBe(7);
      expect(payload.note.content.type).not.toBe('binary');
    });
  });

  describe('input validation', () => {
    test('rejects empty noteId', async () => {
      const result = await getNote(mockTriliumClient, { noteId: '' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation error:');
      expect(mockTriliumClient.get).not.toHaveBeenCalled();
    });

    test('rejects missing noteId', async () => {
      const result = await getNote(mockTriliumClient, {});
      expect(result.isError).toBe(true);
      expect(mockTriliumClient.get).not.toHaveBeenCalled();
    });

    test('rejects invalid format value', async () => {
      const result = await getNote(mockTriliumClient, { noteId: 'note123', format: 'xml' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('format must be one of');
      expect(mockTriliumClient.get).not.toHaveBeenCalled();
    });

    test('rejects negative maxContentChars', async () => {
      const result = await getNote(mockTriliumClient, { noteId: 'note123', maxContentChars: -1 });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('maxContentChars must be a positive integer');
    });

    test('trims whitespace from noteId', async () => {
      mockTriliumClient.get.mockResolvedValueOnce({ noteId: 'note123', title: 'Test' });
      mockTriliumClient.getRaw.mockResolvedValueOnce('Content');
      await getNote(mockTriliumClient, { noteId: '  note123  ' });
      expect(mockTriliumClient.get).toHaveBeenCalledWith('notes/note123');
    });
  });

  describe('API error handling', () => {
    test('handles 404', async () => {
      mockTriliumClient.get.mockRejectedValue(new TriliumAPIError('Note not found', 404));
      const result = await getNote(mockTriliumClient, { noteId: 'x' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Note not found: x');
    });

    test('handles 401', async () => {
      mockTriliumClient.get.mockRejectedValue(new TriliumAPIError('Authentication failed', 401));
      const result = await getNote(mockTriliumClient, { noteId: 'x' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('TriliumNext API error: Authentication failed');
    });

    test('handles network error', async () => {
      mockTriliumClient.get.mockRejectedValue(new Error('Network timeout'));
      const result = await getNote(mockTriliumClient, { noteId: 'x' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to get note: Network timeout');
    });

    test('handles null note response as 404', async () => {
      mockTriliumClient.get.mockResolvedValueOnce(null);
      mockTriliumClient.getRaw.mockResolvedValueOnce('');
      const result = await getNote(mockTriliumClient, { noteId: 'x' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Note not found: x');
    });

    test('includes structured error data', async () => {
      mockTriliumClient.get.mockRejectedValue(new TriliumAPIError('Server error', 500));
      const result = await getNote(mockTriliumClient, { noteId: 'x' });
      const payload = JSON.parse(result.content[1].text);
      expect(payload.operation).toBe('get_note');
      expect(payload.error.type).toBe('TriliumAPIError');
      expect(payload.error.status).toBe(500);
    });
  });
});
