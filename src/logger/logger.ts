import chalk from 'chalk';

export class Logger {
  header(msg: string): void {
    console.log(chalk.bold.cyan('\n' + msg));
  }

  section(label: string): void {
    console.log(chalk.bold('\n' + label));
    console.log(chalk.gray('-'.repeat(50)));
  }

  listJob(id: string, image: string, needs?: string[]): void {
    const dep = needs && needs.length > 0 ? chalk.gray(' [needs: ' + needs.join(', ') + ']') : '';
    console.log('  ' + chalk.green.bold(id.padEnd(24)) + ' ' + chalk.gray(image) + dep);
  }

  step(name: string): void {
    console.log(chalk.bold.yellow('\n> ' + name));
  }

  out(chunk: Buffer | string, kind: 'stdout' | 'stderr'): void {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : chunk;
    if (kind === 'stderr') {
      process.stderr.write(chalk.red(text));
    } else {
      process.stdout.write(text);
    }
  }

  warn(msg: string): void {
    console.warn(chalk.yellow('[warn] ' + msg));
  }

  error(msg: string): void {
    console.error(chalk.red('[error] ' + msg));
  }

  success(msg: string): void {
    console.log(chalk.green('[ok] ' + msg));
  }

  info(msg: string): void {
    console.log(chalk.blue('[info] ' + msg));
  }
}

export const logger = new Logger();
