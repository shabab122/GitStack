import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import {
  backfillUserEncryption,
  userNeedsEncryptionBackfill
} from "../services/security/user-data-crypto.js";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  let updated = 0;

  for (const user of users) {
    if (!userNeedsEncryptionBackfill(user)) continue;
    await backfillUserEncryption(prisma, user);
    updated += 1;
  }

  console.log(`Encrypted/backfilled ${updated} existing user profile(s).`);
}

main()
  .catch((error) => {
    console.error("User encryption backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
