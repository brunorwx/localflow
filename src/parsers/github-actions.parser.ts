import { load } from 'js-yaml';
import type { CiParser, Job, Pipeline, Step } from './types.js';

const DEFAULT_IMAGE = 'ubuntu:22.04';
const GHA_EXPRESSION_RE = /\$\{\{[^}]+\}\}/g;

interface RawStep {
  name?: string;
  run?: string;
  uses?: string;
  env?: Record<string, string>;
  shell?: string;
}

interface RawContainer {
  image?: string;
}

interface RawJob {
  name?: string;
  'runs-on'?: string;
  container?: string | RawContainer;
  env?: Record<string, string>;
  steps?: RawStep[];
  needs?: string | string[];
}

interface RawWorkflow {
  jobs?: Record<string, RawJob>;
}

function resolveImage(job: RawJob, jobId: string): { image: string; warn?: string } {
  if (typeof job.container === 'string') return { image: job.container };
  if (typeof job.container === 'object' && job.container?.image) return { image: job.container.image };
  return {
    image: DEFAULT_IMAGE,
    warn: `Job "${jobId}" uses runs-on without a container image — defaulting to ${DEFAULT_IMAGE}`,
  };
}

function normalizeEnv(raw: Record<string, unknown> | undefined): Record<string, string> {
  if (!raw) return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const str = String(v ?? '');
    result[k] = GHA_EXPRESSION_RE.test(str) ? '' : str;
  }
  return result;
}

function parseStep(raw: RawStep): Step {
  return {
    name: raw.name,
    run: raw.run,
    uses: raw.uses,
    env: normalizeEnv(raw.env as Record<string, unknown>),
    shell: raw.shell,
  };
}

export class GitHubActionsParser implements CiParser {
  parse(filePath: string, content: string): Pipeline {
    const doc = load(content) as RawWorkflow;
    const jobs = new Map<string, Job>();
    const warnings: string[] = [];

    for (const [id, rawJob] of Object.entries(doc.jobs ?? {})) {
      const { image, warn } = resolveImage(rawJob, id);
      if (warn) warnings.push(warn);

      const needs = rawJob.needs
        ? Array.isArray(rawJob.needs) ? rawJob.needs : [rawJob.needs]
        : undefined;

      jobs.set(id, {
        id,
        name: rawJob.name ?? id,
        image,
        env: normalizeEnv(rawJob.env as Record<string, unknown>),
        steps: (rawJob.steps ?? []).map(parseStep),
        needs,
      });
    }

    return { source: 'github-actions', filePath, jobs, warnings };
  }
}
