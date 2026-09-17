# HANDOFF — mobile EpisodeDetails transcript copy

## Status
Plan only. No production code or tests have been changed. Implement native transcript text selection/copy in `EpisodeDetailScreen` while preserving tap-to-seek.
Working tree: branch intentionally contains only this handoff document.

## Verified facts
- `EpisodeTranscript` renders the transcript in two paths: a plain body fallback and timed segments. Neither transcript `Text` currently opts into native text selection. [verified: GitHub fetch `main:apps/app/src/screens/EpisodeDetailScreen.tsx` → fallback `<Text ...>{body ...}</Text>` and timed `<Text ...>{segment.text}</Text>` have no `selectable` prop]
- Each timed segment is wrapped by `Tap`; pressing it starts the episode when needed and seeks to the segment start. [verified: GitHub fetch `main:apps/app/src/screens/EpisodeDetailScreen.tsx` → `onPress={() => { if (!isCurrentAudio) player.toggle(episode); player.seek(segment.start); }}`]
- `Tap` is a thin React Native `Pressable` wrapper that forwards `PressableProps`. [verified: GitHub fetch `main:apps/app/src/components/ui/Tap.tsx` → `<Pressable ... {...rest}>`]
- Mobile app guardrails require React Native UI/runtime code to remain in screens/components/providers and app changes to use the workspace Turbo gates. [verified: GitHub fetch `main:apps/app/AGENTS.md`]

## Desired behavior / acceptance criteria
- On iOS and Android, the user can long-press transcript copy and get the native text-selection/copy UI.
- Both transcript rendering modes must be copyable: the untimed full-body fallback and the timed/segmented transcript.
- Normal short tap on a timed segment must still seek to that segment exactly as today.
- Selecting/copying text must not unexpectedly trigger seek/playback.
- Preserve current transcript styling, active-segment highlighting, timestamps, scrolling, and accessibility semantics unless a change is required for selection.
- Scope is the transcript copy under Episode Details; do not redesign podcast playback or unrelated text surfaces.

## Inventory
`apps/app/src/screens/EpisodeDetailScreen.tsx`  transcript rendering + seek interaction  → implementation target
`apps/app/src/components/ui/Tap.tsx`  shared Pressable primitive  → inspect before changing; avoid global behavior changes for a screen-local need
`apps/app/AGENTS.md`  mobile boundaries + required verification  → left alone: instructions only
`apps/app/src/components/podcast/EpisodeMediaPlayer.tsx`  player UI  → deliberately out unless implementation evidence shows it is required

## Tests
- Add/adjust focused component tests where the existing harness can assert selection-related props and preserve timed-segment seek behavior. mutation: not run
- Native text selection is OS interaction; verify manually on iOS and Android even if JS tests pass. mutation: not run

## Gates
- `pnpm turbo run type-check lint test build --filter=@zapengine/app` → [not run]
- `pnpm --filter @zapengine/app format:check` → [not run]
- `pnpm turbo run deadcode dup:check --filter=@zapengine/app` → [not run]
- iOS/Android manual long-press selection + copy smoke test → [not run]

## Decisions
- Preserve tap-to-seek instead of removing the segment press interaction; it is existing EpisodeDetails behavior.
- Prefer the smallest screen-local React Native change over modifying shared `Tap`; changing `Tap` affects many unrelated controls.
- Do not add a custom clipboard button as the first solution; the requested behavior is direct copying/selecting of the transcript. Add a separate copy-all action only if product requirements change.

## Scope
Deliberately out: language-classroom text, episode title, share flow, web-only behavior, playback persistence, transcript timing algorithm.
Not reached: actual implementation, test execution, native-device verification.

## Traps
- A timed transcript nests selectable text inside a pressable row. `selectable` alone may not be sufficient if the parent gesture wins the long press; verify the real iOS and Android gesture behavior rather than assuming it.
- Do not make all `Tap` instances selection-aware to solve this one screen unless there is evidence a shared fix is required.

## Open questions
- Does React Native native selection work reliably inside the current `Pressable` hierarchy on both platforms, or must the seek hit-target be separated from the transcript text?
- If selection cannot span multiple timed `Text` nodes, is per-segment selection sufficient for this request? Start with native per-segment selection; do not add new product UI without need.
