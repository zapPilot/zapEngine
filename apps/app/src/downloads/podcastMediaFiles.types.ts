export interface PodcastMediaFiles {
  isSupported: boolean;
  /** On hydration, discard files absent from the committed manifest. */
  ensureDirectory(keepFileNames?: readonly string[]): Promise<void>;
  download(
    url: string,
    fileName: string,
    options: { onProgress: (progress: number) => void; signal: AbortSignal },
  ): Promise<number>;
  localUri(fileName: string): string;
  remove(fileName: string): Promise<void>;
  availableBytes(): Promise<number>;
}
