import { describe, expect, it } from 'vitest';
import { attrSchema, attrSpec, defaultAttrValue, SCHEMA_TYPES } from './schema';
import { catalog } from './catalog';
import { connectionRule } from './connection';
import { nestRule } from './containment';
import { isValidName } from './validation';

const TYPES = catalog.map((c) => c.type);

// The attribute names a type gets from a gesture, not from typing: connection
// references where it is the dependent, plus its containment scoping attribute.
function ownedAttrs(type: string): Set<string> {
  const owned = new Set<string>();
  for (const other of TYPES) {
    const rule = connectionRule(type, other);
    if (rule && rule.from === type) owned.add(rule.attribute);
  }
  const nest = nestRule(type)?.attribute;
  if (nest) owned.add(nest);
  return owned;
}

describe('attribute schema', () => {
  it('only describes real catalog types', () => {
    for (const type of SCHEMA_TYPES) expect(TYPES).toContain(type);
  });

  it('gives every argument a valid identifier name and a coherent enum/type', () => {
    for (const type of SCHEMA_TYPES) {
      for (const spec of attrSchema(type)) {
        expect(isValidName(spec.name)).toBe(true);
        if (spec.enum) {
          expect(spec.type).toBe('string');
          expect(spec.enum.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('never suggests an argument that a connection or containment produces', () => {
    // A gesture-owned argument typed here would be silently overwritten by
    // deriveRefs at projection time — this guard fails the build if one slips in.
    for (const type of SCHEMA_TYPES) {
      const owned = ownedAttrs(type);
      for (const spec of attrSchema(type)) {
        expect(owned.has(spec.name)).toBe(false);
      }
    }
  });

  it('seeds a valid default value for every argument', () => {
    for (const type of SCHEMA_TYPES) {
      for (const spec of attrSchema(type)) {
        const v = defaultAttrValue(spec);
        expect(v.kind).toBe('literal');
        const wantLit = spec.type === 'number' ? 'number' : spec.type === 'bool' ? 'bool' : 'string';
        expect(v.litType).toBe(wantLit);
        if (spec.enum) expect(spec.enum).toContain(v.value);
      }
    }
  });

  it('orders required arguments first', () => {
    for (const type of SCHEMA_TYPES) {
      const specs = attrSchema(type);
      const firstOptional = specs.findIndex((s) => !s.required);
      if (firstOptional === -1) continue;
      // No required spec may appear after the first optional one.
      expect(specs.slice(firstOptional).some((s) => s.required)).toBe(false);
    }
  });

  it('resolves a known argument and misses an unknown one', () => {
    expect(attrSpec('aws_vpc', 'cidr_block')?.required).toBe(true);
    expect(attrSpec('aws_vpc', 'not_a_real_arg')).toBeUndefined();
  });
});
