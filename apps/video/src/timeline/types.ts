/** One narrated sentence. Its id keys the voiceover manifest. */
export interface VoLine {
  readonly id: string;
  /** What the viewer reads in the captions. */
  readonly text: string;
  /** What the TTS engine is asked to say, when it differs from `text`. */
  readonly say?: string;
}

export interface SceneSpec<Id extends string = string, Props = unknown> {
  readonly id: Id;
  readonly vo: readonly VoLine[];
  readonly props: Props;
  /** Frames between the scene start and its first line. */
  readonly leadIn?: number;
  /** Frames between the last line and the scene end. */
  readonly tail?: number;
  /** Lower bound for scenes that need time beyond their narration. */
  readonly minFrames?: number;
}

export interface VoiceSettings {
  /** Fish Audio prosody speed; part of every line's cache fingerprint. */
  readonly speed: number;
}

/**
 * What the burned-in captions are. A `transcript` shows the narrated words
 * (`text`, spoken as `say ?? text`). A `translation` shows `text` in `lang`
 * while the narration says `say`, so cue phrases are matched in what is heard.
 */
export interface CaptionSettings {
  readonly lang: 'en' | 'ja';
  readonly relation: 'transcript' | 'translation';
}

export interface Storyboard<Scene extends SceneSpec = SceneSpec> {
  /** Composition id, output file stem and voiceover folder name. */
  readonly id: string;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  /** Hard ceiling enforced by the timeline test. */
  readonly maxSeconds: number;
  readonly transitionFrames: number;
  readonly leadIn: number;
  readonly tail: number;
  /** Frames between consecutive lines inside one scene. */
  readonly gap: number;
  readonly voice: VoiceSettings;
  /** Absent: English captions that transcribe the narration. */
  readonly captions?: CaptionSettings;
  readonly scenes: readonly Scene[];
}
