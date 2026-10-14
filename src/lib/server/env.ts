import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing setting ${name}. See .env.example.`);
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  // 32+ random characters; signs session and trusted-device cookies.
  get sessionSecret() {
    const v = required("SESSION_SECRET");
    if (v.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters.");
    return v;
  },
  // 32 bytes, base64; encrypts authenticator secrets and the Google Drive token.
  get encryptionKey() {
    const key = Buffer.from(required("ENCRYPTION_KEY"), "base64");
    if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
    return key;
  },
  get appUrl() {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
  get googleClientId() {
    return process.env.GOOGLE_CLIENT_ID ?? "";
  },
  get googleClientSecret() {
    return process.env.GOOGLE_CLIENT_SECRET ?? "";
  },
};
