# Podcast TTS Text Cleansing Design

## Goal

Prevent Markdown horizontal rules emitted by generated podcast scripts from being spoken or misinterpreted by the TTS provider, without changing the persisted script or using another LLM call.

## Design

Add a small deterministic text-cleansing function at the main-audio boundary in the podcast ingest audio stage. Immediately before `textToSpeech` is called, pass the persisted script through this function and synthesize the returned text.

The first version removes lines whose trimmed content consists only of three or more ASCII hyphens. It then collapses the blank-line runs created by removal so adjacent paragraphs retain a single readable separation. It does not remove inline `---`, ordinary hyphens, negative signs, em dashes, headings, list markers, or other Markdown syntax.

The cleansing result is ephemeral. The canonical and translated scripts stored in episode localizations remain unchanged, preserving the generated source for display, inspection, and future reprocessing. Language-classroom TTS remains out of scope because it follows a separate synthesis path and does not consume the main script directly.

## Error Handling

The cleanser is a synchronous pure function with no expected failure mode. An empty input remains empty. If a script contains no matching separator line, its content remains unchanged.

## Tests

- Remove `---` and longer hyphen-only lines, including lines with surrounding horizontal whitespace.
- Preserve inline triple hyphens, shorter hyphen sequences, list markers, negative signs, and em dashes.
- Collapse only blank-line runs introduced around removed separators while preserving paragraph separation.
- Verify the ingest audio stage passes cleansed text to the main `textToSpeech` call.
- Verify persisted localization script data is not updated by cleansing.

## Acceptance Criteria

- A generated standalone `---` separator is absent from the text sent to main-audio TTS.
- Valid inline punctuation and hyphenated content are preserved.
- No LLM, database schema, API contract, or persisted-content changes are introduced.
