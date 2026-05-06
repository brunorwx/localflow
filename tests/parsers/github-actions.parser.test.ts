import { describe, it, expect } from 'vitest';
import { GitHubActionsParser } from '../../src/parsers/github-actions.parser.js';

const parser = new GitHubActionsParser();
const FILE = 'workflow.yml';

describe('GitHubActionsParser', () => {
  it('parses a job with container image object', () => {
    const yaml = `
jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: node:20
    steps:
      - name: Install
        run: npm ci
`;
    const pipeline = parser.parse(FILE, yaml);
    const job = pipeline.jobs.get('build')!;
    expect(job.image).toBe('node:20');
    expect(job.steps).toHaveLength(1);
    expect(job.steps[0].run).toBe('npm ci');
    expect(job.steps[0].name).toBe('Install');
  });

  it('parses a job with container as plain string', () => {
    const yaml = `
jobs:
  build:
    runs-on: ubuntu-latest
    container: python:3.12
    steps:
      - run: python --version
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.get('build')!.image).toBe('python:3.12');
  });

  it('defaults to ubuntu:22.04 when no container is specified', () => {
    const yaml = `
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.get('lint')!.image).toBe('ubuntu:22.04');
  });

  it('normalizes needs as a string into an array', () => {
    const yaml = `
jobs:
  test:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - run: npm test
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.get('test')!.needs).toEqual(['build']);
  });

  it('preserves needs when already an array', () => {
    const yaml = `
jobs:
  deploy:
    runs-on: ubuntu-latest
    needs: [build, test]
    steps:
      - run: ./deploy.sh
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.get('deploy')!.needs).toEqual(['build', 'test']);
  });

  it('captures uses steps without run', () => {
    const yaml = `
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: npm run build
`;
    const pipeline = parser.parse(FILE, yaml);
    const steps = pipeline.jobs.get('build')!.steps;
    expect(steps[0].uses).toBe('actions/checkout@v4');
    expect(steps[0].run).toBeUndefined();
    expect(steps[1].run).toBe('npm run build');
  });

  it('strips GHA expressions from env values', () => {
    const yaml = `
jobs:
  build:
    runs-on: ubuntu-latest
    env:
      TOKEN: \${{ secrets.NPM_TOKEN }}
      PLAIN: hello
    steps:
      - run: echo done
`;
    const pipeline = parser.parse(FILE, yaml);
    const env = pipeline.jobs.get('build')!.env;
    expect(env['TOKEN']).toBe('');
    expect(env['PLAIN']).toBe('hello');
  });

  it('uses job name field when present', () => {
    const yaml = `
jobs:
  build_job:
    name: Build the project
    runs-on: ubuntu-latest
    steps:
      - run: make
`;
    const pipeline = parser.parse(FILE, yaml);
    const job = pipeline.jobs.get('build_job')!;
    expect(job.id).toBe('build_job');
    expect(job.name).toBe('Build the project');
  });

  it('handles multiple jobs', () => {
    const yaml = `
jobs:
  build:
    runs-on: ubuntu-latest
    container: node:20
    steps:
      - run: npm ci
  test:
    runs-on: ubuntu-latest
    container: node:20
    needs: [build]
    steps:
      - run: npm test
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.size).toBe(2);
    expect(pipeline.source).toBe('github-actions');
  });

  it('returns empty jobs map for empty jobs section', () => {
    const yaml = `
jobs: {}
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.size).toBe(0);
  });

  it('passes through step shell field', () => {
    const yaml = `
jobs:
  build:
    runs-on: ubuntu-latest
    container: node:20
    steps:
      - run: npm ci
        shell: bash
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.get('build')!.steps[0].shell).toBe('bash');
  });
});
