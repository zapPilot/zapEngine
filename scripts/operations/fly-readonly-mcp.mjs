import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { allowedRequest, projectTools } from './fly-readonly-policy.mjs';

const child = spawn('flyctl', ['mcp', 'server'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});
const pending = new Map();
const write = (stream, message) => stream.write(`${JSON.stringify(message)}\n`);
const reject = (id) =>
  write(process.stdout, {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code: -32601,
      message: 'Not permitted by the Fly read-only profile',
    },
  });
const input = createInterface({ input: process.stdin });
input.on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    reject(null);
    return;
  }
  if (!allowedRequest(message)) {
    reject(message?.id);
    return;
  }
  if (message.id !== undefined) {
    if (pending.has(message.id)) {
      reject(message.id);
      return;
    }
    pending.set(message.id, message.method);
  }
  write(child.stdin, message);
});
createInterface({ input: child.stdout }).on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  // No upstream requests, prompts, or resources cross this tool-only boundary.
  if (message.method || !pending.has(message.id)) return;
  const method = pending.get(message.id);
  pending.delete(message.id);
  if (method === 'tools/list' && message.result)
    message.result = projectTools(message.result);
  if (method === 'initialize' && message.result)
    message.result.capabilities = { tools: {} };
  write(process.stdout, message);
});
input.on('close', () => child.kill());
child.on('error', () => {
  console.error('Unable to start flyctl MCP');
  process.exitCode = 1;
  input.close();
});
child.stdin.on('error', () => input.close());
child.on('exit', (code) => {
  input.close();
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    child.kill(signal);
    input.close();
  });
