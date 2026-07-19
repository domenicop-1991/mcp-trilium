import { jest } from '@jest/globals';
import { editNote } from '../src/tools/edit-note.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

describe('editNote', () => {
  let client;
  beforeEach(() => {
    client = {
      get: jest.fn(() =>
        Promise.resolve({ noteId: 'n1', type: 'text', mime: 'text/html', title: 'T' })),
      getRaw: jest.fn(() => Promise.resolve('<p>alpha</p><p>beta</p>')),
      putRaw: jest.fn(() => Promise.resolve()),
    };
    jest.clearAllMocks();
  });

  test('replaces a block-level fragment matched via markdown conversion', async () => {
    const res = await editNote(client, { noteId: 'n1', oldString: 'alpha', newString: 'gamma' });
    const written = client.putRaw.mock.calls[0];
    expect(written[0]).toBe('notes/n1/content');
    expect(written[1]).toBe('<p>gamma</p><p>beta</p>');
    expect(res.isError).toBeUndefined();
  });

  test('literal fallback when markdown form is not present', async () => {
    client.getRaw = jest.fn(() => Promise.resolve('<p>hello world</p>'));
    await editNote(client, { noteId: 'n1', oldString: 'world', newString: 'there' });
    expect(client.putRaw.mock.calls[0][1]).toBe('<p>hello there</p>');
  });

  test('raw format does no conversion and matches literally', async () => {
    client.getRaw = jest.fn(() => Promise.resolve('a**b**c'));
    await editNote(client, { noteId: 'n1', oldString: '**b**', newString: '**x**', format: 'raw' });
    expect(client.putRaw.mock.calls[0][1]).toBe('a**x**c');
  });

  test('empty newString deletes the fragment', async () => {
    client.getRaw = jest.fn(() => Promise.resolve('keep-DROP-keep'));
    await editNote(client, { noteId: 'n1', oldString: '-DROP-', newString: '', format: 'raw' });
    expect(client.putRaw.mock.calls[0][1]).toBe('keepkeep');
  });

  test('errors when oldString not found', async () => {
    const res = await editNote(client, { noteId: 'n1', oldString: 'missing', newString: 'x' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not found/i);
    expect(client.putRaw).not.toHaveBeenCalled();
  });

  test('errors on ambiguous multiple matches without replaceAll', async () => {
    client.getRaw = jest.fn(() => Promise.resolve('x-y-x-y'));
    const res = await editNote(client, { noteId: 'n1', oldString: 'x', newString: 'z', format: 'raw' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/found 2 times/);
    expect(client.putRaw).not.toHaveBeenCalled();
  });

  test('replaceAll replaces every occurrence', async () => {
    client.getRaw = jest.fn(() => Promise.resolve('x-y-x-y'));
    await editNote(client, { noteId: 'n1', oldString: 'x', newString: 'z', format: 'raw', replaceAll: true });
    expect(client.putRaw.mock.calls[0][1]).toBe('z-y-z-y');
  });

  test('replacement containing $ is inserted literally (no regex specials)', async () => {
    client.getRaw = jest.fn(() => Promise.resolve('price: OLD'));
    await editNote(client, { noteId: 'n1', oldString: 'OLD', newString: '$1.50 & up', format: 'raw' });
    expect(client.putRaw.mock.calls[0][1]).toBe('price: $1.50 & up');
  });

  test('returns 404 when note does not exist', async () => {
    client.get = jest.fn(() => Promise.reject(new TriliumAPIError('Note not found', 404)));
    const res = await editNote(client, { noteId: 'ghost', oldString: 'a', newString: 'b' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not found/i);
    expect(client.putRaw).not.toHaveBeenCalled();
  });

  test('rejects empty oldString with ValidationError', async () => {
    const res = await editNote(client, { noteId: 'n1', oldString: '', newString: 'b' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Validation error/);
    expect(client.putRaw).not.toHaveBeenCalled();
  });

  test('errors on cross-form ambiguity (block match unique but literal also inline)', async () => {
    client.getRaw = jest.fn(() => Promise.resolve('<p>alpha</p><p>foo alpha bar</p>'));
    const res = await editNote(client, { noteId: 'n1', oldString: 'alpha', newString: 'gamma' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/ambiguous/i);
    expect(client.putRaw).not.toHaveBeenCalled();
  });

  test('replaceAll bypasses cross-form ambiguity and replaces every block occurrence', async () => {
    client.getRaw = jest.fn(() => Promise.resolve('<p>alpha</p><p>alpha</p>'));
    await editNote(client, { noteId: 'n1', oldString: 'alpha', newString: 'gamma', replaceAll: true });
    expect(client.putRaw.mock.calls[0][1]).toBe('<p>gamma</p><p>gamma</p>');
  });

  test('rejects binary note content with a clear error', async () => {
    client.getRaw = jest.fn(() => Promise.resolve(Buffer.from([0x00, 0x01])));
    const res = await editNote(client, { noteId: 'n1', oldString: 'a', newString: 'b', format: 'raw' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/binary/i);
    expect(client.putRaw).not.toHaveBeenCalled();
  });

  test('newString containing oldString does not re-match (single pass)', async () => {
    client.getRaw = jest.fn(() => Promise.resolve('<p>a</p>'));
    await editNote(client, { noteId: 'n1', oldString: 'a', newString: 'a and more a', replaceAll: true });
    expect(client.putRaw.mock.calls[0][1]).toBe('<p>a and more a</p>');
  });

  test('does not corrupt surrounding content on JSON-like body (regression)', async () => {
    client.getRaw = jest.fn(() => Promise.resolve('{"a":1,"b":2}'));
    await editNote(client, { noteId: 'n1', oldString: '"b":2', newString: '"b":3', format: 'raw' });
    expect(client.putRaw.mock.calls[0][1]).toBe('{"a":1,"b":3}');
  });
});
