import { describe, expect, it } from 'vitest';
import { cleanAlias, colorFor, sanitize } from '../../src/ranking/firebase';

describe('adaptador de Firebase', () => {
  it('limpia apodos: sin controles, espacios colapsados, máximo 20', () => {
    expect(cleanAlias('  El \u0000Pepón\n\n  Mayor ')).toBe('El Pepón Mayor');
    expect(cleanAlias('a'.repeat(40))).toHaveLength(20);
    expect(cleanAlias('🂡'.repeat(25))).toBe('🂡'.repeat(20));
    expect(cleanAlias('‮abc')).toBe('abc');
  });
  it('prepara documentos: sin undefined, sin −0', () => {
    expect(sanitize({ a: undefined, b: -0, c: [1, undefined, { d: -0 }], e: null })).toEqual({ b: 0, c: [1, null, { d: 0 }], e: null });
    expect(Object.is((sanitize({ x: -0 }) as { x: number }).x, 0)).toBe(true);
  });
  it('color estable por id', () => {
    expect(colorFor('abc')).toBe(colorFor('abc'));
    expect(colorFor('abc')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
