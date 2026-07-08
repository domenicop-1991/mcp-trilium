import { validators, ValidationError } from '../src/utils/validation.js';

describe('validators.attributeId', () => {
  test('returns trimmed string for valid id', () => {
    expect(validators.attributeId('attr123')).toBe('attr123');
    expect(validators.attributeId('  attr123  ')).toBe('attr123');
  });

  test('throws for empty or non-string', () => {
    expect(() => validators.attributeId('')).toThrow(ValidationError);
    expect(() => validators.attributeId(null)).toThrow(ValidationError);
    expect(() => validators.attributeId(123)).toThrow(ValidationError);
  });
});

describe('validators.attributeType', () => {
  test('accepts label and relation', () => {
    expect(validators.attributeType('label')).toBe('label');
    expect(validators.attributeType('relation')).toBe('relation');
  });

  test('throws for other values', () => {
    expect(() => validators.attributeType('foo')).toThrow(ValidationError);
    expect(() => validators.attributeType(null)).toThrow(ValidationError);
    expect(() => validators.attributeType('')).toThrow(ValidationError);
  });

  test('trims whitespace', () => {
    expect(validators.attributeType('  label  ')).toBe('label');
    expect(validators.attributeType('  relation  ')).toBe('relation');
  });
});

describe('validators.attributeName', () => {
  test('accepts alphanumeric with underscore', () => {
    expect(validators.attributeName('myLabel')).toBe('myLabel');
    expect(validators.attributeName('my_label_2')).toBe('my_label_2');
    expect(validators.attributeName('  trim_me  ')).toBe('trim_me');
  });

  test('throws for special chars', () => {
    expect(() => validators.attributeName('my-label')).toThrow(ValidationError);
    expect(() => validators.attributeName('my label')).toThrow(ValidationError);
    expect(() => validators.attributeName('#tag')).toThrow(ValidationError);
    expect(() => validators.attributeName('')).toThrow(ValidationError);
  });
});

describe('validators.branchId', () => {
  test('returns trimmed string for valid id', () => {
    expect(validators.branchId('branch123')).toBe('branch123');
    expect(validators.branchId('  branch123  ')).toBe('branch123');
  });

  test('throws for empty or non-string', () => {
    expect(() => validators.branchId('')).toThrow(ValidationError);
    expect(() => validators.branchId(undefined)).toThrow(ValidationError);
    expect(() => validators.branchId(null)).toThrow(ValidationError);
    expect(() => validators.branchId(123)).toThrow(ValidationError);
  });
});

describe('validators.noteType (extended)', () => {
  test('accepts all 18 valid types', () => {
    const types = ['file', 'image', 'search', 'noteMap', 'launcher', 'doc', 'contentWidget',
      'text', 'relationMap', 'render', 'canvas', 'mermaid', 'book', 'webView',
      'code', 'mindMap', 'spreadsheet', 'llmChat'];
    for (const t of types) {
      expect(validators.noteType(t)).toBe(t);
    }
  });

  test('rejects unknown type', () => {
    expect(() => validators.noteType('markdown')).toThrow(ValidationError);
    expect(() => validators.noteType('html')).toThrow(ValidationError);
  });

  test('defaults to text when undefined', () => {
    expect(validators.noteType(undefined)).toBe('text');
  });
});

describe('validators.mime', () => {
  test('returns undefined when not provided', () => {
    expect(validators.mime(undefined)).toBe(undefined);
    expect(validators.mime(null)).toBe(undefined);
  });

  test('trims and returns valid mime', () => {
    expect(validators.mime('text/markdown')).toBe('text/markdown');
    expect(validators.mime('  application/json  ')).toBe('application/json');
  });

  test('throws on non-string', () => {
    expect(() => validators.mime(123)).toThrow(ValidationError);
  });

  test('throws on empty string', () => {
    expect(() => validators.mime('   ')).toThrow(ValidationError);
  });

  test('throws on too long', () => {
    expect(() => validators.mime('a'.repeat(101))).toThrow(ValidationError);
  });
});

describe('orderDirection', () => {
  test('returns undefined when absent', () => {
    expect(validators.orderDirection(undefined)).toBeUndefined();
    expect(validators.orderDirection(null)).toBeUndefined();
  });
  test('accepts asc/desc case-insensitive and normalizes', () => {
    expect(validators.orderDirection('asc')).toBe('asc');
    expect(validators.orderDirection('DESC')).toBe('desc');
  });
  test('throws on invalid value', () => {
    expect(() => validators.orderDirection('sideways')).toThrow(ValidationError);
  });
});

describe('boolean', () => {
  test('returns undefined when absent', () => {
    expect(validators.boolean(undefined)).toBeUndefined();
    expect(validators.boolean(null)).toBeUndefined();
  });
  test('passes through native booleans', () => {
    expect(validators.boolean(true)).toBe(true);
    expect(validators.boolean(false)).toBe(false);
  });
  test('coerces string true/false', () => {
    expect(validators.boolean('true')).toBe(true);
    expect(validators.boolean('false')).toBe(false);
  });
  test('throws on non-boolean', () => {
    expect(() => validators.boolean('yes', 'fastSearch')).toThrow(ValidationError);
  });
});

describe('searchField', () => {
  test('returns undefined when absent or blank', () => {
    expect(validators.searchField(undefined)).toBeUndefined();
    expect(validators.searchField('   ')).toBeUndefined();
  });
  test('accepts allowed charset', () => {
    expect(validators.searchField('dateModified')).toBe('dateModified');
    expect(validators.searchField('note.title')).toBe('note.title');
    expect(validators.searchField('#priorita')).toBe('#priorita');
  });
  test('throws on invalid charset', () => {
    expect(() => validators.searchField('title; DROP', 'orderBy')).toThrow(ValidationError);
  });
  test('throws when longer than 100 chars', () => {
    expect(() => validators.searchField('a'.repeat(101), 'orderBy')).toThrow(ValidationError);
  });
});
