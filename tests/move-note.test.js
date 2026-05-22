import { jest } from '@jest/globals';
import { moveNote } from '../src/tools/move-note.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

describe('moveNote', () => {
  let mockClient;
  beforeEach(() => {
    mockClient = { get: jest.fn(), put: jest.fn() };
    jest.clearAllMocks();
  });

  test('moves single-branch note', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', branchIds: ['b1'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'old' });
    mockClient.put.mockResolvedValueOnce({ branchId: 'b1', parentNoteId: 'new' });

    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new' });

    expect(mockClient.put).toHaveBeenCalledWith('branches/b1', { parentNoteId: 'new' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[1].text);
    expect(data.result.branchId).toBe('b1');
    expect(data.result.oldParentNoteId).toBe('old');
    expect(data.result.newParentNoteId).toBe('new');
  });

  test('multi-branch with explicit branchId', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', branchIds: ['b1', 'b2'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'p1' });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b2', noteId: 'n1', parentNoteId: 'p2' });
    mockClient.put.mockResolvedValueOnce({});

    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new', branchId: 'b2' });

    expect(mockClient.put).toHaveBeenCalledWith('branches/b2', { parentNoteId: 'new' });
    expect(result.isError).toBeUndefined();
  });

  test('multi-branch with oldParentNoteId resolves correct branch', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', branchIds: ['b1', 'b2'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'p1' });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b2', noteId: 'n1', parentNoteId: 'p2' });
    mockClient.put.mockResolvedValueOnce({});

    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new', oldParentNoteId: 'p2' });

    expect(mockClient.put).toHaveBeenCalledWith('branches/b2', { parentNoteId: 'new' });
    expect(result.isError).toBeUndefined();
  });

  test('multi-branch without disambiguation errors with hint', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', branchIds: ['b1', 'b2'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'p1' });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b2', noteId: 'n1', parentNoteId: 'p2' });

    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('multiple branches');
    expect(mockClient.put).not.toHaveBeenCalled();
  });

  test('rejects missing newParentNoteId', async () => {
    const result = await moveNote(mockClient, { noteId: 'n1' });
    expect(result.isError).toBe(true);
  });

  test('rejects branchId not owned by note', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', branchIds: ['b1'] });
    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new', branchId: 'b99' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('does not belong');
  });

  test('handles 404 on note', async () => {
    mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await moveNote(mockClient, { noteId: 'ghost', newParentNoteId: 'new' });
    expect(result.isError).toBe(true);
  });

  test('handles 409 conflict (cycle)', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', branchIds: ['b1'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'old' });
    mockClient.put.mockRejectedValueOnce(new TriliumAPIError('Conflict', 409, { message: 'cycle' }));
    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'descendant' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Conflict');
  });

  test('handles generic TriliumAPIError', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', branchIds: ['b1'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'old' });
    mockClient.put.mockRejectedValueOnce(new TriliumAPIError('Server error', 500, {}));
    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to move note');
  });
});
