import { jest } from '@jest/globals';
import { listAttributes } from '../src/tools/list-attributes.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

describe('listAttributes', () => {
  let mockClient;

  const mockAttributes = [
    { attributeId: 'a1', noteId: 'n1', type: 'label', name: 'project', value: 'sinapsy', position: 10 },
    { attributeId: 'a2', noteId: 'n1', type: 'label', name: 'priority', value: 'high', position: 20 },
    { attributeId: 'a3', noteId: 'n1', type: 'relation', name: 'related', value: 'n2', position: 30 }
  ];

  beforeEach(() => {
    mockClient = { get: jest.fn() };
    jest.clearAllMocks();
  });

  test('returns all attributes for a note', async () => {
    mockClient.get.mockResolvedValueOnce(mockAttributes);
    const result = await listAttributes(mockClient, { noteId: 'n1' });
    expect(mockClient.get).toHaveBeenCalledWith('notes/n1/attributes');
    expect(result.content[0].text).toContain('3 attribute');
    const data = JSON.parse(result.content[1].text);
    expect(data.result.attributes).toHaveLength(3);
  });

  test('filters by type when provided', async () => {
    mockClient.get.mockResolvedValueOnce(mockAttributes);
    const result = await listAttributes(mockClient, { noteId: 'n1', type: 'relation' });
    const data = JSON.parse(result.content[1].text);
    expect(data.result.attributes).toHaveLength(1);
    expect(data.result.attributes[0].type).toBe('relation');
  });

  test('validation error on missing noteId', async () => {
    const result = await listAttributes(mockClient, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Validation error');
  });

  test('validation error on invalid type', async () => {
    const result = await listAttributes(mockClient, { noteId: 'n1', type: 'foo' });
    expect(result.isError).toBe(true);
  });

  test('handles 404 from API', async () => {
    mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await listAttributes(mockClient, { noteId: 'missing' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Note not found');
  });

  test('handles generic 500', async () => {
    mockClient.get.mockRejectedValueOnce(new TriliumAPIError('Server error', 500, {}));
    const result = await listAttributes(mockClient, { noteId: 'n1' });
    expect(result.isError).toBe(true);
  });

  test('throws when API returns non-array (object)', async () => {
    mockClient.get.mockResolvedValueOnce({ unexpected: 'shape' });
    const result = await listAttributes(mockClient, { noteId: 'n1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unexpected response format');
  });
});
