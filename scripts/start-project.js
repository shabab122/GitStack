import { spawn, spawnSync } from "node:child_process";

if (process.env.DOCKER_HOST?.includes("podman.sock")) {
  console.error("DOCKER_HOST points to Podman. Run `unset DOCKER_HOST` first.");
  process.exit(1);
}

const services = spawnSync("docker", ["compose", "up", "-d", "postgres", "gitea-db", "gitea"], { stdio: "inherit" });
if (services.status !== 0) process.exit(services.status || 1);

const server = spawn(process.execPath, ["server.js"], { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));
