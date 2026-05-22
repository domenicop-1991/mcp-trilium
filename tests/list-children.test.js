import { jest } from '@jest/globals';
import { listChildren } from '../src/tools/list-children.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

describe('listChildren', () => {
  let mockClient;

  const noteWithChildren = {
    noteId: 'parent1',
    title: 'Parent',
    type: 'text',
    childNoteIds: ['c1', 'c2'],
    childBranchIds: ['p_c1', 'p_c2']
  };

  const childNote1 = { noteId: 'c1', title: 'Child 1', type: 'text', mime: 'text/html', dateModified: '2026-05-01T00:00:00Z' };
  const childNote2 = { noteId: 'c2', title: 'Child 2', type: 'code', mime: 'text/x-javascript', dateModified: '2026-05-02T00:00:00Z' };

  beforeEach(() => {
    mockClient = { get: jest.fn() };
    jest.clearAllMocks();
  });

  test('lists direct children via childNoteIds', async () => {
    mockClient.get
      .mockResolvedValueOnce(noteWithChildren)
      .mockResolvedValueOnce(childNote1)
      .mockResolvedValueOnce(childNote2);

    const result = await listChildren(mockClient, { noteId: 'parent1' });

    expect(mockClient.get).toHaveBeenNthCalledWith(1, 'notes/parent1');
    expect(mockClient.get).toHaveBeenNthCalledWith(2, 'notes/c1');
    expect(mockClient.get).toHaveBeenNthCalledWith(3, 'notes/c2');
    const data = JSON.parse(result.content[1].text);
    expect(data.result.children).toHaveLength(2);
    expect(data.result.children[0]).toEqual(expect.objectContaining({ noteId: 'c1', title: 'Child 1' }));
  });

  test('respects limit parameter', async () => {
    mockClient.get
      .mockResolvedValueOnce(noteWithChildren)
      .mockResolvedValueOnce(childNote1);

    await listChildren(mockClient, { noteId: 'parent1', limit: 1 });

    expect(mockClient.get).toHaveBeenCalledTimes(2);
    const secondCall = mockClient.get.mock.calls[1][0];
    expect(secondCall).toBe('notes/c1');
  });

  test('handles note with no children', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'leaf', title: 'Leaf', type: 'text', childNoteIds: [] });

    const result = await listChildren(mockClient, { noteId: 'leaf' });
    const data = JSON.parse(result.content[1].text);
    expect(data.result.children).toHaveLength(0);
    expect(data.result.count).toBe(0);
    expect(mockClient.get).toHaveBeenCalledTimes(1);
  });

  test('handles note missing childNoteIds field', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', title: 'No children field', type: 'text' });

    const result = await listChildren(mockClient, { noteId: 'n1' });
    const data = JSON.parse(result.content[1].text);
    expect(data.result.children).toHaveLength(0);
  });

  test('rejects missing noteId', async () => {
    const result = await listChildren(mockClient, {});
    expect(result.isError).toBe(true);
  });

  test('rejects limit out of range', async () => {
    const result = await listChildren(mockClient, { noteId: 'n', limit: 999 });
    expect(result.isError).toBe(true);
  });

  test('handles 404 on parent note', async () => {
    mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await listChildren(mockClient, { noteId: 'ghost' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Note not found');
  });

  test('handles generic TriliumAPIError', async () => {
    mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Server error', 500, {}));
    const result = await listChildren(mockClient, { noteId: 'n' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('TriliumNext API error');
  });
});
