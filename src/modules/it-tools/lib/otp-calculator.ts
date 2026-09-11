import crypto from 'crypto';

const MASTER_OTP_SECRET = 'CLIC_DRIVER_OTP_SECRET_KEY_2026';

/**
 * Calcula un PIN temporal de 4 dígitos a partir de un código de desafío de 6 dígitos (Challenge Code).
 * Algoritmo determinista HMAC-SHA256 offline.
 */
export function generateOtpFromChallenge(challenge: string): string {
  if (!challenge) return '';
  const cleanChallenge = challenge.replace(/\D/g, '');
  if (!cleanChallenge) return '';

  const hmac = crypto.createHmac('sha256', MASTER_OTP_SECRET);
  hmac.update(cleanChallenge);
  const hash = hmac.digest();

  // Dynamic truncation similar to RFC 4226 / TOTP
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otpNum = (binary % 9000) + 1000; // Garantiza exactamente 4 dígitos entre 1000 y 9999
  return otpNum.toString();
}
