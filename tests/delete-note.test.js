import { jest } from '@jest/globals';
import { deleteNote } from '../src/tools/delete-note.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

describe('deleteNote', () => {
  let mockClient;
  beforeEach(() => {
    mockClient = { get: jest.fn(), delete: jest.fn() };
    jest.clearAllMocks();
  });

  test('deletes a leaf note (no children) directly', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'leaf1', childNoteIds: [] });
    mockClient.delete.mockResolvedValueOnce({});

    const result = await deleteNote(mockClient, { noteId: 'leaf1' });

    expect(mockClient.delete).toHaveBeenCalledWith('notes/leaf1');
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[1].text);
    expect(data.result.hadChildren).toBe(false);
  });

  test('refuses subtree delete without confirmCascade', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'parent1', childNoteIds: ['c1'] });

    const result = await deleteNote(mockClient, { noteId: 'parent1' });

    expect(mockClient.delete).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('confirmCascade');
  });

  test('deletes subtree with confirmCascade:true', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'parent1', childNoteIds: ['c1', 'c2'] });
    mockClient.delete.mockResolvedValueOnce({});

    const result = await deleteNote(mockClient, { noteId: 'parent1', confirmCascade: true });

    expect(mockClient.delete).toHaveBeenCalledWith('notes/parent1');
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[1].text);
    expect(data.result.hadChildren).toBe(true);
  });

  test('rejects root deletion', async () => {
    const result = await deleteNote(mockClient, { noteId: 'root' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Cannot delete root');
    expect(mockClient.delete).not.toHaveBeenCalled();
    expect(mockClient.get).not.toHaveBeenCalled();
  });

  test('rejects missing noteId', async () => {
    const result = await deleteNote(mockClient, {});
    expect(result.isError).toBe(true);
  });

  test('handles 404 on note (from GET)', async () => {
    mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await deleteNote(mockClient, { noteId: 'ghost' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Note not found');
    expect(mockClient.delete).not.toHaveBeenCalled();
  });

  test('handles missing childNoteIds field (treated as no children)', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'oddnote' });
    mockClient.delete.mockResolvedValueOnce({});
    const result = await deleteNote(mockClient, { noteId: 'oddnote' });
    expect(result.isError).toBeUndefined();
  });

  test('handles generic TriliumAPIError on DELETE', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n', childNoteIds: [] });
    mockClient.delete.mockRejectedValueOnce(new TriliumAPIError('Server error', 500, {}));
    const result = await deleteNote(mockClient, { noteId: 'n' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('TriliumNext API error');
  });
});
