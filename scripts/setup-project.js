import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import {
  SANDBOX_IMAGE_SCHEMA_LABEL,
  SANDBOX_IMAGE_SCHEMA_VERSION
} from "../services/sandbox/constants.js";

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
  const existingDatabaseContainer = output("docker", ["container", "inspect", "gitstack-postgres"]).status === 0;

  if (!existsSync(".env")) {
    if (existingDatabaseContainer) {
      console.error("Existing GitStack PostgreSQL data was detected, but .env is missing.");
      console.error("Copy the .env from your previous working GitStack version before setup so DATA_ENCRYPTION_KEY remains unchanged.");
      process.exit(1);
    }

    let content = readFileSync(".env.example", "utf8");
    content = content.replace(
      /^JWT_SECRET=.*$/m,
      `JWT_SECRET=${randomBytes(32).toString("hex")}`
    );
    content = content.replace(
      /^DATA_ENCRYPTION_KEY=.*$/m,
      `DATA_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`
    );
    content = content.replace(
      /^GITEA_WEBHOOK_SECRET=.*$/m,
      `GITEA_WEBHOOK_SECRET=${randomBytes(32).toString("hex")}`
    );
    writeFileSync(".env", content);
    console.log("Created .env with new local secrets for a fresh GitStack database.");
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

  const encryptionKeyMissing = !/^DATA_ENCRYPTION_KEY=/m.test(current);
  const encryptionKeyPlaceholder = /^DATA_ENCRYPTION_KEY=(replace_|$)/m.test(current);
  if ((encryptionKeyMissing || encryptionKeyPlaceholder) && existingDatabaseContainer) {
    console.error("Existing GitStack PostgreSQL data was detected, but DATA_ENCRYPTION_KEY is missing or still a placeholder.");
    console.error("Restore the DATA_ENCRYPTION_KEY from the previous working .env. Generating a new key would make existing encrypted profiles unreadable.");
    process.exit(1);
  }

  const webhookMissing = !/^GITEA_WEBHOOK_SECRET=/m.test(current);
  const webhookPlaceholder = /^GITEA_WEBHOOK_SECRET=(replace_|$)/m.test(current);
  if (webhookMissing) {
    current += `\nGITEA_WEBHOOK_SECRET=${randomBytes(32).toString("hex")}\n`;
    console.log("Added a Gitea webhook secret.");
    changed = true;
  } else if (webhookPlaceholder) {
    current = current.replace(
      /^GITEA_WEBHOOK_SECRET=.*$/m,
      `GITEA_WEBHOOK_SECRET=${randomBytes(32).toString("hex")}`
    );
    console.log("Replaced the placeholder Gitea webhook secret.");
    changed = true;
  }

  if (encryptionKeyMissing) {
    current += `\nDATA_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}\n`;
    console.log("Added a local DATA_ENCRYPTION_KEY for a fresh database.");
    changed = true;
  } else if (encryptionKeyPlaceholder) {
    current = current.replace(
      /^DATA_ENCRYPTION_KEY=.*$/m,
      `DATA_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`
    );
    console.log("Replaced the placeholder data-encryption key for a fresh database.");
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
run(process.execPath, ["scripts/test-v15-feature-update.js"]);
run(process.execPath, ["scripts/test-student-dashboard.js"]);
run(process.execPath, ["scripts/test-instructor-dashboard.js"]);
run(process.execPath, ["scripts/test-collaboration-workflow.js"]);
run(process.execPath, ["scripts/sandbox-doctor.js"]);

const rebuild = process.argv.includes("--rebuild");
const imageName = process.env.SANDBOX_IMAGE || "gitstack-sandbox:week1";
const image = output("docker", [
  "image",
  "inspect",
  "--format",
  `{{ index .Config.Labels "${SANDBOX_IMAGE_SCHEMA_LABEL}" }}`,
  imageName
]);
const compatibleImage = image.status === 0 && image.stdout.trim() === SANDBOX_IMAGE_SCHEMA_VERSION;
if (rebuild || !compatibleImage) {
  if (image.status === 0 && !compatibleImage) {
    console.log(`\nSandbox image ${imageName} is outdated and will be rebuilt.`);
  }
  run(process.execPath, ["scripts/build-sandbox.js"]);
} else {
  console.log(`\nSandbox image is compatible: ${imageName}`);
}

run(process.execPath, ["scripts/test-sandbox-image.js"]);

// Docker Compose owns the shared collaboration network. This avoids
// conflicting with a pre-created network that Compose cannot manage.
run("docker", ["compose", "config", "--quiet"]);
run("docker", ["compose", "up", "-d", "postgres", "gitea-db", "gitea"]);

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

run("npx", ["prisma", "validate"]);
run("npx", ["prisma", "generate"]);
run("npx", ["prisma", "migrate", "deploy"]);
run(process.execPath, ["scripts/encrypt-existing-users.js"]);
run(process.execPath, ["prisma/seed.js"]);

console.log("\nGitStack setup completed successfully.");
console.log("Start the project with: npm run dev");
console.log("Open student dashboard: http://localhost:3000/student-dashboard.html");
console.log("Open instructor dashboard: http://localhost:3000/instructor-dashboard.html");
console.log("Open sandbox playground: http://localhost:3000/sandbox-terminal.html");
console.log("Open local Gitea: http://localhost:3002");
console.log("After creating a Gitea token, place it in GITEA_ADMIN_TOKEN and restart GitStack.");
