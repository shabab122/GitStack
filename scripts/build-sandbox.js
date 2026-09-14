import process from "node:process";

import { sandboxConfig } from "../services/sandbox/config.js";
import { buildSandboxImage } from "../services/sandbox/image-service.js";

async function main() {
  console.log(`Building ${sandboxConfig.image}...`);
  const result = await buildSandboxImage();
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.stderr.trim()) console.error(result.stderr.trim());
  console.log(`Built ${result.image} in ${result.durationMs} ms.`);
}

main().catch((error) => {
  console.error(`Sandbox build failed: ${error.message}`);
  process.exitCode = 1;
});
