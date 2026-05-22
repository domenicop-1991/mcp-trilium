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
    mockClient = { get: jest.fn(), post: jest.fn(), delete: jest.fn() };
    jest.clearAllMocks();
  });

  test('moves single-branch note', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', parentBranchIds: ['b1'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'old' });
    mockClient.post.mockResolvedValueOnce({ branchId: 'new_b1', noteId: 'n1', parentNoteId: 'new' });
    mockClient.delete.mockResolvedValueOnce({});

    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new' });

    expect(mockClient.post).toHaveBeenCalledWith('branches', expect.objectContaining({ noteId: 'n1', parentNoteId: 'new' }));
    expect(mockClient.delete).toHaveBeenCalledWith('branches/b1');
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[1].text);
    expect(data.result.branchId).toBe('new_b1');
    expect(data.result.oldParentNoteId).toBe('old');
    expect(data.result.newParentNoteId).toBe('new');
  });

  test('multi-branch with explicit branchId', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', parentBranchIds: ['b1', 'b2'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'p1' });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b2', noteId: 'n1', parentNoteId: 'p2' });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b2', noteId: 'n1', parentNoteId: 'p2' });
    mockClient.post.mockResolvedValueOnce({ branchId: 'new_b2', noteId: 'n1', parentNoteId: 'new' });
    mockClient.delete.mockResolvedValueOnce({});

    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new', branchId: 'b2' });

    expect(mockClient.post).toHaveBeenCalledWith('branches', expect.objectContaining({ noteId: 'n1', parentNoteId: 'new' }));
    expect(mockClient.delete).toHaveBeenCalledWith('branches/b2');
    expect(result.isError).toBeUndefined();
  });

  test('multi-branch with oldParentNoteId resolves correct branch', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', parentBranchIds: ['b1', 'b2'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'p1' });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b2', noteId: 'n1', parentNoteId: 'p2' });
    mockClient.post.mockResolvedValueOnce({ branchId: 'new_b2', noteId: 'n1', parentNoteId: 'new' });
    mockClient.delete.mockResolvedValueOnce({});

    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new', oldParentNoteId: 'p2' });

    expect(mockClient.post).toHaveBeenCalledWith('branches', expect.objectContaining({ noteId: 'n1', parentNoteId: 'new' }));
    expect(mockClient.delete).toHaveBeenCalledWith('branches/b2');
    expect(result.isError).toBeUndefined();
  });

  test('multi-branch without disambiguation errors with hint', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', parentBranchIds: ['b1', 'b2'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'p1' });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b2', noteId: 'n1', parentNoteId: 'p2' });

    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('multiple branches');
    expect(mockClient.post).not.toHaveBeenCalled();
    expect(mockClient.delete).not.toHaveBeenCalled();
  });

  test('rejects missing newParentNoteId', async () => {
    const result = await moveNote(mockClient, { noteId: 'n1' });
    expect(result.isError).toBe(true);
  });

  test('rejects branchId not owned by note', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', parentBranchIds: ['b1'] });
    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new', branchId: 'b99' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('does not belong');
  });

  test('handles 404 on note', async () => {
    mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await moveNote(mockClient, { noteId: 'ghost', newParentNoteId: 'new' });
    expect(result.isError).toBe(true);
  });

  test('handles 409 conflict (cycle) on POST branch', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', parentBranchIds: ['b1'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'old' });
    mockClient.post.mockRejectedValueOnce(new TriliumAPIError('Conflict', 409, { message: 'cycle' }));
    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'descendant' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Conflict');
  });

  test('handles generic TriliumAPIError on POST branch', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n1', parentBranchIds: ['b1'] });
    mockClient.get.mockResolvedValueOnce({ branchId: 'b1', noteId: 'n1', parentNoteId: 'old' });
    mockClient.post.mockRejectedValueOnce(new TriliumAPIError('Server error', 500, {}));
    const result = await moveNote(mockClient, { noteId: 'n1', newParentNoteId: 'new' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to move note');
  });
});
