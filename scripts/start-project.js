import { spawn, spawnSync } from "node:child_process";

if (process.env.DOCKER_HOST?.includes("podman.sock")) {
  console.error("DOCKER_HOST points to Podman. Run `unset DOCKER_HOST` first.");
  process.exit(1);
}

const inspect = spawnSync("docker", ["container", "inspect", "gitstack-postgres"], {
  stdio: "ignore"
});
const command = inspect.status === 0
  ? ["docker", ["start", "gitstack-postgres"]]
  : ["docker", ["compose", "up", "-d", "postgres"]];
const startDb = spawnSync(command[0], command[1], { stdio: "inherit" });
if (startDb.status !== 0) process.exit(startDb.status || 1);

const server = spawn(process.execPath, ["server.js"], {
  stdio: "inherit",
  env: process.env
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 0));
