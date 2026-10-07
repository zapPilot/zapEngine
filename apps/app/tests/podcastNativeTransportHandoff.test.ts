import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

function swiftMethod(source: string, signature: string): string {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`Missing native method: ${signature}`);
  let depth = 0;
  for (let index = source.indexOf('{', start); index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}' && --depth === 0) {
      return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed native method: ${signature}`);
}

// Execute the installed Swift teardown against a deterministic command-center/queue.
// No iOS simulator is needed; Linux still runs the patch integrity test.
it.skipIf(process.platform !== 'darwin')(
  'preserves audio metadata and transport through duplicate video release and queued cleanup',
  () => {
    const require = createRequire(import.meta.url);
    const native = readFileSync(
      require.resolve('expo-video/ios/NowPlayingManager.swift'),
      'utf8',
    );
    const targets = [
      'play',
      'pause',
      'togglePlayPause',
      'nextTrack',
      'previousTrack',
      'skipForward',
      'skipBackward',
      'playbackPosition',
    ];
    const directory = mkdtempSync(join(tmpdir(), 'podcast-native-handoff-'));
    try {
      const path = join(directory, 'handoff.swift');
      writeFileSync(
        path,
        `
class DispatchQueue {
  static let main = DispatchQueue()
  var pending: [() -> Void] = []
  func async(_ callback: @escaping () -> Void) { pending.append(callback) }
  func drain() { while !pending.isEmpty { pending.removeFirst()() } }
}
class MPRemoteCommand {
  var targets: [Int] = [1, 2, 3]
  func removeTarget(_ target: Any?) {
    if let target = target as? Int { targets.removeAll { $0 == target } }
    else { targets.removeAll() }
  }
}
class MPRemoteCommandCenter {
  static let instance = MPRemoteCommandCenter()
  static func shared() -> MPRemoteCommandCenter { instance }
  ${targets.map((name) => `let ${name === 'playbackPosition' ? 'changePlaybackPosition' : name}Command = MPRemoteCommand()`).join('\n  ')}
}
class MPNowPlayingInfoCenter {
  static let instance = MPNowPlayingInfoCenter()
  static func \`default\`() -> MPNowPlayingInfoCenter { instance }
  var nowPlayingInfo: [String: String] = ["title": "video"]
}
class Observer { func unregisterDelegate(delegate: Manager) {} }
class VideoPlayer {
  let ref: Int
  let playbackRate = 1
  let observer: Observer? = Observer()
  init(_ ref: Int) { self.ref = ref }
}
class Players {
  var allObjects: [VideoPlayer] = []
  func remove(_ player: VideoPlayer) { allObjects.removeAll { $0 === player } }
}
class Manager {
  let players = Players()
  var registeredPlayerIds = Set<ObjectIdentifier>()
  var mostRecentInteractionPlayer: Int? = 1
  ${targets.map((name) => `var ${name}Target: Any? = 1`).join('\n  ')}
  var ownsNowPlayingTargets: Bool { playTarget != nil }
  func setMostRecentInteractionPlayer(player: Int?) {
    mostRecentInteractionPlayer = player
    removeNowPlayingTargets(commandCenter: .shared())
  }
  ${swiftMethod(native, 'func unregisterPlayer(')}
  ${swiftMethod(native, 'private func removeNowPlayingTargets(').replace('private func', 'func')}
}
let manager = Manager()
let video = VideoPlayer(1)
manager.players.allObjects = [video]
manager.registeredPlayerIds.insert(ObjectIdentifier(video))
manager.unregisterPlayer(video)
precondition(!manager.ownsNowPlayingTargets, "video ownership must clear before queue drains")
precondition(MPNowPlayingInfoCenter.default().nowPlayingInfo.isEmpty, "final video release must clear video metadata")
MPNowPlayingInfoCenter.default().nowPlayingInfo = ["title": "audio"]
manager.unregisterPlayer(video)
precondition(MPNowPlayingInfoCenter.default().nowPlayingInfo["title"] == "audio", "duplicate deinit erased audio")
// A new video may acquire targets before the old session's queued cleanup runs.
${targets.map((name) => `manager.${name}Target = 3`).join('\n')}
DispatchQueue.main.drain()
${targets.map((name) => `precondition(MPRemoteCommandCenter.shared().${name === 'playbackPosition' ? 'changePlaybackPosition' : name}Command.targets == [2, 3], "cleanup removed audio/new video ${name} target")`).join('\n')}
precondition(manager.playTarget as? Int == 3, "old cleanup reset new session ownership")
precondition(MPNowPlayingInfoCenter.default().nowPlayingInfo["title"] == "audio")
// Weak registration can disappear before the native object enters deinit.
let dyingManager = Manager()
let dyingVideo = VideoPlayer(4)
dyingManager.registeredPlayerIds.insert(ObjectIdentifier(dyingVideo))
MPNowPlayingInfoCenter.default().nowPlayingInfo = ["title": "video"]
dyingManager.unregisterPlayer(dyingVideo)
precondition(MPNowPlayingInfoCenter.default().nowPlayingInfo.isEmpty, "weak table eviction skipped final teardown")
print("handoff passed")
`,
      );
      expect(
        execFileSync('/usr/bin/swift', [path], {
          encoding: 'utf8',
          timeout: 60_000,
        }),
      ).toContain('handoff passed');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  65_000,
);
