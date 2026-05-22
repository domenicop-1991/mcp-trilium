import { jest } from '@jest/globals';
import { createAttribute } from '../src/tools/create-attribute.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

describe('createAttribute', () => {
  let mockClient;

  beforeEach(() => {
    mockClient = { get: jest.fn(), post: jest.fn() };
    jest.clearAllMocks();
  });

  test('creates a label successfully', async () => {
    const created = { attributeId: 'a99', noteId: 'n1', type: 'label', name: 'project', value: 'sinapsy', position: 10, isInheritable: false };
    mockClient.post.mockResolvedValueOnce(created);
    const result = await createAttribute(mockClient, { noteId: 'n1', type: 'label', name: 'project', value: 'sinapsy' });
    expect(mockClient.post).toHaveBeenCalledWith('attributes', expect.objectContaining({
      noteId: 'n1', type: 'label', name: 'project', value: 'sinapsy'
    }));
    expect(result.content[0].text).toContain('Attribute created');
    expect(result.isError).toBeUndefined();
  });

  test('creates a relation after verifying target exists', async () => {
    mockClient.get.mockResolvedValueOnce({ noteId: 'n2', title: 'Target' });
    mockClient.post.mockResolvedValueOnce({ attributeId: 'a100', noteId: 'n1', type: 'relation', name: 'related', value: 'n2' });
    const result = await createAttribute(mockClient, { noteId: 'n1', type: 'relation', name: 'related', value: 'n2' });
    expect(mockClient.get).toHaveBeenCalledWith('notes/n2');
    expect(mockClient.post).toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
  });

  test('rejects relation with non-existent target', async () => {
    mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await createAttribute(mockClient, { noteId: 'n1', type: 'relation', name: 'related', value: 'ghost' });
    expect(mockClient.post).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Relation target');
  });

  test('rejects relation without value', async () => {
    const result = await createAttribute(mockClient, { noteId: 'n1', type: 'relation', name: 'related' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Validation error');
  });

  test('rejects invalid name', async () => {
    const result = await createAttribute(mockClient, { noteId: 'n1', type: 'label', name: 'my-label' });
    expect(result.isError).toBe(true);
  });

  test('rejects invalid type', async () => {
    const result = await createAttribute(mockClient, { noteId: 'n1', type: 'foo', name: 'x' });
    expect(result.isError).toBe(true);
  });

  test('handles 404 on noteId at create time', async () => {
    mockClient.post.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await createAttribute(mockClient, { noteId: 'ghost', type: 'label', name: 'x' });
    expect(result.isError).toBe(true);
  });

  test('handles generic TriliumAPIError (500)', async () => {
    mockClient.post.mockRejectedValueOnce(new TriliumAPIError('Server error', 500, {}));
    const result = await createAttribute(mockClient, { noteId: 'n1', type: 'label', name: 'x' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('TriliumNext API error');
  });

  test('rejects non-numeric position', async () => {
    const result = await createAttribute(mockClient, { noteId: 'n1', type: 'label', name: 'x', position: 'high' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Validation error');
    expect(mockClient.post).not.toHaveBeenCalled();
  });
});
