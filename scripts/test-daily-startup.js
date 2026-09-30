import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { ensureInfrastructure } from "./ensure-infrastructure.js";

const originalDirectory = process.cwd();
const directory = mkdtempSync(path.join(tmpdir(), "gitstack-startup-"));
process.chdir(directory);
writeFileSync(".env", "# Existing installation\n");

function simulate({ broken = false, repairWorks = true, extraContainer = "", missingVolume = "", project = "gitstack-main", context = "default", apiReady = true } = {}) {
  const commands = [];
  let upCount = 0;
  let linkBroken = broken;
  const result = (status = 0, stdout = "", stderr = "") => ({ status, stdout, stderr });
  const config = {
    name: project,
    volumes: Object.fromEntries([
      "gitstack_postgres_data", "gitstack_gitea_postgres_data", "gitstack_gitea_data"
    ].map((key) => [key, { name: `${project}_${key}` }]))
  };
  const runDocker = (args) => {
    commands.push(args);
    if (args[0] === "context") return result(0, `${context}\n`);
    if (args[0] === "info") return result(0, "28.0\n");
    if (args[0] === "compose" && args[1] === "config") return result(0, JSON.stringify(config));
    if (args[0] === "volume") return result(args[2] === missingVolume ? 1 : 0);
    if (args[0] === "compose" && args[1] === "up") { upCount += 1; return result(); }
    if (args[0] === "compose" && args[1] === "down") {
      if (repairWorks) linkBroken = false;
      return result();
    }
    if (args[0] === "exec" && args[1] === "gitstack-postgres") return result();
    if (args[0] === "exec" && args[1] === "gitstack-gitea") return result(linkBroken ? 1 : 0);
    if (args[0] === "inspect") return result(0, "true\n");
    if (args[0] === "network") return result(0, args.at(-1) === "gitstack-sandbox-network" ? extraContainer : "gitstack-postgres\ngitstack-gitea-db\n");
    throw new Error(`Unexpected Docker call: ${args.join(" ")}`);
  };
  return {
    commands,
    get upCount() { return upCount; },
    options: {
      runDocker,
      checkGitea: async () => (!linkBroken && apiReady ? "1.24.7" : null),
      pause: async () => {},
      log: () => {}
    }
  };
}

try {
  const healthy = simulate();
  assert.deepEqual(await ensureInfrastructure(healthy.options), { version: "1.24.7", repaired: false });
  assert.equal(healthy.upCount, 1);
  assert.equal(healthy.commands.some((args) => args[1] === "down"), false, "Healthy startup must not reset networks");
  assert.equal(healthy.commands.filter((args) => args[0] === "volume").length, 3);

  const broken = simulate({ broken: true });
  assert.deepEqual(await ensureInfrastructure(broken.options), { version: "1.24.7", repaired: true });
  assert.equal(broken.upCount, 2);
  assert.equal(broken.commands.filter((args) => args[1] === "down").length, 1, "Repair runs at most once");
  assert.deepEqual(broken.commands.find((args) => args[1] === "down"), ["compose", "down"], "Never remove volumes");
  assert.ok(broken.commands.findIndex((args) => args[0] === "volume") < broken.commands.findIndex((args) => args[1] === "up"));

  const occupied = simulate({ broken: true, extraContainer: "gitstack-gitea\ngitstack-sandbox-student-1\n" });
  await assert.rejects(ensureInfrastructure(occupied.options), /other containers are attached/);
  assert.equal(occupied.commands.some((args) => args[1] === "down"), false, "Student sandboxes must be protected");

  const absent = simulate({ missingVolume: "gitstack-main_gitstack_gitea_postgres_data" });
  await assert.rejects(ensureInfrastructure(absent.options), /Refusing to start with an empty database/);
  assert.equal(absent.upCount, 0, "Missing persistent data must fail before Compose creates replacements");

  const stale = simulate({ broken: true, repairWorks: false });
  await assert.rejects(ensureInfrastructure(stale.options), /after one network repair/);
  assert.equal(stale.commands.filter((args) => args[1] === "down").length, 1);

  const invalid = simulate({ project: "another-project" });
  await assert.rejects(ensureInfrastructure(invalid.options), /different data volumes/);
  assert.equal(invalid.upCount, 0);

  const otherContext = simulate({ context: "desktop-linux" });
  await assert.rejects(ensureInfrastructure(otherContext.options), /Docker context is/);
  assert.equal(otherContext.upCount, 0);

  const noApi = simulate({ apiReady: false });
  await assert.rejects(ensureInfrastructure(noApi.options), /API did not become ready/);
  assert.equal(noApi.commands.some((args) => args[1] === "down"), false, "An API problem alone must not reset healthy networks");

  console.log("Daily startup: healthy, one-shot repair, missing-volume protection, occupied-network protection and failure checks passed.");
} finally {
  process.chdir(originalDirectory);
  rmSync(directory, { recursive: true, force: true });
}
