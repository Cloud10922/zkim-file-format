/**
 * Environment-Agnostic Crypto Utilities for @zkim-platform/file-format
 * Provides crypto operations that work in both browser and Node.js environments
 */

import sodium from "libsodium-wrappers-sumo";

import { blake3 } from "@noble/hashes/blake3.js";

/**
 * Generate random bytes using libsodium
 */
export async function generateRandomBytes(length: number): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.randombytes_buf(length);
}

/**
 * Generate random hex string
 */
export async function generateRandomHex(length: number): Promise<string> {
  const bytes = await generateRandomBytes(Math.ceil(length / 2));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .substring(0, length);
}

/**
 * Hash data using BLAKE3
 */
export function hashData(data: Uint8Array, outputLength?: number): Uint8Array {
  const dkLen = outputLength || 32;
  return blake3(data, { dkLen });
}

/**
 * Hash data to hex string
 */
export function hashDataToHex(
  data: Uint8Array,
  outputLength?: number
): string {
  const hash = hashData(data, outputLength);
  return Array.from(hash)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate key pair using X25519 (for encryption)
 */
export async function generateKeyPair(): Promise<{
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}> {
  await sodium.ready;
  return sodium.crypto_box_keypair();
}

/**
 * Generate ML-DSA-65 signing key pair (FIPS 204)
 * Returns public key (1,952 bytes) and secret key (4,032 bytes)
 */
export async function generateSigningKeyPair(): Promise<{
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}> {
  const { ml_dsa65 } = await import("@noble/post-quantum/ml-dsa.js");
  const { publicKey, secretKey } = ml_dsa65.keygen();
  return {
    publicKey,
    privateKey: secretKey,
  };
}

/**
 * Encrypt data using XChaCha20-Poly1305
 */
export async function encryptData(
  data: Uint8Array,
  key: Uint8Array,
  nonce?: Uint8Array
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  await sodium.ready;
  const actualNonce = nonce || sodium.randombytes_buf(24);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    data,
    null,
    null,
    actualNonce,
    key
  );
  return { ciphertext, nonce: actualNonce };
}

/**
 * Decrypt data using XChaCha20-Poly1305
 */
export async function decryptData(
  ciphertext: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array
): Promise<Uint8Array> {
  await sodium.ready;
  const decrypted = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    null,
    nonce,
    key
  );
  return decrypted;
}

/**
 * Convert Uint8Array to base64 string
 */
export async function toBase64(data: Uint8Array): Promise<string> {
  await sodium.ready;
  return sodium.to_base64(data);
}

/**
 * Convert base64 string to Uint8Array
 */
export async function fromBase64(data: string): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.from_base64(data);
}

/**
 * Convert Uint8Array to hex string
 */
export async function toHex(data: Uint8Array): Promise<string> {
  await sodium.ready;
  return sodium.to_hex(data);
}

/**
 * Convert hex string to Uint8Array
 */
export async function fromHex(data: string): Promise<Uint8Array> {
  await sodium.ready;
  return sodium.from_hex(data);
}

