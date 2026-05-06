import { describe, it, expect } from 'vitest';
import { buildScript, normalizeBindPath } from '../../src/runner/docker.runner.js';
import type { Job } from '../../src/parsers/types.js';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'test',
    name: 'test',
    image: 'node:20',
    env: {},
    steps: [],
    ...overrides,
  };
}

describe('normalizeBindPath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizeBindPath('C:\\Users\\dev\\project')).toBe('C:/Users/dev/project');
  });

  it('leaves forward-slash paths unchanged', () => {
    expect(normalizeBindPath('/home/dev/project')).toBe('/home/dev/project');
  });

  it('handles mixed slashes', () => {
    expect(normalizeBindPath('C:\\Users/dev\\project')).toBe('C:/Users/dev/project');
  });
});

describe('buildScript', () => {
  it('joins run steps into a single script prefixed with set -e', () => {
    const job = makeJob({
      steps: [
        { run: 'npm ci' },
        { run: 'npm run build' },
      ],
    });
    const { script } = buildScript(job);
    expect(script).toMatch(/^set -e\n/);
    expect(script).toContain('npm ci');
    expect(script).toContain('npm run build');
  });

  it('inserts echo headers for named steps', () => {
    const job = makeJob({
      steps: [{ name: 'Install', run: 'npm ci' }],
    });
    const { script } = buildScript(job);
    expect(script).toContain('echo "--- Install ---"');
    expect(script).toContain('npm ci');
    const headerIndex = script.indexOf('echo "--- Install ---"');
    const cmdIndex = script.indexOf('npm ci');
    expect(headerIndex).toBeLessThan(cmdIndex);
  });

  it('skips uses steps', () => {
    const job = makeJob({
      steps: [
        { uses: 'actions/checkout@v4' },
        { run: 'npm ci' },
      ],
    });
    const { script } = buildScript(job);
    expect(script).not.toContain('actions/checkout');
    expect(script).toContain('npm ci');
  });

  it('defaults to sh shell', () => {
    const job = makeJob({ steps: [{ run: 'make' }] });
    expect(buildScript(job).shell).toBe('sh');
  });

  it('picks shell from the first step that specifies one', () => {
    const job = makeJob({
      steps: [
        { run: 'npm ci', shell: 'bash' },
        { run: 'npm test' },
      ],
    });
    expect(buildScript(job).shell).toBe('bash');
  });

  it('returns empty script when all steps are uses', () => {
    const job = makeJob({
      steps: [
        { uses: 'actions/checkout@v4' },
        { uses: 'actions/setup-node@v4' },
      ],
    });
    expect(buildScript(job).script.trim()).toBe('');
  });

  it('escapes double quotes in step names', () => {
    const job = makeJob({
      steps: [{ name: 'Say "hello"', run: 'echo hi' }],
    });
    const { script } = buildScript(job);
    expect(script).not.toMatch(/echo "--- Say "hello" ---"/);
    expect(script).toContain("Say 'hello'");
  });
});
