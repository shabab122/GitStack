import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, DOCKER_HOST: process.env.DOCKER_HOST || "" },
    ...options
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function output(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", env: process.env });
  return { status: result.status, stdout: result.stdout || "", stderr: result.stderr || "" };
}

function ensureEnvironmentFile() {
  if (!existsSync(".env")) {
    let content = readFileSync(".env.example", "utf8");
    content = content.replace(
      /^JWT_SECRET=.*$/m,
      `JWT_SECRET=${randomBytes(32).toString("hex")}`
    );
    content = content.replace(
      /^DATA_ENCRYPTION_KEY=.*$/m,
      `DATA_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`
    );
    writeFileSync(".env", content);
    console.log("Created .env with a new local JWT secret.");
    return;
  }

  let current = readFileSync(".env", "utf8");
  let changed = false;
  if (/^JWT_SECRET=(replace_|$)/m.test(current)) {
    current = current.replace(
      /^JWT_SECRET=.*$/m,
      `JWT_SECRET=${randomBytes(32).toString("hex")}`
    );
    console.log("Replaced the placeholder JWT secret in .env.");
    changed = true;
  }
  if (!/^DATA_ENCRYPTION_KEY=/m.test(current)) {
    current += `\nDATA_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\n`;
    console.log("Added a local DATA_ENCRYPTION_KEY to .env.");
    changed = true;
  } else if (/^DATA_ENCRYPTION_KEY=(replace_|$)/m.test(current)) {
    current = current.replace(
      /^DATA_ENCRYPTION_KEY=.*$/m,
      `DATA_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`
    );
    console.log("Replaced the placeholder data-encryption key in .env.");
    changed = true;
  }
  if (changed) writeFileSync(".env", current);
}

ensureEnvironmentFile();

if (process.env.DOCKER_HOST?.includes("podman.sock")) {
  console.error("DOCKER_HOST points to Podman. Run `unset DOCKER_HOST` and retry.");
  process.exit(1);
}

run(process.execPath, ["scripts/check-source.js"]);
run(process.execPath, ["scripts/test-v15-ui.js"]);
run(process.execPath, ["scripts/test-student-dashboard.js"]);
run(process.execPath, ["scripts/test-instructor-dashboard.js"]);
run(process.execPath, ["scripts/sandbox-doctor.js"]);

const rebuild = process.argv.includes("--rebuild");
const image = output("docker", ["image", "inspect", "gitstack-sandbox:week1"]);
if (rebuild || image.status !== 0) {
  run(process.execPath, ["scripts/build-sandbox.js"]);
} else {
  console.log("\nSandbox image already exists. Use `npm run setup -- --rebuild` to rebuild it.");
}

run(process.execPath, ["scripts/test-sandbox-image.js"]);

const network = output("docker", ["network", "inspect", "gitstack-sandbox-network"]);
if (network.status !== 0) {
  run("docker", [
    "network", "create", "--driver", "bridge", "--internal",
    "--label", "gitstack.managed=true",
    "--label", "gitstack.purpose=sandbox-collaboration",
    "gitstack-sandbox-network"
  ]);
}

const postgres = output("docker", ["container", "inspect", "gitstack-postgres"]);
if (postgres.status === 0) {
  run("docker", ["start", "gitstack-postgres"]);
} else {
  run("docker", ["compose", "up", "-d", "postgres"]);
}

for (let attempt = 0; attempt < 20; attempt += 1) {
  const ready = output("docker", [
    "exec", "gitstack-postgres", "pg_isready", "-U", "gitstack", "-d", "gitstack"
  ]);
  if (ready.status === 0) break;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  if (attempt === 19) {
    console.error("PostgreSQL did not become ready in time.");
    process.exit(1);
  }
}

run("npx", ["prisma", "generate"]);
run("npx", ["prisma", "migrate", "deploy"]);
run(process.execPath, ["scripts/encrypt-existing-users.js"]);
run(process.execPath, ["prisma/seed.js"]);

console.log("\nGitStack setup completed successfully.");
console.log("Start the project with: npm run dev");
console.log("Open student dashboard: http://localhost:3000/student-dashboard.html");
console.log("Open instructor dashboard: http://localhost:3000/instructor-dashboard.html");
console.log("Open sandbox playground: http://localhost:3000/sandbox-terminal.html");
