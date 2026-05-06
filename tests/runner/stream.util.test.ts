import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import { makeLogWritables, waitForStream } from '../../src/runner/stream.util.js';
import type { Logger } from '../../src/logger/logger.js';

function makeLogger(): Logger {
  return { out: vi.fn() } as unknown as Logger;
}

describe('makeLogWritables', () => {
  it('routes writes to logger.out with stdout kind', () => {
    const log = makeLogger();
    const { stdout } = makeLogWritables(log);
    const buf = Buffer.from('hello');
    return new Promise<void>((resolve) => {
      stdout.write(buf, () => {
        expect(log.out).toHaveBeenCalledWith(buf, 'stdout');
        resolve();
      });
    });
  });

  it('routes writes to logger.out with stderr kind', () => {
    const log = makeLogger();
    const { stderr } = makeLogWritables(log);
    const buf = Buffer.from('error message');
    return new Promise<void>((resolve) => {
      stderr.write(buf, () => {
        expect(log.out).toHaveBeenCalledWith(buf, 'stderr');
        resolve();
      });
    });
  });
});

describe('waitForStream', () => {
  it('resolves when the stream ends', async () => {
    const stream = new Readable({ read() { this.push(null); } });
    stream.resume(); // put in flowing mode so 'end' fires
    await expect(waitForStream(stream)).resolves.toBeUndefined();
  });

  it('rejects when the stream emits an error', async () => {
    const stream = new Readable({ read() {} });
    stream.resume();
    const err = new Error('stream broke');
    setImmediate(() => stream.destroy(err));
    await expect(waitForStream(stream)).rejects.toThrow('stream broke');
  });
});
