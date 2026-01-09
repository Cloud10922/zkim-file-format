/**
 * Type declarations for @noble packages with .js extensions
 * Required for bundler moduleResolution to resolve .js imports
 * 
 * These declarations mirror the actual exports from @noble packages
 * which use .js extensions in their package.json exports field.
 */

declare module "@noble/hashes/blake3.js" {
  export interface Blake3Opts {
    dkLen?: number;
    key?: Uint8Array;
    context?: Uint8Array;
  }
  export function blake3(
    message: Uint8Array | string,
    opts?: Blake3Opts
  ): Uint8Array;
}

declare module "@noble/post-quantum/ml-dsa.js" {
  export interface MLDSAKeyPair {
    secretKey: Uint8Array;
    publicKey: Uint8Array;
  }
  export const ml_dsa65: {
    keygen(seed?: Uint8Array): MLDSAKeyPair;
    sign(secretKey: Uint8Array, message: Uint8Array): Uint8Array;
    verify(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean;
  };
}

declare module "@noble/post-quantum/ml-kem.js" {
  export interface MLKEMKeyPair {
    secretKey: Uint8Array;
    publicKey: Uint8Array;
  }
  export interface MLKEMEncapsulation {
    cipherText: Uint8Array;
    sharedSecret: Uint8Array;
  }
  export const ml_kem768: {
    keygen(seed?: Uint8Array): MLKEMKeyPair;
    encapsulate(publicKey: Uint8Array, seed?: Uint8Array): MLKEMEncapsulation;
    decapsulate(cipherText: Uint8Array, secretKey: Uint8Array): Uint8Array;
  };
}
