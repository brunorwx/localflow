import { Command } from 'commander';
import { registerListCommand } from './commands/list.command.js';
import { registerRunCommand } from './commands/run.command.js';

export function buildProgram(): Command {
  const program = new Command();

  program
    .name('localflow')
    .description('Run CI/CD pipeline jobs locally in Docker')
    .version('0.1.0');

  registerListCommand(program);
  registerRunCommand(program);

  return program;
}
