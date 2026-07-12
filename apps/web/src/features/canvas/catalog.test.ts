import { describe, expect, it } from 'vitest';
import { humanType } from './catalog';

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
