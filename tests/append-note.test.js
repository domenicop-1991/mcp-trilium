import { jest } from '@jest/globals';
import { appendNote } from '../src/tools/append-note.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

describe('appendNote', () => {
  let client;
  beforeEach(() => {
    client = {
      get: jest.fn(() =>
        Promise.resolve({ noteId: 'n1', type: 'text', mime: 'text/html', title: 'T' })),
      getRaw: jest.fn(() => Promise.resolve('<p>existing</p>')),
      putRaw: jest.fn(() => Promise.resolve()),
    };
    jest.clearAllMocks();
  });

  test('appends markdown converted to HTML onto existing content', async () => {
    const res = await appendNote(client, { noteId: 'n1', content: 'nuova riga' });
    const written = client.putRaw.mock.calls[0];
    expect(written[0]).toBe('notes/n1/content');
    expect(written[1]).toContain('<p>existing</p>');
    expect(written[1]).toContain('nuova riga');
    expect(written[1].startsWith('<p>existing</p>')).toBe(true);
    expect(res.isError).toBeUndefined();
  });

  test('handles empty existing content (first append)', async () => {
    client.get = jest.fn(() => Promise.resolve({ noteId: 'n1', type: 'text', mime: 'text/html' }));
    client.getRaw = jest.fn(() => Promise.resolve(''));
    await appendNote(client, { noteId: 'n1', content: 'prima' });
    expect(client.putRaw.mock.calls[0][1]).toContain('prima');
  });

  test('does not convert when format is raw', async () => {
    await appendNote(client, { noteId: 'n1', content: '**x**', format: 'raw' });
    expect(client.putRaw.mock.calls[0][1]).toContain('**x**');
  });

  test('returns 404 error when note does not exist', async () => {
    client.get = jest.fn(() => Promise.reject(new TriliumAPIError('Note not found', 404)));
    const res = await appendNote(client, { noteId: 'ghost', content: 'x' });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/not found/i);
    expect(client.putRaw).not.toHaveBeenCalled();
  });

  test('rejects invalid content with ValidationError', async () => {
    const res = await appendNote(client, { noteId: 'n1', content: null });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/Validation error/);
  });

  test('does not lose content when existing note content is JSON-like text (regression)', async () => {
    client.getRaw = jest.fn(() => Promise.resolve('{"k":1}'));
    await appendNote(client, { noteId: 'n1', content: 'addendum', format: 'raw' });
    expect(client.putRaw.mock.calls[0][1]).toBe('{"k":1}addendum');
  });
});
