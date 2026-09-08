export function runCli(main: () => Promise<void>): void {
  void (async () => {
    try {
      await main();
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  })();
}
