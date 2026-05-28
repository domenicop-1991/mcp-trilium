import { jest } from '@jest/globals';
import { createNote } from '../src/tools/create-note.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

const payloadOf = (result) => JSON.parse(result.content[1].text);

describe('createNote', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = { post: jest.fn() };
    jest.clearAllMocks();
  });

  describe('successful note creation', () => {
    test('creates basic text note with raw passthrough', async () => {
      const mockNote = { noteId: 'n1', title: 'T', type: 'text' };
      mockClient.post.mockResolvedValue({ note: mockNote });

      const result = await createNote(mockClient, {
        title: 'T',
        content: '<p>html</p>',
        format: 'raw',
        parentNoteId: 'root',
      });

      expect(result.isError).toBeFalsy();
      expect(mockClient.post).toHaveBeenCalledWith(
        'create-note',
        expect.objectContaining({ title: 'T', content: '<p>html</p>', parentNoteId: 'root', type: 'text' })
      );
      expect(payloadOf(result).result.noteId).toBe('n1');
    });

    test('converts markdown to HTML for text notes by default', async () => {
      mockClient.post.mockResolvedValue({ note: { noteId: 'nMD', title: 'T', type: 'text' } });

      const result = await createNote(mockClient, {
        title: 'T',
        content: '# Heading\n\n**bold**',
        parentNoteId: 'root',
      });

      const body = mockClient.post.mock.calls[0][1];
      expect(body.content).toContain('<h1');
      expect(body.content).toContain('<strong>bold</strong>');
      expect(body.mime).toBe('text/html');
      expect(payloadOf(result).request.converted).toBe(true);
    });

    test('skips conversion for non-text types', async () => {
      mockClient.post.mockResolvedValue({ note: { noteId: 'm1', title: 'Diagram', type: 'mermaid' } });

      await createNote(mockClient, {
        title: 'Diagram',
        content: 'graph TD;A-->B;',
        type: 'mermaid',
        parentNoteId: 'root',
      });

      const body = mockClient.post.mock.calls[0][1];
      expect(body.content).toBe('graph TD;A-->B;');
      expect(body.type).toBe('mermaid');
    });

    test('skips conversion when mime is text/markdown', async () => {
      mockClient.post.mockResolvedValue({ note: { noteId: 'm', title: 'MD', type: 'text' } });

      await createNote(mockClient, {
        title: 'MD',
        content: '# stays markdown',
        type: 'text',
        mime: 'text/markdown',
        parentNoteId: 'root',
      });

      const body = mockClient.post.mock.calls[0][1];
      expect(body.content).toBe('# stays markdown');
      expect(body.mime).toBe('text/markdown');
    });

    test('honors format=html passthrough', async () => {
      mockClient.post.mockResolvedValue({ note: { noteId: 'h', title: 'H', type: 'text' } });
      await createNote(mockClient, { title: 'H', content: '<p>x</p>', format: 'html', parentNoteId: 'root' });
      const body = mockClient.post.mock.calls[0][1];
      expect(body.content).toBe('<p>x</p>');
    });

    test('defaults parentNoteId to root', async () => {
      mockClient.post.mockResolvedValue({ note: { noteId: 'r', title: 'T', type: 'text' } });
      await createNote(mockClient, { title: 'T', content: 'x', format: 'raw' });
      const body = mockClient.post.mock.calls[0][1];
      expect(body.parentNoteId).toBe('root');
    });

    test('preserves additional API response fields', async () => {
      const mockNote = { noteId: 'p', title: 'T', type: 'text', extraField: 'value' };
      mockClient.post.mockResolvedValue({ note: mockNote });
      const result = await createNote(mockClient, { title: 'T', content: 'x', format: 'raw', parentNoteId: 'root' });
      expect(payloadOf(result).result.noteId).toBe('p');
    });
  });

  describe('input validation', () => {
    const invalidCases = [
      { label: 'empty title', args: { title: '', content: 'x', format: 'raw' } },
      { label: 'whitespace title', args: { title: '   ', content: 'x', format: 'raw' } },
      { label: 'long title', args: { title: 'A'.repeat(201), content: 'x', format: 'raw' } },
      { label: 'non-string title', args: { title: 123, content: 'x', format: 'raw' } },
      { label: 'null title', args: { title: null, content: 'x', format: 'raw' } },
      { label: 'non-string content', args: { title: 'T', content: 123, format: 'raw' } },
      { label: 'invalid type', args: { title: 'T', content: 'x', type: 'unknown', format: 'raw' } },
      { label: 'invalid format', args: { title: 'T', content: 'x', format: 'xml' } },
    ];

    test.each(invalidCases)('rejects $label', async ({ args }) => {
      const result = await createNote(mockClient, args);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation error');
      expect(mockClient.post).not.toHaveBeenCalled();
    });

    test('accepts valid note types', async () => {
      const validTypes = ['text', 'code', 'mermaid', 'canvas', 'book'];
      for (const type of validTypes) {
        mockClient.post.mockResolvedValue({ note: { noteId: type, title: 't', type } });
        const result = await createNote(mockClient, { title: 't', content: 'x', type, format: 'raw', parentNoteId: 'root' });
        expect(result.isError).toBeFalsy();
      }
    });

    test('trims whitespace from title', async () => {
      mockClient.post.mockResolvedValue({ note: { noteId: 'a', title: 'Trimmed', type: 'text' } });
      await createNote(mockClient, { title: '  Trimmed  ', content: 'x', format: 'raw', parentNoteId: 'root' });
      const body = mockClient.post.mock.calls[0][1];
      expect(body.title).toBe('Trimmed');
    });
  });

  describe('API error handling', () => {
    test('handles TriliumAPIError', async () => {
      mockClient.post.mockRejectedValue(new TriliumAPIError('Server error', 500));
      const result = await createNote(mockClient, { title: 'T', content: 'x', format: 'raw', parentNoteId: 'root' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('TriliumNext API error');
      expect(payloadOf(result).error.status).toBe(500);
    });

    test('handles auth error', async () => {
      mockClient.post.mockRejectedValue(new TriliumAPIError('Authentication failed', 401));
      const result = await createNote(mockClient, { title: 'T', content: 'x', format: 'raw', parentNoteId: 'root' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('TriliumNext API error');
    });

    test('handles invalid API response (missing noteId)', async () => {
      mockClient.post.mockResolvedValue({});
      const result = await createNote(mockClient, { title: 'T', content: 'x', format: 'raw', parentNoteId: 'root' });
      expect(result.isError).toBe(true);
    });

    test('handles network error', async () => {
      mockClient.post.mockRejectedValue(new Error('Network'));
      const result = await createNote(mockClient, { title: 'T', content: 'x', format: 'raw', parentNoteId: 'root' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Note creation failed: Network');
    });

    test('includes error context in payload', async () => {
      mockClient.post.mockRejectedValue(new TriliumAPIError('Err', 500));
      const result = await createNote(mockClient, { title: 'T', content: 'x', format: 'raw', parentNoteId: 'root' });
      const p = payloadOf(result);
      expect(p.operation).toBe('create_note');
      expect(p.request.title).toBe('T');
      expect(p.error.type).toBe('TriliumAPIError');
    });
  });

  describe('edge cases', () => {
    test('handles very long content', async () => {
      const longContent = 'A'.repeat(50000);
      mockClient.post.mockResolvedValue({ note: { noteId: 'L', title: 'L', type: 'text' } });
      const result = await createNote(mockClient, { title: 'L', content: longContent, format: 'raw', parentNoteId: 'root' });
      expect(result.isError).toBeFalsy();
      expect(payloadOf(result).request.inputLength).toBe(50000);
    });

    test('handles unicode in title and content', async () => {
      mockClient.post.mockResolvedValue({ note: { noteId: 'u', title: '日本語 🌸', type: 'text' } });
      const result = await createNote(mockClient, { title: '日本語 🌸', content: 'こんにちは', format: 'raw', parentNoteId: 'root' });
      expect(result.isError).toBeFalsy();
    });

    test('handles empty content', async () => {
      mockClient.post.mockResolvedValue({ note: { noteId: 'e', title: 'E', type: 'text' } });
      const result = await createNote(mockClient, { title: 'E', content: '', format: 'raw', parentNoteId: 'root' });
      expect(result.isError).toBeFalsy();
    });
  });

  describe('mime parameter', () => {
    test('passes mime to API when provided', async () => {
      mockClient.post.mockResolvedValue({ note: { noteId: 'n', title: 'T', type: 'text', mime: 'text/markdown' } });
      await createNote(mockClient, { title: 'T', content: '# h', type: 'text', mime: 'text/markdown', parentNoteId: 'root' });
      const body = mockClient.post.mock.calls[0][1];
      expect(body.mime).toBe('text/markdown');
    });

    test('omits mime from body when not provided and no conversion needed', async () => {
      mockClient.post.mockResolvedValue({ note: { noteId: 'n', title: 'T', type: 'text' } });
      await createNote(mockClient, { title: 'T', content: 'x', format: 'raw', parentNoteId: 'root' });
      const body = mockClient.post.mock.calls[0][1];
      expect(body).not.toHaveProperty('mime');
    });
  });
});
