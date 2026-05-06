import { load } from 'js-yaml';
import type { CiParser, Job, Pipeline, Step } from './types.js';

const DEFAULT_IMAGE = 'ubuntu:22.04';

const RESERVED_KEYS = new Set([
  'stages', 'variables', 'image', 'services', 'cache',
  'before_script', 'after_script', 'include', 'workflow', 'default',
]);

interface RawImageObject { name: string }
type RawImage = string | RawImageObject;

interface RawJob {
  image?: RawImage;
  variables?: Record<string, string>;
  script?: string[];
  before_script?: string[];
  after_script?: string[];
  needs?: Array<string | { job: string }>;
}

interface RawGitLabCi {
  image?: RawImage;
  variables?: Record<string, string>;
  before_script?: string[];
  [key: string]: unknown;
}

function extractImageName(raw: RawImage | undefined): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') return raw;
  return raw.name;
}

function buildSteps(
  beforeScript: string[] | undefined,
  script: string[],
): Step[] {
  const steps: Step[] = [];
  for (const line of (beforeScript ?? [])) {
    steps.push({ name: `before_script: ${line.slice(0, 40)}`, run: line, shell: 'sh' });
  }
  for (const line of script) {
    steps.push({ name: line.slice(0, 40), run: line, shell: 'sh' });
  }
  return steps;
}

function normalizeNeeds(raw: RawJob['needs']): string[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  return raw.map(n => (typeof n === 'string' ? n : n.job));
}

export class GitLabCiParser implements CiParser {
  parse(filePath: string, content: string): Pipeline {
    const doc = load(content) as RawGitLabCi;
    const jobs = new Map<string, Job>();

    const globalImage = extractImageName(doc.image as RawImage);
    const globalVars = (doc.variables as Record<string, string>) ?? {};
    const globalBefore = doc.before_script as string[] | undefined;

    for (const [key, value] of Object.entries(doc)) {
      if (RESERVED_KEYS.has(key) || key.startsWith('.')) continue;
      if (typeof value !== 'object' || value === null) continue;

      const rawJob = value as RawJob;
      if (!rawJob.script || rawJob.script.length === 0) continue;

      const image =
        extractImageName(rawJob.image) ??
        globalImage ??
        DEFAULT_IMAGE;

      const env: Record<string, string> = {
        ...globalVars,
        ...(rawJob.variables ?? {}),
      };

      const steps = buildSteps(rawJob.before_script ?? globalBefore, rawJob.script);

      jobs.set(key, {
        id: key,
        name: key,
        image,
        env,
        steps,
        needs: normalizeNeeds(rawJob.needs),
      });
    }

    return { source: 'gitlab-ci', filePath, jobs, warnings: [] };
  }
}
