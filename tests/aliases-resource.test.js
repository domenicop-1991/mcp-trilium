import { jest } from '@jest/globals';
import { writeFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getAliasesResource } from '../src/resources/aliases.js';

jest.mock('../src/utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }
}));

function parse(res) {
  return JSON.parse(res.contents[0].text);
}

describe('getAliasesResource', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'aliases-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  test('reads a valid JSON alias file', () => {
    const f = join(dir, 'a.json');
    writeFileSync(f, JSON.stringify({ diario: 'JOwA3qQfctr3', convenzioni: 'msYV2ZwJq50O' }));
    const res = getAliasesResource(f);
    expect(res.contents[0].uri).toBe('trilium://aliases');
    const data = parse(res);
    expect(data.aliases).toEqual({ diario: 'JOwA3qQfctr3', convenzioni: 'msYV2ZwJq50O' });
    expect(data.count).toBe(2);
  });

  test('returns empty map when path is undefined', () => {
    const data = parse(getAliasesResource(undefined));
    expect(data.aliases).toEqual({});
    expect(data.count).toBe(0);
  });

  test('returns empty map when file does not exist', () => {
    const data = parse(getAliasesResource(join(dir, 'missing.json')));
    expect(data.aliases).toEqual({});
  });

  test('returns empty map on malformed JSON', () => {
    const f = join(dir, 'bad.json');
    writeFileSync(f, '{ not valid json');
    const data = parse(getAliasesResource(f));
    expect(data.aliases).toEqual({});
  });
});
