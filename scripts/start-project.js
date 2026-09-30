import { spawn, spawnSync } from "node:child_process";

import {
  SANDBOX_IMAGE_SCHEMA_LABEL,
  SANDBOX_IMAGE_SCHEMA_VERSION
} from "../services/sandbox/constants.js";
import { ensureInfrastructure } from "./ensure-infrastructure.js";

async function main() {
  await ensureInfrastructure();

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
    if (build.status !== 0) throw new Error("Sandbox image build failed.");
  }

  const server = spawn(process.execPath, ["server.js"], { stdio: "inherit", env: process.env });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
  server.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((error) => {
  console.error(`Project startup stopped: ${error.message}`);
  process.exitCode = 1;
});
