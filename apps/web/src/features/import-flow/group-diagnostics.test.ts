import { describe, expect, it } from 'vitest';
import { groupDiagnostics } from './group-diagnostics';
import type { components } from '@/lib/types.gen';

type Diagnostic = components['schemas']['Diagnostic'];

const d = (p: Partial<Omit<Diagnostic, 'reason'>>, reason = 'x'): Diagnostic => ({ reason, ...p });

describe('groupDiagnostics', () => {
  it('returns an empty list for no diagnostics', () => {
    expect(groupDiagnostics([])).toEqual([]);
  });

  it('collapses the same reason into one group with a total count', () => {
    const diags = [
      d({ file: 'a.tf' }, '"variable" block not imported yet'),
      d({ file: 'b.tf' }, '"variable" block not imported yet'),
      d({ file: 'a.tf' }, '"variable" block not imported yet'),
      d({ file: 'a.tf' }, '"module" block not imported yet'),
    ];
    const groups = groupDiagnostics(diags);
    expect(groups).toHaveLength(2);
    const vars = groups.find((g) => g.reason === '"variable" block not imported yet');
    expect(vars?.count).toBe(3);
    expect(vars?.files).toHaveLength(2);
  });

  it('sorts reasons by count desc, then lexically', () => {
    const diags = [
      d({ file: 'a.tf' }, 'low'),
      d({ file: 'a.tf' }, 'high'),
      d({ file: 'a.tf' }, 'high'),
      d({ file: 'a.tf' }, 'high'),
      d({ file: 'a.tf' }, 'mid'),
      d({ file: 'a.tf' }, 'mid'),
    ];
    expect(groupDiagnostics(diags).map((g) => g.reason)).toEqual(['high', 'mid', 'low']);
  });

  it('sorts files within a reason by count desc', () => {
    const diags = [
      d({ file: 'modules/eks/main.tf' }, 'r'),
      d({ file: 'modules/eks/main.tf' }, 'r'),
      d({ file: 'modules/vpc/main.tf' }, 'r'),
      d({ file: 'main.tf' }, 'r'),
      d({ file: 'main.tf' }, 'r'),
      d({ file: 'main.tf' }, 'r'),
      d({ file: 'main.tf' }, 'r'),
    ];
    const files = groupDiagnostics(diags)[0].files;
    expect(files.map((f) => [f.file, f.count])).toEqual([
      ['main.tf', 4],
      ['modules/eks/main.tf', 2],
      ['modules/vpc/main.tf', 1],
    ]);
  });

  it('keeps address+attribute on the entries and flags label-bearing groups', () => {
    const diags = [
      d({ file: 'main.tf', address: 'aws_vpc.main', attribute: 'cidr_block' }, 'not a literal or resource reference'),
      d({ file: 'main.tf' }, '"moved" block not imported yet'),
    ];
    const groups = groupDiagnostics(diags);
    const ref = groups.find((g) => g.reason === 'not a literal or resource reference')!;
    const moved = groups.find((g) => g.reason === '"moved" block not imported yet')!;
    expect(ref.files[0].hasLabels).toBe(true);
    expect(ref.files[0].entries[0]).toEqual({ address: 'aws_vpc.main', attribute: 'cidr_block' });
    expect(moved.files[0].hasLabels).toBe(false);
  });

  it('treats a missing file as the empty string', () => {
    const groups = groupDiagnostics([d({}, 'no file')]);
    expect(groups[0].files[0].file).toBe('');
  });
});