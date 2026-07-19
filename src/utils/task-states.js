import { logger } from './logger.js';

const DEFAULT_STATES = [
  { stateId: 'doing', symbol: '/' },
  { stateId: 'maybe', symbol: '?' },
  { stateId: 'cancelled', symbol: '-' },
];

let symbolToState = new Map();
let stateToSymbol = new Map();

export function setTaskStates(states) {
  symbolToState = new Map();
  stateToSymbol = new Map();
  for (const { stateId, symbol } of states) {
    if (!stateId || !symbol || symbol.length !== 1) continue;
    if (symbol === ' ' || symbol === 'x') continue;
    symbolToState.set(symbol, stateId);
    stateToSymbol.set(stateId, symbol);
  }
}

setTaskStates(DEFAULT_STATES);

export function stateIdForSymbol(symbol) {
  return symbolToState.get(symbol) ?? null;
}

export function symbolForStateId(stateId) {
  return stateToSymbol.get(stateId) ?? null;
}

export async function loadTaskStates(client) {
  try {
    const parent = await client.get('/notes/_taskStates');
    const childIds = parent?.childNoteIds ?? [];
    const states = [];
    for (const childId of childIds) {
      const note = await client.get(`/notes/${childId}`);
      const label = (name) =>
        note?.attributes?.find((a) => a.type === 'label' && a.name === name)?.value;
      states.push({ stateId: label('stateId'), symbol: label('markdownSymbol') });
    }
    const usable = states.filter((s) => s.stateId && s.symbol);
    if (!usable.length) {
      logger.warn('No usable task states found under _taskStates, keeping defaults');
      return;
    }
    setTaskStates(usable);
    logger.info(`Loaded ${usable.length} task states: ${usable.map((s) => `${s.symbol}=${s.stateId}`).join(', ')}`);
  } catch (error) {
    logger.warn(`Could not load task states, keeping defaults: ${error.message}`);
  }
}
