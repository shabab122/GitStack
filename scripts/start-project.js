import { spawn, spawnSync } from "node:child_process";

import {
  SANDBOX_IMAGE_SCHEMA_LABEL,
  SANDBOX_IMAGE_SCHEMA_VERSION
} from "../services/sandbox/constants.js";

if (process.env.DOCKER_HOST?.includes("podman.sock")) {
  console.error("DOCKER_HOST points to Podman. Run `unset DOCKER_HOST` first.");
  process.exit(1);
}

const imageName = process.env.SANDBOX_IMAGE || "gitstack-sandbox:week1";
const image = spawnSync("docker", [
  "image",
  "inspect",
  "--format",
  `{{ index .Config.Labels "${SANDBOX_IMAGE_SCHEMA_LABEL}" }}`,
  imageName
], { encoding: "utf8", env: process.env });
if (image.status !== 0 || image.stdout.trim() !== SANDBOX_IMAGE_SCHEMA_VERSION) {
  console.log(`Building compatible sandbox image: ${imageName}`);
  const build = spawnSync(process.execPath, ["scripts/build-sandbox.js"], {
    stdio: "inherit",
    env: process.env
  });
  if (build.status !== 0) process.exit(build.status || 1);
}

const services = spawnSync("docker", ["compose", "up", "-d", "postgres", "gitea-db", "gitea"], { stdio: "inherit" });
if (services.status !== 0) process.exit(services.status || 1);

const server = spawn(process.execPath, ["server.js"], { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code ?? 0));
