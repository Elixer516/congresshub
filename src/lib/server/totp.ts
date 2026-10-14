import "server-only";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { ORG_NAME } from "../config";

export function newTotpSecret() {
  return generateSecret();
}

export async function totpSetupQr(secret: string, loginId: string) {
  const uri = generateURI({ issuer: ORG_NAME, label: loginId, secret });
  const svg = await QRCode.toString(uri, { type: "svg", errorCorrectionLevel: "M", margin: 4, color: { dark: "#000000", light: "#ffffff" } });
  return { uri, svg };
}

// Returns the accepted time step, or null. Codes at or before lastStep are refused (no reuse).
export async function checkTotp(secret: string, code: string, lastStep: number | null): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  try {
    const result = await verify({
      secret,
      token: code,
      epochTolerance: 30,
      ...(lastStep ? { afterTimeStep: lastStep } : {}),
    });
    return result.valid && "timeStep" in result ? result.timeStep : null;
  } catch {
    return null;
  }
}
