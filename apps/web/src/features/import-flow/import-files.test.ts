import { describe, expect, it } from 'vitest';
import { collectTfFiles, tfKey } from './import-files';

// jsdom's File has no webkitRelativePath, so we build a minimal stand-in.
function f(name: string, content: string, webkitRelativePath?: string) {
  const file = new File([content], name);
  if (webkitRelativePath !== undefined) {
    Object.defineProperty(file, 'webkitRelativePath', { value: webkitRelativePath, configurable: true });
  }
  return file;
}

describe('tfKey', () => {
  it('prefers the folder-relative path over the bare name', () => {
    const file = f('main.tf', 'x', 'repo/modules/vpc/main.tf');
    expect(tfKey(file)).toBe('repo/modules/vpc/main.tf');
  });

  it('falls back to the name for a plain multi-file pick', () => {
    expect(tfKey(f('main.tf', 'x'))).toBe('main.tf');
  });

  it('treats an empty webkitRelativePath as absent (non-folder picks)', () => {
    expect(tfKey(f('main.tf', 'x', ''))).toBe('main.tf');
  });
});

describe('collectTfFiles', () => {
  it('collects every .tf, keyed by folder-relative path', async () => {
    const files = [
      f('main.tf', 'root', 'repo/main.tf'),
      f('main.tf', 'vpc-module', 'repo/modules/vpc/main.tf'),
      f('main.tf', 'eks-module', 'repo/modules/eks/main.tf'),
      f('outputs.tf', 'out', 'repo/modules/eks/outputs.tf'),
    ];
    const got = await collectTfFiles(files, {});
    expect(got).toEqual({
      'repo/main.tf': 'root',
      'repo/modules/vpc/main.tf': 'vpc-module',
      'repo/modules/eks/main.tf': 'eks-module',
      'repo/modules/eks/outputs.tf': 'out',
    });
  });

  it('ignores non-.tf files in a folder drop', async () => {
    const files = [f('README.md', 'x', 'repo/README.md'), f('main.tf', 'y', 'repo/main.tf'), f('main.tf.json', 'j', 'repo/main.tf.json')];
    const got = await collectTfFiles(files, {});
    expect(Object.keys(got)).toEqual(['repo/main.tf']);
  });

  it("does not overwrite a file already in the pending set (first wins)", async () => {
    const files = [f('main.tf', 'newer', 'repo/main.tf')];
    const got = await collectTfFiles(files, { 'repo/main.tf': 'older' });
    expect(got).toEqual({});
  });

  it('does not double-collect the same key within one pick', async () => {
    const files = [f('a.tf', 'one', 'repo/a.tf'), f('a.tf', 'two', 'repo/a.tf')];
    const got = await collectTfFiles(files, {});
    expect(got).toEqual({ 'repo/a.tf': 'one' });
  });
});