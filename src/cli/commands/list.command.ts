import { resolve } from 'node:path';
import type { Command } from 'commander';
import { detectAndParseCiFiles } from '../../parsers/parser.factory.js';
import { logger } from '../../logger/logger.js';

export function registerListCommand(program: Command): void {
  program
    .command('list')
    .description('List all jobs found in CI files in the current directory')
    .option('-d, --dir <path>', 'directory to scan', process.cwd())
    .action((opts: { dir: string }) => {
      const files = detectAndParseCiFiles(resolve(opts.dir));

      if (files.length === 0) {
        logger.error('No CI files found. Expected .github/workflows/*.yml or .gitlab-ci.yml');
        process.exit(1);
      }

      for (const { filePath, pipeline } of files) {
        for (const w of pipeline.warnings) logger.warn(w);
        logger.section(pipeline.source + '  ' + filePath);

        if (pipeline.jobs.size === 0) {
          logger.warn('No jobs found in this file.');
          continue;
        }

        for (const job of pipeline.jobs.values()) {
          logger.listJob(job.id, job.image, job.needs);
        }
      }
    });
}
