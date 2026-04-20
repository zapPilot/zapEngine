import { jsonResponse, validationHook } from '@routes/shared';

function makeContext() {
  const jsonMock = vi.fn();
  return {
    c: {
      req: { path: '/test' },
      json: jsonMock,
    } as unknown as Parameters<typeof validationHook>[1],
    jsonMock,
  };
}

describe('validationHook', () => {
  it('returns undefined when result.success is true', () => {
    const { c } = makeContext();
    const result = validationHook({ success: true }, c);
    expect(result).toBeUndefined();
  });

  it('returns c.json with 400 and the first issue message on failure', () => {
    const { c, jsonMock } = makeContext();
    validationHook(
      {
        success: false,
        error: { issues: [{ message: 'Invalid wallet address' }] },
      },
      c,
    );
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Invalid wallet address',
      }),
      400,
    );
  });

  it('falls back to "Invalid request" when issues array is empty', () => {
    const { c, jsonMock } = makeContext();
    validationHook({ success: false, error: { issues: [] } }, c);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid request' }),
      400,
    );
  });

  it('falls back to "Invalid request" when error is undefined', () => {
    const { c, jsonMock } = makeContext();
    validationHook({ success: false }, c);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid request' }),
      400,
    );
  });
});

describe('jsonResponse', () => {
  it('calls c.json with the payload and status', () => {
    const jsonMock = vi.fn();
    const c = { json: jsonMock } as unknown as Parameters<
      typeof jsonResponse
    >[0];
    jsonResponse(c, { data: 'ok' }, 201);
    expect(jsonMock).toHaveBeenCalledWith({ data: 'ok' }, { status: 201 });
  });
});
