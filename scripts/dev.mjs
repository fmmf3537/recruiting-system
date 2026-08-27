// 本地开发启动器：同时拉起后端（Express :3001）与前端（Vite）
// 关键：把 CLI 参数（--port / --host 等）与 PORT 环境变量透传给前端 Vite，
// 供预览环境指定端口；不依赖 pnpm / concurrently，npm run dev 即可工作。
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);

const procs = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const p of procs) {
    try {
      p.kill('SIGTERM');
    } catch {
      /* 进程可能已退出 */
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

function run(command, cmdArgs, cwd) {
  const p = spawn(command, cmdArgs, { cwd, stdio: 'inherit', env: process.env });
  p.on('exit', (code) => shutdown(code ?? 0));
  p.on('error', (err) => {
    console.error(`[dev] 启动失败: ${err.message}`);
    shutdown(1);
  });
  procs.push(p);
}

// 后端：server/ 下 tsx watch（与 pnpm dev 行为一致）
const tsxCli = path.join(root, 'server', 'node_modules', 'tsx', 'dist', 'cli.mjs');
run(process.execPath, [tsxCli, 'watch', '--import', './src/lib/tracing.ts', 'src/index.ts'], path.join(root, 'server'));

// 前端：client/ 下 vite，默认端口 5174；PORT 环境变量或 --port 参数可覆盖
const viteCli = path.join(root, 'client', 'node_modules', 'vite', 'bin', 'vite.js');
const hasPortArg = args.includes('--port') || args.some((a) => a.startsWith('--port='));
const viteArgs = [viteCli];
if (!hasPortArg) viteArgs.push('--port', process.env.PORT || '5174');
viteArgs.push(...args);
run(process.execPath, viteArgs, path.join(root, 'client'));
