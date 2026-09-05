import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes
} from "node:crypto";

const PREFIX = "enc:v1:";

function resolveKey() {
  const configured = String(process.env.DATA_ENCRYPTION_KEY || "").trim();

  if (/^[a-fA-F0-9]{64}$/.test(configured)) {
    return Buffer.from(configured, "hex");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATA_ENCRYPTION_KEY must be a 64-character hexadecimal value in production."
    );
  }

  const jwtSecret = String(process.env.JWT_SECRET || "gitstack-development-only");
  return createHash("sha256")
    .update(`${jwtSecret}:gitstack-user-data:v1`, "utf8")
    .digest();
}

function key() {
  return resolveKey();
}

export function isEncryptedValue(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptUserValue(value) {
  if (value === null || value === undefined || value === "") return value ?? null;
  const plaintext = String(value);
  if (isEncryptedValue(plaintext)) return plaintext;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptUserValue(value) {
  if (value === null || value === undefined || value === "") return value ?? null;
  const text = String(value);
  if (!isEncryptedValue(text)) return text;

  const payload = text.slice(PREFIX.length);
  const [ivPart, tagPart, dataPart] = payload.split(".");
  if (!ivPart || !tagPart || !dataPart) return "";

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(ivPart, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return "";
  }
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function normalizeUniversityId(value) {
  return String(value || "").trim().toLowerCase();
}

export function lookupHash(value, kind = "generic") {
  const normalized = String(value || "").trim().toLowerCase();
  return createHmac("sha256", key())
    .update(`${kind}:${normalized}`, "utf8")
    .digest("hex");
}

export function encryptedUserData({
  fullName,
  email,
  universityId,
  department,
  semester,
  designation
}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedUniversityId = normalizeUniversityId(universityId);

  return {
    fullName: encryptUserValue(String(fullName || "").trim()),
    email: encryptUserValue(normalizedEmail),
    universityId: encryptUserValue(String(universityId || "").trim()),
    department: department ? encryptUserValue(String(department).trim()) : null,
    semester: semester ? encryptUserValue(String(semester).trim()) : null,
    designation: designation ? encryptUserValue(String(designation).trim()) : null,
    emailLookupHash: lookupHash(normalizedEmail, "email"),
    universityIdLookupHash: lookupHash(normalizedUniversityId, "universityId")
  };
}

export function decryptPublicUser(user) {
  return {
    id: user.id,
    fullName: decryptUserValue(user.fullName),
    email: decryptUserValue(user.email),
    universityId: decryptUserValue(user.universityId),
    department: decryptUserValue(user.department),
    semester: decryptUserValue(user.semester),
    designation: decryptUserValue(user.designation),
    role: user.role.toLowerCase(),
    xp: user.xp,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
}

export function userNeedsEncryptionBackfill(user) {
  const optionalNeedsEncryption = [
    user.department,
    user.semester,
    user.designation
  ].some((value) => value && !isEncryptedValue(value));

  return (
    !user.emailLookupHash ||
    !user.universityIdLookupHash ||
    !isEncryptedValue(user.email) ||
    !isEncryptedValue(user.universityId) ||
    !isEncryptedValue(user.fullName) ||
    optionalNeedsEncryption
  );
}

export async function backfillUserEncryption(prisma, user) {
  if (!userNeedsEncryptionBackfill(user)) return user;

  const plaintext = {
    fullName: decryptUserValue(user.fullName),
    email: decryptUserValue(user.email),
    universityId: decryptUserValue(user.universityId),
    department: decryptUserValue(user.department),
    semester: decryptUserValue(user.semester),
    designation: decryptUserValue(user.designation)
  };

  return prisma.user.update({
    where: { id: user.id },
    data: encryptedUserData(plaintext)
  });
}
