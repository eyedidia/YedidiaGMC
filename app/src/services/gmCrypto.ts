import { ec as EC } from 'elliptic';
import * as Keychain from 'react-native-keychain';

const ec = new EC('p256');
const KEYCHAIN_SERVICE = 'com.yedidiagmc.gmkey';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GMKeyPair {
  privateKeyHex: string;
  publicKeyHex: string; // uncompressed, 65 bytes (04 prefix + x + y)
}

// ─── SHA-256 (pure JS via elliptic hash utilities) ────────────────────────────

function sha256Bytes(data: Uint8Array): Uint8Array {
  // Use the hash module bundled with elliptic (hash.js)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const hash = require('hash.js');
  const result: number[] = hash.sha256().update(Array.from(data)).digest();
  return new Uint8Array(result);
}

// ─── Key Generation ───────────────────────────────────────────────────────────

export async function generateKeyPair(): Promise<GMKeyPair> {
  const keyPair = ec.genKeyPair();

  const privateKeyHex = keyPair.getPrivate('hex').padStart(64, '0');
  // Uncompressed public key: 04 || x (32 bytes) || y (32 bytes)
  const pubPoint = keyPair.getPublic();
  const x = pubPoint.getX().toString('hex').padStart(64, '0');
  const y = pubPoint.getY().toString('hex').padStart(64, '0');
  const publicKeyHex = '04' + x + y;

  return { privateKeyHex, publicKeyHex };
}

// ─── Signing ──────────────────────────────────────────────────────────────────

export async function signChallenge(
  challenge: Uint8Array,
  privateKeyHex: string,
): Promise<Uint8Array> {
  // SHA-256 hash of the challenge
  const hash = sha256Bytes(challenge);

  // ECDSA sign
  const keyPair = ec.keyFromPrivate(privateKeyHex, 'hex');
  const sig = keyPair.sign(Array.from(hash));

  // Encode as 64-byte (r || s), each 32 bytes big-endian zero-padded
  const rHex = sig.r.toString('hex').padStart(64, '0');
  const sHex = sig.s.toString('hex').padStart(64, '0');

  const signature = new Uint8Array(64);
  for (let i = 0; i < 32; i++) {
    signature[i] = parseInt(rHex.slice(i * 2, i * 2 + 2), 16);
    signature[32 + i] = parseInt(sHex.slice(i * 2, i * 2 + 2), 16);
  }

  return signature;
}

// ─── Keychain Storage ─────────────────────────────────────────────────────────

export async function storePrivateKey(
  vin: string,
  keyPair: GMKeyPair,
): Promise<void> {
  await Keychain.setInternetCredentials(
    KEYCHAIN_SERVICE,
    `gm_key_${vin}`,
    keyPair.privateKeyHex,
  );
}

export async function loadPrivateKey(vin: string): Promise<string | null> {
  try {
    const credentials = await Keychain.getInternetCredentials(KEYCHAIN_SERVICE);
    if (
      credentials &&
      credentials.username === `gm_key_${vin}` &&
      credentials.password
    ) {
      return credentials.password;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Key ID Generation ────────────────────────────────────────────────────────

export async function generateKeyId(): Promise<string> {
  // 4 random bytes as hex string (e.g. "a3f21b09")
  const bytes = new Uint8Array(4);
  // React Native's global crypto.getRandomValues if available, else fallback
  if (
    typeof global !== 'undefined' &&
    global.crypto &&
    global.crypto.getRandomValues
  ) {
    global.crypto.getRandomValues(bytes);
  } else {
    // Pure JS fallback using Math.random (not cryptographically ideal, but acceptable for key ID)
    for (let i = 0; i < 4; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
