import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import process from "node:process";

import { sandboxConfig } from "../services/sandbox/config.js";

import { executeApprovedCommand } from "../services/sandbox/command-service.js";
import {
  inspectContainer,
  startContainer,
  stopContainer
} from "../services/sandbox/container-service.js";
import {
  createSandbox,
  deleteSandbox,
  resetSandbox
} from "../services/sandbox/sandbox-service.js";

async function main() {
  const ownerUserId = `smoke-test-${randomUUID()}`;
  let sandboxId;

  try {
    const sandbox = await createSandbox(ownerUserId);
    sandboxId = sandbox.sandboxId;

    assert.equal(sandbox.running, true);
    assert.equal(sandbox.user, "10001:10001");
    assert.equal(sandbox.workspace, "/workspace");
    assert.equal(sandbox.limits.network, "none");
    assert.equal(
      sandbox.limits.readOnlyRootFilesystem,
      sandboxConfig.hardening.readOnlyRootFilesystem
    );
    assert.ok(sandbox.limits.cpus > 0);
    assert.ok(sandbox.limits.memoryMb > 0);
    assert.ok(sandbox.limits.pids > 0);

    const initialUser = await executeApprovedCommand(sandboxId, "whoami");
    assert.equal(
      initialUser.exitCode,
      0,
      `Initial sandbox command failed. stdout=${JSON.stringify(initialUser.stdout)} stderr=${JSON.stringify(initialUser.stderr)}`
    );
    assert.equal(initialUser.stdout.trim(), "student");

    const stopped = await stopContainer(sandboxId);
    assert.equal(stopped.running, false);
    const restarted = await startContainer(sandboxId);
    assert.equal(restarted.running, true);

    const userResult = await executeApprovedCommand(sandboxId, "whoami");
    assert.equal(
      userResult.exitCode,
      0,
      `Restarted sandbox command failed. stdout=${JSON.stringify(userResult.stdout)} stderr=${JSON.stringify(userResult.stderr)}`
    );
    assert.equal(userResult.stdout.trim(), "student");
    console.log(userResult.stdout.trim());

    const gitResult = await executeApprovedCommand(sandboxId, "git-version");
    assert.equal(gitResult.exitCode, 0);
    assert.match(gitResult.stdout, /^git version /);
    console.log(gitResult.stdout.trim());

    const initResult = await executeApprovedCommand(sandboxId, "git-init");
    assert.equal(initResult.exitCode, 0);
    assert.match(`${initResult.stdout}\n${initResult.stderr}`, /Initialized empty Git repository/i);
    console.log((initResult.stdout || initResult.stderr).trim());

    const beforeReset = await executeApprovedCommand(sandboxId, "list-files");
    assert.match(beforeReset.stdout, /\.git/);

    await resetSandbox(sandboxId, ownerUserId);
    const afterReset = await executeApprovedCommand(sandboxId, "list-files");
    assert.doesNotMatch(afterReset.stdout, /\.git/);

    const inspected = await inspectContainer(sandboxId);
    assert.equal(inspected.ownerUserId, ownerUserId);

    const statusResult = await executeApprovedCommand(sandboxId, "git-status");
    assert.equal(statusResult.exitCode, 0);

    console.log("Sandbox image, start/stop/reset lifecycle and command smoke test passed.");
  } finally {
    if (sandboxId) {
      await deleteSandbox(sandboxId, ownerUserId).catch(() => {});
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
