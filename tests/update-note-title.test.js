import { jest } from '@jest/globals';
import { updateNoteTitle } from '../src/tools/update-note-title.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

describe('updateNoteTitle', () => {
  let mockClient;
  beforeEach(() => {
    mockClient = { patch: jest.fn() };
    jest.clearAllMocks();
  });

  test('renames note successfully', async () => {
    mockClient.patch.mockResolvedValueOnce({ noteId: 'n1', title: 'New Title', type: 'text' });
    const result = await updateNoteTitle(mockClient, { noteId: 'n1', title: 'New Title' });
    expect(mockClient.patch).toHaveBeenCalledWith('notes/n1', { title: 'New Title' });
    expect(result.content[0].text).toContain('Note title updated');
    expect(result.content[0].text).toContain('New Title');
    expect(result.isError).toBeUndefined();
  });

  test('rejects missing noteId', async () => {
    const result = await updateNoteTitle(mockClient, { title: 'X' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Validation error');
    expect(mockClient.patch).not.toHaveBeenCalled();
  });

  test('rejects missing title', async () => {
    const result = await updateNoteTitle(mockClient, { noteId: 'n1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Validation error');
    expect(mockClient.patch).not.toHaveBeenCalled();
  });

  test('rejects empty title', async () => {
    const result = await updateNoteTitle(mockClient, { noteId: 'n1', title: '   ' });
    expect(result.isError).toBe(true);
  });

  test('rejects title > 200 chars', async () => {
    const result = await updateNoteTitle(mockClient, { noteId: 'n1', title: 'a'.repeat(201) });
    expect(result.isError).toBe(true);
  });

  test('handles 404', async () => {
    mockClient.patch.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await updateNoteTitle(mockClient, { noteId: 'ghost', title: 'X' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Note not found');
  });

  test('handles generic TriliumAPIError', async () => {
    mockClient.patch.mockRejectedValueOnce(new TriliumAPIError('Server error', 500, {}));
    const result = await updateNoteTitle(mockClient, { noteId: 'n1', title: 'X' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('TriliumNext API error');
  });
});
