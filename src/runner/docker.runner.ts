import Dockerode from 'dockerode';
import type { Job } from '../parsers/types.js';
import { logger } from '../logger/logger.js';
import { makeLogWritables, waitForStream } from './stream.util.js';

const DEFAULT_SHELL = 'sh';

export function normalizeBindPath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function buildScript(job: Job): { script: string; shell: string } {
  const runnable = job.steps.filter(s => s.run);
  const shell = runnable.find(s => s.shell)?.shell ?? DEFAULT_SHELL;

  if (runnable.length === 0) return { script: '', shell };

  const parts: string[] = ['set -e'];
  for (const step of runnable) {
    if (step.name) {
      parts.push('echo "--- ' + step.name.replace(/"/g, "'") + ' ---"');
    }
    parts.push(step.run!);
  }

  return { script: parts.join('\n'), shell };
}

async function pullImage(docker: Dockerode, image: string): Promise<void> {
  logger.info('Pulling image ' + image + ' ...');

  const stream: NodeJS.ReadableStream = await new Promise((resolve, reject) => {
    docker.pull(image, (err: Error | null, s: NodeJS.ReadableStream) => {
      if (err) reject(err);
      else resolve(s);
    });
  });

  await new Promise<void>((resolve, reject) => {
    (docker as any).modem.followProgress(
      stream,
      (err: Error | null) => { if (err) reject(err); else resolve(); },
      (ev: { status?: string; progress?: string }) => {
        const line = [ev.status, ev.progress].filter(Boolean).join(' ');
        process.stdout.write('\r  ' + line.slice(0, 72).padEnd(72));
      }
    );
  });

  process.stdout.write('\n');
  logger.success('Image ready: ' + image);
}

async function ensureImage(docker: Dockerode, image: string): Promise<void> {
  try {
    await docker.getImage(image).inspect();
    logger.info('Image already present: ' + image);
  } catch {
    await pullImage(docker, image);
  }
}

export class DockerRunner {
  private docker: Dockerode;

  constructor() {
    this.docker = new Dockerode();
  }

  async run(job: Job, cwd: string): Promise<number> {
    await ensureImage(this.docker, job.image);

    const { script, shell } = buildScript(job);

    if (!script.trim()) {
      logger.warn('No executable steps found in job "' + job.id + '"');
      return 1;
    }

    const env = Object.entries(job.env).map(([k, v]) => k + '=' + v);
    const workDir = job.workingDir ?? '/workspace';
    const bindPath = normalizeBindPath(cwd) + ':' + workDir;

    // Anonymous volumes shadow package manager dependency dirs so the
    // container's install never overwrites the host's platform-specific builds.
    const shadowPaths = ['node_modules', 'vendor'].map(d => workDir + '/' + d);
    const shadowVolumes = Object.fromEntries(shadowPaths.map(p => [p, {}]));

    logger.info('Creating container for job "' + job.id + '"');

    const container = await this.docker.createContainer({
      Image: job.image,
      Cmd: [shell, '-c', script],
      Env: env,
      WorkingDir: workDir,
      Volumes: shadowVolumes,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      HostConfig: {
        Binds: [bindPath],
        AutoRemove: false,
      },
    });

    try {
      await container.start();

      const logStream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        timestamps: false,
      });

      const { stdout, stderr } = makeLogWritables(logger);
      (container as any).modem.demuxStream(logStream, stdout, stderr);
      await waitForStream(logStream as unknown as NodeJS.ReadableStream);

      const result = await container.wait();
      return result.StatusCode;
    } finally {
      try { await container.remove({ force: true }); } catch { /* best effort */ }
    }
  }
}
