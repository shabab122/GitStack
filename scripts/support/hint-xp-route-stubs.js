// Only the XP settlement route is exercised by the in-memory regression test.
export async function validateMission() {
  return { passed: true, score: 83, checks: [{ code: "VALID", label: "Repository valid", passed: true }], feedback: [] };
}
export async function createSandbox() { throw new Error("Unexpected sandbox creation"); }
export async function resetSandbox() { throw new Error("Unexpected sandbox reset"); }
export async function startSandbox() { throw new Error("Unexpected sandbox start"); }
export async function deleteSandbox() { return null; }
