import { spawn } from "node:child_process";

const packages = ["@knowledge/server", "@knowledge/web", "@knowledge/admin"];
const processes = [];
let isStopping = false;

/** 停止所有开发服务；每个 pnpm 命令都在独立进程组中，信号会传给它启动的子进程。 */
function stopAll(exitCode) {
  if (isStopping) return;
  isStopping = true;
  process.exitCode = exitCode;

  for (const child of processes) {
    if (!child.pid) continue;
    try {
      // macOS 下负 PID 表示向整个进程组发信号，避免 node --watch 留下孤儿进程。
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
}

// 用户按 Ctrl+C 或系统要求退出时，统一停止三个 workspace 服务。
process.on("SIGINT", () => stopAll(130));
process.on("SIGTERM", () => stopAll(143));

for (const packageName of packages) {
  const child = spawn("pnpm", ["--filter", packageName, "dev"], {
    stdio: "inherit",
    detached: true,
  });
  processes.push(child);

  child.on("error", (error) => {
    console.error(`无法启动 ${packageName}：`, error.message);
    stopAll(1);
  });

  // 任一服务意外退出时，收掉其他服务，避免项目处于半启动状态。
  child.on("close", (code) => {
    if (!isStopping) stopAll(code ?? 1);
  });
}
