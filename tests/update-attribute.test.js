import { jest } from '@jest/globals';
import { updateAttribute } from '../src/tools/update-attribute.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn() }
}));

describe('updateAttribute', () => {
  let mockClient;
  beforeEach(() => {
    mockClient = { patch: jest.fn() };
    jest.clearAllMocks();
  });

  test('updates value only', async () => {
    mockClient.patch.mockResolvedValueOnce({ attributeId: 'a1', value: 'newval', position: 10 });
    const result = await updateAttribute(mockClient, { attributeId: 'a1', value: 'newval' });
    expect(mockClient.patch).toHaveBeenCalledWith('attributes/a1', { value: 'newval' });
    expect(result.isError).toBeUndefined();
  });

  test('updates position only', async () => {
    mockClient.patch.mockResolvedValueOnce({ attributeId: 'a1', value: 'x', position: 99 });
    const result = await updateAttribute(mockClient, { attributeId: 'a1', position: 99 });
    expect(mockClient.patch).toHaveBeenCalledWith('attributes/a1', { position: 99 });
    expect(result.isError).toBeUndefined();
  });

  test('updates both value and position', async () => {
    mockClient.patch.mockResolvedValueOnce({});
    const result = await updateAttribute(mockClient, { attributeId: 'a1', value: 'v', position: 5 });
    expect(mockClient.patch).toHaveBeenCalledWith('attributes/a1', { value: 'v', position: 5 });
    expect(result.isError).toBeUndefined();
  });

  test('rejects when no fields to update', async () => {
    const result = await updateAttribute(mockClient, { attributeId: 'a1' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Validation error');
  });

  test('rejects missing attributeId', async () => {
    const result = await updateAttribute(mockClient, { value: 'x' });
    expect(result.isError).toBe(true);
  });

  test('rejects non-numeric position', async () => {
    const result = await updateAttribute(mockClient, { attributeId: 'a1', position: 'high' });
    expect(result.isError).toBe(true);
    expect(mockClient.patch).not.toHaveBeenCalled();
  });

  test('handles 404', async () => {
    mockClient.patch.mockRejectedValueOnce(new TriliumAPIError('Resource not found', 404, {}));
    const result = await updateAttribute(mockClient, { attributeId: 'ghost', value: 'x' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Attribute not found');
  });

  test('handles generic TriliumAPIError', async () => {
    mockClient.patch.mockRejectedValueOnce(new TriliumAPIError('Server error', 500, {}));
    const result = await updateAttribute(mockClient, { attributeId: 'a1', value: 'x' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('TriliumNext API error');
  });
});
