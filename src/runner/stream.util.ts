import { Writable } from 'node:stream';
import type { Logger } from '../logger/logger.js';

export function makeLogWritables(log: Logger): { stdout: Writable; stderr: Writable } {
  const stdout = new Writable({
    write(chunk: Buffer, _enc: string, cb: () => void) {
      log.out(chunk, 'stdout');
      cb();
    },
  });
  const stderr = new Writable({
    write(chunk: Buffer, _enc: string, cb: () => void) {
      log.out(chunk, 'stderr');
      cb();
    },
  });
  return { stdout, stderr };
}

export function waitForStream(stream: NodeJS.ReadableStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.on('end', resolve);
    stream.on('error', reject);
  });
}
