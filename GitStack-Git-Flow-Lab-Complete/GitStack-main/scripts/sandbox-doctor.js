import process from "node:process";

import { sandboxConfig } from "../services/sandbox/config.js";
import { runDocker } from "../services/sandbox/docker-client.js";
import { sandboxImageStatus } from "../services/sandbox/image-service.js";

async function main() {
  console.log("GitStack sandbox doctor\n");

  if (process.env.DOCKER_HOST) {
    console.log(`DOCKER_HOST=${process.env.DOCKER_HOST}`);
    if (process.env.DOCKER_HOST.includes("podman.sock")) {
      console.warn(
        "Warning: DOCKER_HOST points to Podman. Run `unset DOCKER_HOST` if you intend to use Docker Engine."
      );
    }
  } else {
    console.log("DOCKER_HOST is not set; Docker will use the active context.");
  }

  const version = await runDocker(["version", "--format", "{{json .}}"]);
  const parsed = JSON.parse(version.stdout);
  console.log(`Docker client: ${parsed.Client?.Version || "unknown"}`);
  console.log(`Docker server: ${parsed.Server?.Version || "unknown"}`);

  const context = await runDocker(["context", "show"]);
  console.log(`Docker context: ${context.stdout.trim()}`);

  const security = await runDocker([
    "info",
    "--format",
    "{{json .SecurityOptions}}"
  ]);
  console.log(`Security options: ${security.stdout.trim()}`);

  const image = await sandboxImageStatus();
  if (!image.exists) {
    console.log(`Sandbox image is not built yet: ${sandboxConfig.image}`);
  } else if (!image.compatible) {
    console.warn(`Sandbox image is outdated: ${sandboxConfig.image}. Run npm run sandbox:build.`);
  } else {
    console.log(`Sandbox image is compatible: ${sandboxConfig.image}`);
  }

  console.log("\nDocker is ready for GitStack sandbox development.");
}

main().catch((error) => {
  console.error(`Sandbox doctor failed: ${error.message}`);
  process.exitCode = 1;
});
