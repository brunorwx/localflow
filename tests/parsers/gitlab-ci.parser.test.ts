import { describe, it, expect } from 'vitest';
import { GitLabCiParser } from '../../src/parsers/gitlab-ci.parser.js';

const parser = new GitLabCiParser();
const FILE = '.gitlab-ci.yml';

describe('GitLabCiParser', () => {
  it('parses a basic job with script', () => {
    const yaml = `
build:
  image: node:20
  script:
    - npm ci
    - npm run build
`;
    const pipeline = parser.parse(FILE, yaml);
    const job = pipeline.jobs.get('build')!;
    expect(job.image).toBe('node:20');
    expect(job.steps).toHaveLength(2);
    expect(job.steps[0].run).toBe('npm ci');
    expect(job.steps[1].run).toBe('npm run build');
  });

  it('falls back to global image when job has none', () => {
    const yaml = `
image: python:3.12

build:
  script:
    - python setup.py build
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.get('build')!.image).toBe('python:3.12');
  });

  it('defaults to ubuntu:22.04 when no image anywhere', () => {
    const yaml = `
build:
  script:
    - make
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.get('build')!.image).toBe('ubuntu:22.04');
  });

  it('job image overrides global image', () => {
    const yaml = `
image: node:18

test:
  image: node:20
  script:
    - npm test
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.get('test')!.image).toBe('node:20');
  });

  it('accepts image as object with name field', () => {
    const yaml = `
build:
  image:
    name: node:20
  script:
    - npm ci
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.get('build')!.image).toBe('node:20');
  });

  it('merges global variables into job env', () => {
    const yaml = `
variables:
  GLOBAL: value1

build:
  variables:
    LOCAL: value2
  script:
    - echo done
`;
    const pipeline = parser.parse(FILE, yaml);
    const env = pipeline.jobs.get('build')!.env;
    expect(env['GLOBAL']).toBe('value1');
    expect(env['LOCAL']).toBe('value2');
  });

  it('job variables override global variables', () => {
    const yaml = `
variables:
  KEY: global

build:
  variables:
    KEY: local
  script:
    - echo done
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.get('build')!.env['KEY']).toBe('local');
  });

  it('prepends global before_script to steps', () => {
    const yaml = `
before_script:
  - export PATH="$HOME/.local/bin:$PATH"

build:
  script:
    - make
`;
    const pipeline = parser.parse(FILE, yaml);
    const steps = pipeline.jobs.get('build')!.steps;
    expect(steps[0].run).toBe('export PATH="$HOME/.local/bin:$PATH"');
    expect(steps[1].run).toBe('make');
  });

  it('job before_script overrides global before_script', () => {
    const yaml = `
before_script:
  - global setup

build:
  before_script:
    - job setup
  script:
    - make
`;
    const pipeline = parser.parse(FILE, yaml);
    const steps = pipeline.jobs.get('build')!.steps;
    expect(steps[0].run).toBe('job setup');
    expect(steps[1].run).toBe('make');
  });

  it('skips reserved top-level keys', () => {
    const yaml = `
stages: [build, test]
variables:
  X: 1
image: node:20
cache:
  paths: [node_modules/]

build:
  script:
    - npm ci
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.size).toBe(1);
    expect(pipeline.jobs.has('build')).toBe(true);
  });

  it('skips hidden jobs starting with dot', () => {
    const yaml = `
.base:
  script:
    - echo base

build:
  script:
    - npm ci
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.has('.base')).toBe(false);
    expect(pipeline.jobs.has('build')).toBe(true);
  });

  it('normalizes needs as string array', () => {
    const yaml = `
test:
  needs: [build, lint]
  script:
    - npm test
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.get('test')!.needs).toEqual(['build', 'lint']);
  });

  it('normalizes needs as object array', () => {
    const yaml = `
deploy:
  needs:
    - job: build
    - job: test
  script:
    - ./deploy.sh
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.get('deploy')!.needs).toEqual(['build', 'test']);
  });

  it('handles YAML anchors and aliases', () => {
    const yaml = `
.node_base: &node_base
  image: node:20
  before_script:
    - npm ci

build:
  <<: *node_base
  script:
    - npm run build
`;
    const pipeline = parser.parse(FILE, yaml);
    const job = pipeline.jobs.get('build')!;
    expect(job.image).toBe('node:20');
    expect(job.steps.find(s => s.run === 'npm ci')).toBeTruthy();
    expect(job.steps.find(s => s.run === 'npm run build')).toBeTruthy();
  });

  it('skips entries without a script', () => {
    const yaml = `
workflow:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "push"'

build:
  script:
    - make
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.jobs.size).toBe(1);
  });

  it('sets source to gitlab-ci', () => {
    const yaml = `
build:
  script:
    - make
`;
    const pipeline = parser.parse(FILE, yaml);
    expect(pipeline.source).toBe('gitlab-ci');
  });
});
