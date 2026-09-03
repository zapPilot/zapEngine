export function runCli(main: () => Promise<void>): void {
  void (async () => {
    try {
      await main();
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  })();
}
