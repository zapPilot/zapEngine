// RPC and Telegram URLs embed credentials, and viem copies request URLs into messages.
export function describeError(error: unknown): string {
  let text = String(error);
  if (error instanceof Error) {
    const short =
      'shortMessage' in error && typeof error.shortMessage === 'string'
        ? error.shortMessage
        : error.message;
    text = `${error.name}: ${short}`;
  }
  return text
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/bot\d+:[\w-]+/g, 'bot<token>')
    .slice(0, 500);
}
