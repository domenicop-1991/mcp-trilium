import { setTaskStates, stateIdForSymbol, symbolForStateId, loadTaskStates } from '../src/utils/task-states.js';

describe('task states registry', () => {
  afterEach(() => {
    setTaskStates([
      { stateId: 'doing', symbol: '/' },
      { stateId: 'maybe', symbol: '?' },
      { stateId: 'cancelled', symbol: '-' },
    ]);
  });

  test('ships with the built-in states as defaults', () => {
    expect(stateIdForSymbol('/')).toBe('doing');
    expect(stateIdForSymbol('?')).toBe('maybe');
    expect(stateIdForSymbol('-')).toBe('cancelled');
  });

  test('returns null for unknown symbols', () => {
    expect(stateIdForSymbol('§')).toBe(null);
    expect(symbolForStateId('nonesiste')).toBe(null);
  });

  test('maps in both directions', () => {
    expect(symbolForStateId('doing')).toBe('/');
  });

  test('accepts custom states', () => {
    setTaskStates([{ stateId: '_blocked', symbol: '!' }]);
    expect(stateIdForSymbol('!')).toBe('_blocked');
    expect(symbolForStateId('_blocked')).toBe('!');
  });

  test('replaces previous states instead of merging', () => {
    setTaskStates([{ stateId: '_blocked', symbol: '!' }]);
    expect(stateIdForSymbol('/')).toBe(null);
  });

  test('ignores the reserved done and none symbols', () => {
    setTaskStates([
      { stateId: 'bogus', symbol: 'x' },
      { stateId: 'alsobogus', symbol: ' ' },
    ]);
    expect(stateIdForSymbol('x')).toBe(null);
    expect(stateIdForSymbol(' ')).toBe(null);
  });

  test('ignores malformed entries', () => {
    setTaskStates([
      { stateId: 'nosymbol', symbol: '' },
      { stateId: '', symbol: '@' },
      { stateId: 'toolong', symbol: '>>' },
    ]);
    expect(stateIdForSymbol('@')).toBe(null);
    expect(stateIdForSymbol('>>')).toBe(null);
    expect(symbolForStateId('nosymbol')).toBe(null);
  });
});

describe('loadTaskStates', () => {
  beforeEach(() => {
    setTaskStates([
      { stateId: 'doing', symbol: '/' },
      { stateId: 'maybe', symbol: '?' },
      { stateId: 'cancelled', symbol: '-' },
    ]);
  });

  test('builds the registry from the vault', async () => {
    const client = {
      get: jest.fn(async (endpoint) => {
        if (endpoint === '/notes/_taskStates') return { childNoteIds: ['a', 'b'] };
        const states = {
          '/notes/a': [{ type: 'label', name: 'stateId', value: '_blocked' }, { type: 'label', name: 'markdownSymbol', value: '!' }],
          '/notes/b': [{ type: 'label', name: 'stateId', value: '_waiting' }, { type: 'label', name: 'markdownSymbol', value: '~' }],
        };
        return { attributes: states[endpoint] };
      }),
    };
    await loadTaskStates(client);
    expect(stateIdForSymbol('!')).toBe('_blocked');
    expect(stateIdForSymbol('~')).toBe('_waiting');
  });

  test('keeps the current registry when the vault has no usable states', async () => {
    const client = { get: jest.fn(async () => ({ childNoteIds: [] })) };
    await loadTaskStates(client);
    expect(stateIdForSymbol('/')).toBe('doing');
  });

  test('keeps the current registry when the request fails', async () => {
    const client = { get: jest.fn(async () => { throw new Error('offline'); }) };
    await loadTaskStates(client);
    expect(stateIdForSymbol('/')).toBe('doing');
  });
});
