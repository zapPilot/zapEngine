// Pin the reviewed read surface; new upstream tools remain denied by default.
export const FLY_READ_TOOLS = {
  'fly-apps-list': ['org'],
  'fly-apps-releases': ['name'],
  'fly-machine-list': ['app'],
  'fly-machine-status': ['app', 'id'],
  'fly-platform-status': [],
  'fly-status': ['app'],
};

export function allowedRequest(message) {
  if (
    [
      'initialize',
      'ping',
      'tools/list',
      'notifications/initialized',
      'notifications/cancelled',
    ].includes(message?.method)
  )
    return true;
  if (message?.method !== 'tools/call') return false;
  const keys = Object.hasOwn(FLY_READ_TOOLS, message.params?.name ?? '')
    ? FLY_READ_TOOLS[message.params.name]
    : null;
  if (!keys) return false;
  const args = message.params.arguments ?? {};
  return (
    typeof args === 'object' &&
    args !== null &&
    !Array.isArray(args) &&
    Object.entries(args).every(
      ([key, value]) =>
        keys.includes(key) &&
        typeof value === 'string' &&
        /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/u.test(value),
    )
  );
}

export function projectTools(result) {
  return {
    ...result,
    tools: (result.tools ?? [])
      .filter((tool) => Object.hasOwn(FLY_READ_TOOLS, tool.name))
      .map((tool) => ({
        ...tool,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: {
          ...tool.inputSchema,
          additionalProperties: false,
          properties: Object.fromEntries(
            Object.entries(tool.inputSchema.properties ?? {}).filter(([key]) =>
              FLY_READ_TOOLS[tool.name].includes(key),
            ),
          ),
        },
      })),
  };
}
