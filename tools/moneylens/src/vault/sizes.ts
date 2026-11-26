/**
 * A size both the vault's cryptography (crypto.ts) and what travels between a device and the
 * server (protocol.ts) go by, kept by itself so that neither has to import the other.
 */

/** The most a chunk may hold before sealing: 1 MiB. */
export const MAX_CHUNK_BYTES = 1024 * 1024;
