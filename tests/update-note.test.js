import { jest } from '@jest/globals';
import { updateNote } from '../src/tools/update-note.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

const payloadOf = (result) => JSON.parse(result.content[1].text);

describe('updateNote', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = { get: jest.fn(), putRaw: jest.fn() };
    jest.clearAllMocks();
  });

  describe('Successful updates', () => {
    test('updates note content with raw format (passthrough)', async () => {
      const noteId = 'note123abc';
      const content = 'Updated content';
      const existingNote = { noteId, title: 'Test', type: 'text', mime: 'text/html' };

      mockClient.get
        .mockResolvedValueOnce(existingNote)
        .mockResolvedValueOnce({ ...existingNote, dateModified: '2024-01-25T15:30:00.000Z' });
      mockClient.putRaw.mockResolvedValueOnce({ success: true });

      const result = await updateNote(mockClient, { noteId, content, format: 'raw' });

      expect(result.isError).toBeFalsy();
      expect(mockClient.putRaw).toHaveBeenCalledWith(`notes/${noteId}/content`, content);
      const payload = payloadOf(result);
      expect(payload.operation).toBe('update_note');
      expect(payload.request.converted).toBe(false);
      expect(payload.result.noteId).toBe(noteId);
    });

    test('converts markdown to HTML for text notes by default', async () => {
      const noteId = 'noteMD';
      const existingNote = { noteId, title: 't', type: 'text', mime: 'text/html' };
      mockClient.get
        .mockResolvedValueOnce(existingNote)
        .mockResolvedValueOnce(existingNote);
      mockClient.putRaw.mockResolvedValueOnce({});

      const result = await updateNote(mockClient, { noteId, content: '# Titolo\n\n**bold**' });

      const sentBody = mockClient.putRaw.mock.calls[0][1];
      expect(sentBody).toContain('<h1');
      expect(sentBody).toContain('<strong>bold</strong>');
      expect(payloadOf(result).request.converted).toBe(true);
    });

    test('skips conversion when type is not text', async () => {
      const noteId = 'noteCode';
      const existingNote = { noteId, title: 't', type: 'code', mime: 'application/javascript' };
      mockClient.get.mockResolvedValueOnce(existingNote).mockResolvedValueOnce(existingNote);
      mockClient.putRaw.mockResolvedValueOnce({});

      await updateNote(mockClient, { noteId, content: '# this is code' });

      expect(mockClient.putRaw).toHaveBeenCalledWith(`notes/${noteId}/content`, '# this is code');
    });

    test('skips conversion when existing mime is markdown', async () => {
      const noteId = 'noteMd';
      const existingNote = { noteId, title: 't', type: 'text', mime: 'text/markdown' };
      mockClient.get.mockResolvedValueOnce(existingNote).mockResolvedValueOnce(existingNote);
      mockClient.putRaw.mockResolvedValueOnce({});

      await updateNote(mockClient, { noteId, content: '# stays markdown' });
      expect(mockClient.putRaw).toHaveBeenCalledWith(`notes/${noteId}/content`, '# stays markdown');
    });

    test('honors format=html passthrough', async () => {
      const noteId = 'noteH';
      const existingNote = { noteId, title: 't', type: 'text', mime: 'text/html' };
      mockClient.get.mockResolvedValueOnce(existingNote).mockResolvedValueOnce(existingNote);
      mockClient.putRaw.mockResolvedValueOnce({});

      await updateNote(mockClient, { noteId, content: '<p>raw html</p>', format: 'html' });
      expect(mockClient.putRaw).toHaveBeenCalledWith(`notes/${noteId}/content`, '<p>raw html</p>');
    });
  });

  describe('Input validation', () => {
    test('rejects empty noteId', async () => {
      const result = await updateNote(mockClient, { noteId: '', content: 'x' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation error');
    });

    test('rejects null content', async () => {
      const result = await updateNote(mockClient, { noteId: 'x', content: null });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation error');
    });

    test('rejects oversize content', async () => {
      const result = await updateNote(mockClient, { noteId: 'x', content: 'A'.repeat(1000001) });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation error');
    });

    test('rejects invalid format', async () => {
      const result = await updateNote(mockClient, { noteId: 'x', content: 'y', format: 'xml' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('format must be one of');
    });
  });

  describe('Note existence and API errors', () => {
    test('handles 404 on existence check', async () => {
      mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Not found', 404));
      const result = await updateNote(mockClient, { noteId: 'x', content: 'y', format: 'raw' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Note not found: x');
      expect(mockClient.putRaw).not.toHaveBeenCalled();
    });

    test('handles null note response as 404', async () => {
      mockClient.get.mockResolvedValueOnce(null);
      const result = await updateNote(mockClient, { noteId: 'x', content: 'y', format: 'raw' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Note not found: x');
    });

    test('handles 403 on update', async () => {
      mockClient.get.mockResolvedValueOnce({ noteId: 'x', type: 'text' });
      mockClient.putRaw.mockRejectedValueOnce(new TriliumAPIError('Forbidden', 403));
      const result = await updateNote(mockClient, { noteId: 'x', content: 'y', format: 'raw' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Access denied');
    });

    test('handles 500 on update', async () => {
      mockClient.get.mockResolvedValueOnce({ noteId: 'x', type: 'text' });
      mockClient.putRaw.mockRejectedValueOnce(new TriliumAPIError('Internal', 500));
      const result = await updateNote(mockClient, { noteId: 'x', content: 'y', format: 'raw' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('TriliumNext API error');
    });

    test('handles network error', async () => {
      mockClient.get.mockResolvedValueOnce({ noteId: 'x', type: 'text' });
      mockClient.putRaw.mockRejectedValueOnce(new Error('Network'));
      const result = await updateNote(mockClient, { noteId: 'x', content: 'y', format: 'raw' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to update note: Network');
    });
  });

  describe('Structured response', () => {
    test('success payload has operation, request, result', async () => {
      mockClient.get.mockResolvedValueOnce({ noteId: 'x', type: 'text', mime: 'text/html' });
      mockClient.get.mockResolvedValueOnce({ noteId: 'x', title: 'T', type: 'text', dateModified: 'now' });
      mockClient.putRaw.mockResolvedValueOnce({});

      const result = await updateNote(mockClient, { noteId: 'x', content: 'plain', format: 'raw' });
      const p = payloadOf(result);
      expect(p.operation).toBe('update_note');
      expect(p.request.noteId).toBe('x');
      expect(p.request.inputLength).toBe(5);
      expect(p.request.storedLength).toBe(5);
      expect(p.result.noteId).toBe('x');
    });

    test('error payload has operation and error type', async () => {
      const result = await updateNote(mockClient, { noteId: 'x', content: null });
      const p = payloadOf(result);
      expect(p.operation).toBe('update_note');
      expect(p.error.type).toBe('ValidationError');
    });
  });
});
