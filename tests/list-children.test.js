import { jest } from '@jest/globals';
import { listChildren } from '../src/tools/list-children.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

describe('listChildren', () => {
  let mockClient;
  const mockChildren = {
    results: [
      { noteId: 'c1', title: 'Child 1', type: 'text', mime: 'text/html', dateModified: '2026-05-01T00:00:00Z' },
      { noteId: 'c2', title: 'Child 2', type: 'code', mime: 'text/x-javascript', dateModified: '2026-05-02T00:00:00Z' }
    ]
  };

  beforeEach(() => {
    mockClient = { get: jest.fn() };
    jest.clearAllMocks();
  });

  test('lists direct children', async () => {
    mockClient.get.mockResolvedValueOnce(mockChildren);
    const result = await listChildren(mockClient, { noteId: 'parent1' });
    expect(mockClient.get).toHaveBeenCalledWith(expect.stringContaining('ancestorNoteId=parent1'));
    expect(mockClient.get).toHaveBeenCalledWith(expect.stringContaining('ancestorDepth=eq1'));
    const data = JSON.parse(result.content[1].text);
    expect(data.result.children).toHaveLength(2);
    expect(data.result.children[0]).toEqual(expect.objectContaining({ noteId: 'c1', title: 'Child 1' }));
  });

  test('respects limit parameter', async () => {
    mockClient.get.mockResolvedValueOnce(mockChildren);
    await listChildren(mockClient, { noteId: 'parent1', limit: 5 });
    expect(mockClient.get).toHaveBeenCalledWith(expect.stringContaining('limit=5'));
  });

  test('default limit is 50', async () => {
    mockClient.get.mockResolvedValueOnce(mockChildren);
    await listChildren(mockClient, { noteId: 'parent1' });
    expect(mockClient.get).toHaveBeenCalledWith(expect.stringContaining('limit=50'));
  });

  test('handles empty results', async () => {
    mockClient.get.mockResolvedValueOnce({ results: [] });
    const result = await listChildren(mockClient, { noteId: 'leaf' });
    const data = JSON.parse(result.content[1].text);
    expect(data.result.children).toHaveLength(0);
  });

  test('handles array response (some ETAPI versions return bare array)', async () => {
    mockClient.get.mockResolvedValueOnce(mockChildren.results);
    const result = await listChildren(mockClient, { noteId: 'parent1' });
    const data = JSON.parse(result.content[1].text);
    expect(data.result.children).toHaveLength(2);
  });

  test('rejects missing noteId', async () => {
    const result = await listChildren(mockClient, {});
    expect(result.isError).toBe(true);
  });

  test('rejects limit out of range', async () => {
    const result = await listChildren(mockClient, { noteId: 'n', limit: 999 });
    expect(result.isError).toBe(true);
  });

  test('handles 404', async () => {
    mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await listChildren(mockClient, { noteId: 'ghost' });
    expect(result.isError).toBe(true);
  });

  test('handles generic TriliumAPIError', async () => {
    mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Server error', 500, {}));
    const result = await listChildren(mockClient, { noteId: 'n' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('TriliumNext API error');
  });
});
