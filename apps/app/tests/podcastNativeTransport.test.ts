import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

it('resolves the patched video version and includes the queue bridge and safe teardown', () => {
  const require = createRequire(import.meta.url);
  const version = (require('expo-video/package.json') as { version: string })
    .version;
  expect(version).toBe('57.0.1');
  const lock = read('pnpm-lock.yaml');
  const patchHash = createHash('sha256')
    .update(read('patches/expo-video@57.0.1.patch'))
    .digest('hex');
  expect(lock).toContain(`hash: ${patchHash}`);
  const workspace = read('pnpm-workspace.yaml');
  expect(workspace).toContain(
    'expo-video@57.0.1: patches/expo-video@57.0.1.patch',
  );
  expect(lock).toMatch(
    /expo-video:\s+specifier:.*\s+version: 57\.0\.1\(patch_hash=[^)]+\)/,
  );
  const native = readFileSync(
    require.resolve('expo-video/ios/NowPlayingManager.swift'),
    'utf8',
  );
  expect(native).toContain(
    'players.allObjects.isEmpty && ownedNowPlayingTargets',
  );
  expect(native).toContain(
    'for (command, target) in ownedTargets where target != nil',
  );
  expect(native).not.toContain('removeTarget(self?');
  for (const command of ['nextTrack', 'previousTrack']) {
    expect(native).toContain(`emitRemoteCommand("${command}")`);
    expect(native).toContain(
      `(commandCenter.${command}Command, ${command}Target)`,
    );
  }
  expect(native).toContain('player.emit(event: "lockScreenRemoteCommand"');
  expect(native).toContain('guard !Task.isCancelled');
  expect(native).toContain('togglePlayPauseCommand.addTarget');
});
