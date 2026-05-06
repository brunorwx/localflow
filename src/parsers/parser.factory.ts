import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { GitHubActionsParser } from './github-actions.parser.js';
import { GitLabCiParser } from './gitlab-ci.parser.js';
import type { ParsedCiFile, Pipeline } from './types.js';

const ghaParser = new GitHubActionsParser();
const gitlabParser = new GitLabCiParser();

export function detectAndParseCiFiles(cwd: string): ParsedCiFile[] {
  const results: ParsedCiFile[] = [];

  const workflowDir = join(cwd, '.github', 'workflows');
  if (existsSync(workflowDir)) {
    let files: string[] = [];
    try {
      files = readdirSync(workflowDir)
        .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
        .map(f => join(workflowDir, f));
    } catch { /* ignore */ }

    for (const filePath of files) {
      try {
        const content = readFileSync(filePath, 'utf-8');
        results.push({ filePath, pipeline: ghaParser.parse(filePath, content) });
      } catch (err) {
        process.stderr.write(`  [warn] Could not parse ${filePath}: ${(err as Error).message}\n`);
      }
    }
  }

  const gitlabPath = join(cwd, '.gitlab-ci.yml');
  if (existsSync(gitlabPath)) {
    try {
      const content = readFileSync(gitlabPath, 'utf-8');
      results.push({ filePath: gitlabPath, pipeline: gitlabParser.parse(gitlabPath, content) });
    } catch (err) {
      process.stderr.write(`  [warn] Could not parse ${gitlabPath}: ${(err as Error).message}\n`);
    }
  }

  return results;
}

export function parseExplicitFile(filePath: string): ParsedCiFile {
  const absPath = resolve(filePath);
  const content = readFileSync(absPath, 'utf-8');
  const doc = load(content) as Record<string, unknown>;

  let pipeline: Pipeline;
  if (doc && typeof doc === 'object' && 'jobs' in doc) {
    pipeline = ghaParser.parse(absPath, content);
  } else {
    pipeline = gitlabParser.parse(absPath, content);
  }

  return { filePath: absPath, pipeline };
}
