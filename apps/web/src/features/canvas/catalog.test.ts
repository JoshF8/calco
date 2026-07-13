import { describe, expect, it } from 'vitest';
import { catalog, groupOrder, humanType } from './catalog';
import { iconByType } from './icons';
import en from '@/locales/en.json';
import es from '@/locales/es.json';

describe('humanType', () => {
  it('drops a known provider prefix and title-cases the rest', () => {
    expect(humanType('aws_security_group_rule')).toBe('Security Group Rule');
    expect(humanType('aws_key_pair')).toBe('Key Pair');
    expect(humanType('aws_vpc')).toBe('Vpc');
  });

  it('keeps a non-provider first segment', () => {
    expect(humanType('null_resource')).toBe('Null Resource');
    expect(humanType('random_string')).toBe('Random String');
  });

  it('handles a bare type without underscores', () => {
    expect(humanType('mailgun')).toBe('Mailgun');
  });
});

describe('catalog parity', () => {
  const types = catalog.map((c) => c.type);
  const enRes = (en as { palette: { resource: Record<string, string> } }).palette.resource;
  const esRes = (es as { palette: { resource: Record<string, string> } }).palette.resource;
  const enGroup = (en as { palette: { group: Record<string, string> } }).palette.group;
  const esGroup = (es as { palette: { group: Record<string, string> } }).palette.group;

  it('every catalog type has a curated icon and an en + es label', () => {
    const problems: string[] = [];
    for (const t of types) {
      if (!(t in iconByType)) problems.push(`${t}: no icon`);
      if (!(t in enRes)) problems.push(`${t}: no en label`);
      if (!(t in esRes)) problems.push(`${t}: no es label`);
    }
    expect(problems).toEqual([]);
  });

  it('has no orphan icon or label (defined for a non-catalog type)', () => {
    const known = new Set(types);
    expect(Object.keys(iconByType).filter((t) => !known.has(t))).toEqual([]);
    expect(Object.keys(enRes).filter((t) => !known.has(t))).toEqual([]);
    expect(Object.keys(esRes).filter((t) => !known.has(t))).toEqual([]);
  });

  it('every group in groupOrder has an en + es label, and en/es keys match', () => {
    for (const g of groupOrder) {
      expect(enGroup, g).toHaveProperty(g);
      expect(esGroup, g).toHaveProperty(g);
    }
    expect(Object.keys(enRes)).toEqual(Object.keys(esRes)); // resource label parity
  });
});
