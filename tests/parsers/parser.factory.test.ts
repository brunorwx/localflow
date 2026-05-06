import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectAndParseCiFiles, parseExplicitFile } from '../../src/parsers/parser.factory.js';

const TMP = join(tmpdir(), 'localflow-test-' + process.pid);

const GHA_YAML = `
jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: node:20
    steps:
      - run: npm ci
`;

const GITLAB_YAML = `
image: python:3.12
build:
  script:
    - pip install -r requirements.txt
`;

beforeAll(() => {
  mkdirSync(join(TMP, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(TMP, '.github', 'workflows', 'ci.yml'), GHA_YAML);
  writeFileSync(join(TMP, '.gitlab-ci.yml'), GITLAB_YAML);
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('detectAndParseCiFiles', () => {
  it('finds both GitHub Actions and GitLab CI files', () => {
    const files = detectAndParseCiFiles(TMP);
    const sources = files.map(f => f.pipeline.source);
    expect(sources).toContain('github-actions');
    expect(sources).toContain('gitlab-ci');
  });

  it('returns an empty array when no CI files exist', () => {
    const empty = join(tmpdir(), 'localflow-empty-' + process.pid);
    mkdirSync(empty, { recursive: true });
    try {
      expect(detectAndParseCiFiles(empty)).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it('parses jobs correctly from detected files', () => {
    const files = detectAndParseCiFiles(TMP);
    const gha = files.find(f => f.pipeline.source === 'github-actions')!;
    expect(gha.pipeline.jobs.has('build')).toBe(true);
    expect(gha.pipeline.jobs.get('build')!.image).toBe('node:20');
  });
});

describe('parseExplicitFile', () => {
  it('detects a GitHub Actions file by jobs key', () => {
    const path = join(TMP, '.github', 'workflows', 'ci.yml');
    const result = parseExplicitFile(path);
    expect(result.pipeline.source).toBe('github-actions');
    expect(result.pipeline.jobs.has('build')).toBe(true);
  });

  it('detects a GitLab CI file when no jobs key present', () => {
    const path = join(TMP, '.gitlab-ci.yml');
    const result = parseExplicitFile(path);
    expect(result.pipeline.source).toBe('gitlab-ci');
    expect(result.pipeline.jobs.has('build')).toBe(true);
  });

  it('throws when the file does not exist', () => {
    expect(() => parseExplicitFile('/nonexistent/path/ci.yml')).toThrow();
  });
});
