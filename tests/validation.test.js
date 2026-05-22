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
