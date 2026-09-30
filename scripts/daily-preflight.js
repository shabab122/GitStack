import { ensureInfrastructure } from "./ensure-infrastructure.js";

ensureInfrastructure().catch((error) => {
  console.error(`Daily startup stopped: ${error.message}`);
  process.exitCode = 1;
});
