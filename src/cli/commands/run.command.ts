import { resolve } from 'node:path';
import type { Command } from 'commander';
import { detectAndParseCiFiles, parseExplicitFile } from '../../parsers/parser.factory.js';
import { DockerRunner } from '../../runner/docker.runner.js';
import { logger } from '../../logger/logger.js';
import type { Job, ParsedCiFile } from '../../parsers/types.js';

function findJob(files: ParsedCiFile[], jobId: string): Job | undefined {
  for (const { pipeline } of files) {
    const job = pipeline.jobs.get(jobId);
    if (job) return job;
  }
  return undefined;
}

function listAvailableJobs(files: ParsedCiFile[]): void {
  logger.info('Available jobs:');
  for (const { pipeline } of files) {
    for (const id of pipeline.jobs.keys()) {
      console.log('  - ' + id);
    }
  }
}

export function registerRunCommand(program: Command): void {
  program
    .command('run <job>')
    .description('Run a CI job locally in Docker')
    .option('-f, --file <path>', 'explicit CI file path')
    .option('-d, --dir <path>', 'project directory to mount (default: cwd)', process.cwd())
    .action(async (jobId: string, opts: { file?: string; dir: string }) => {
      const cwd = resolve(opts.dir);

      let files: ParsedCiFile[];
      if (opts.file) {
        try {
          files = [parseExplicitFile(opts.file)];
        } catch (err) {
          logger.error('Could not parse ' + opts.file + ': ' + (err as Error).message);
          process.exit(1);
        }
      } else {
        files = detectAndParseCiFiles(cwd);
        if (files.length === 0) {
          logger.error('No CI files found in ' + cwd);
          process.exit(1);
        }
      }

      for (const { pipeline } of files) {
        for (const w of pipeline.warnings) logger.warn(w);
      }

      const job = findJob(files, jobId);
      if (!job) {
        logger.error('Job "' + jobId + '" not found.');
        listAvailableJobs(files);
        process.exit(1);
      }

      if (job.needs && job.needs.length > 0) {
        logger.warn('Job "' + jobId + '" has dependencies: ' + job.needs.join(', ') + ' — running in isolation.');
      }

      const usesSteps = job.steps.filter(s => s.uses);
      for (const s of usesSteps) {
        logger.warn('Skipping "uses" step: ' + s.uses + ' (not supported locally)');
      }

      const runnableSteps = job.steps.filter(s => s.run);
      if (runnableSteps.length === 0) {
        logger.error('Job "' + jobId + '" has no executable steps (only "uses" steps were found).');
        process.exit(1);
      }

      logger.header('Running job: ' + job.id + '  [' + job.image + ']');

      const runner = new DockerRunner();
      let exitCode: number;
      try {
        exitCode = await runner.run(job, cwd);
      } catch (err) {
        logger.error('Docker error: ' + (err as Error).message);
        process.exit(1);
      }

      if (exitCode !== 0) {
        logger.error('Job "' + jobId + '" failed with exit code ' + exitCode);
        process.exit(exitCode);
      }

      logger.success('Job "' + jobId + '" completed successfully.');
    });
}
