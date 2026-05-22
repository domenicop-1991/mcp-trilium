import { jest } from '@jest/globals';
import { deleteAttribute } from '../src/tools/delete-attribute.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

describe('deleteAttribute', () => {
  let mockClient;
  beforeEach(() => {
    mockClient = { delete: jest.fn() };
    jest.clearAllMocks();
  });

  test('deletes attribute', async () => {
    mockClient.delete.mockResolvedValueOnce({});
    const result = await deleteAttribute(mockClient, { attributeId: 'a1' });
    expect(mockClient.delete).toHaveBeenCalledWith('attributes/a1');
    expect(result.content[0].text).toContain('Attribute deleted');
    expect(result.isError).toBeUndefined();
  });

  test('rejects missing attributeId', async () => {
    const result = await deleteAttribute(mockClient, {});
    expect(result.isError).toBe(true);
  });

  test('handles 404', async () => {
    mockClient.delete.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await deleteAttribute(mockClient, { attributeId: 'ghost' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Attribute not found');
  });

  test('handles generic TriliumAPIError', async () => {
    mockClient.delete.mockRejectedValueOnce(new TriliumAPIError('Server error', 500, {}));
    const result = await deleteAttribute(mockClient, { attributeId: 'a1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('TriliumNext API error');
  });
});
