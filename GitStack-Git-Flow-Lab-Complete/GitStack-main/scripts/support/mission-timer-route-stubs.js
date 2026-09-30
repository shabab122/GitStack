import { randomUUID } from "node:crypto";

export const sandboxCalls = [];

export async function createSandbox(_userId, options) {
  sandboxCalls.push({ action: "create", missionRunId: options.missionRunId, expiresAt: options.missionExpiresAt });
  const sandbox = {
    sandboxId: randomUUID(), status: "RUNNING", mode: "ISOLATED",
    expiresAt: options.missionExpiresAt
  };
  options.prisma.attachSandbox(options.missionRunId, sandbox);
  return sandbox;
}

export async function resetSandbox(sandboxId, _userId, options) {
  sandboxCalls.push({ action: "reset", sandboxId, expiresAt: options.missionExpiresAt });
  return options.prisma.resetSandbox(sandboxId, options.missionExpiresAt);
}

export async function startSandbox() { throw new Error("Unexpected stopped sandbox"); }
export async function deleteSandbox() { throw new Error("Unexpected sandbox deletion"); }
export async function prepareMissionWorkspace() {}
export async function ensureMissionWorkspace() {}
