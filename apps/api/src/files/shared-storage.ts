import { ServiceUnavailableException } from '@nestjs/common';
import { PrivateStorage } from '@spt/private-storage';

let shared: PrivateStorage | undefined;
/** One S3 client per process: building one per request discards its connection pool. */
export function privateStorage(): PrivateStorage {
  if (shared) return shared;
  try {
    shared = new PrivateStorage();
    return shared;
  } catch {
    throw new ServiceUnavailableException('Private storage unavailable');
  }
}
export function closePrivateStorage(): void {
  shared?.close();
  shared = undefined;
}
