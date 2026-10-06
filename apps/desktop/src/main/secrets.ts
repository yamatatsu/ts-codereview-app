import { Result } from '@praha/byethrow';
import type { GitHubError } from '@tsugi/core';
import { safeStorage } from 'electron';

/** PAT は safeStorage（Keychain）で暗号化して保存する。平文へのフォールバックはしない（docs/adr/0013） */
export const isEncryptionAvailable = (): boolean => safeStorage.isEncryptionAvailable();

export const encryptSecret = (value: string): Result.Result<Buffer, GitHubError> =>
  isEncryptionAvailable()
    ? Result.succeed(safeStorage.encryptString(value))
    : Result.fail({ type: 'github.encryptionUnavailable' });

export const decryptSecret = (value: Buffer | Uint8Array | null): Result.Result<string, GitHubError> => {
  if (!value || value.length === 0) return Result.fail({ type: 'github.tokenMissing' });
  if (!isEncryptionAvailable()) return Result.fail({ type: 'github.encryptionUnavailable' });
  return Result.try({
    try: () => safeStorage.decryptString(Buffer.from(value)),
    catch: (): GitHubError => ({ type: 'github.tokenMissing' }),
  });
};
