export interface Step {
  name?: string;
  run?: string;
  uses?: string;
  env?: Record<string, string>;
  shell?: string;
}

export interface Job {
  id: string;
  name: string;
  image: string;
  env: Record<string, string>;
  steps: Step[];
  workingDir?: string;
  needs?: string[];
}

export interface Pipeline {
  source: 'github-actions' | 'gitlab-ci';
  filePath: string;
  jobs: Map<string, Job>;
  warnings: string[];
}

export interface ParsedCiFile {
  filePath: string;
  pipeline: Pipeline;
}

export interface CiParser {
  parse(filePath: string, content: string): Pipeline;
}
