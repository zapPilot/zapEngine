import { spawn } from 'node:child_process';

const commands = [
  ['pnpm', ['exec', 'tsx', 'watch', 'src/server/main.ts']],
  ['pnpm', ['exec', 'vite']],
];
const children = commands.map(([command, args]) =>
  spawn(command, args, { stdio: 'inherit' }),
);

function stop(signal) {
  for (const child of children) child.kill(signal);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

const exitCode = await new Promise((resolve) => {
  for (const child of children) {
    child.on('exit', (code) => resolve(code ?? 1));
  }
});
stop('SIGTERM');
process.exitCode = exitCode;
