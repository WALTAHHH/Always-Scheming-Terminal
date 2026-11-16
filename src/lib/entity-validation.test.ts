import { describe, it, expect } from 'vitest';
import { isValidUuid } from './entity-validation';

describe('isValidUuid', () => {
  it('accepts canonical lowercase and uppercase UUIDs', () => {
    expect(isValidUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isValidUuid('A0B1C2D3-E4F5-4678-9ABC-DEF012345678')).toBe(true);
  });

  it('accepts the nil UUID (Postgres uuid accepts it)', () => {
    expect(isValidUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
  });

  it('rejects non-UUID strings', () => {
    expect(isValidUuid('ent-1')).toBe(false);
    expect(isValidUuid('')).toBe(false);
    expect(isValidUuid('11111111-1111-4111-8111-11111111111')).toBe(false); // short
    expect(isValidUuid('11111111-1111-4111-8111-1111111111111')).toBe(false); // long
    expect(isValidUuid('zzzzzzzz-1111-4111-8111-111111111111')).toBe(false); // non-hex
    expect(isValidUuid('11111111111141118111111111111111')).toBe(false); // no dashes
  });

  it('rejects non-string values', () => {
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid(42)).toBe(false);
    expect(isValidUuid({})).toBe(false);
  });
});
