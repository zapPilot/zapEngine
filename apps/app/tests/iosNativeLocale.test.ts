import { describe, expect, it } from 'vitest';

import { resolveCocoaPodsLocaleEnv } from '../scripts/sync-ios-native.mjs';

const utf8Override = { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };

describe('CocoaPods locale resolution', () => {
  it('forces a UTF-8 locale when none is exported', () => {
    expect(resolveCocoaPodsLocaleEnv({})).toEqual(utf8Override);
  });

  it('forces a UTF-8 locale for the non-UTF-8 defaults CocoaPods crashes on', () => {
    expect(resolveCocoaPodsLocaleEnv({ LANG: 'C' })).toEqual(utf8Override);
    expect(resolveCocoaPodsLocaleEnv({ LC_ALL: 'POSIX' })).toEqual(
      utf8Override,
    );
    expect(resolveCocoaPodsLocaleEnv({ LANG: 'en_US.ISO8859-1' })).toEqual(
      utf8Override,
    );
  });

  it('treats blank locale variables as unset instead of as a chosen locale', () => {
    expect(
      resolveCocoaPodsLocaleEnv({ LC_ALL: '', LC_CTYPE: '  ', LANG: '' }),
    ).toEqual(utf8Override);
    expect(
      resolveCocoaPodsLocaleEnv({ LC_ALL: '', LANG: 'ja_JP.UTF-8' }),
    ).toEqual({});
  });

  it("preserves an operator's own UTF-8 locale in any language or spelling", () => {
    expect(resolveCocoaPodsLocaleEnv({ LANG: 'ja_JP.UTF-8' })).toEqual({});
    expect(resolveCocoaPodsLocaleEnv({ LANG: 'de_DE.utf8' })).toEqual({});
    expect(resolveCocoaPodsLocaleEnv({ LC_CTYPE: 'zh_TW.UTF-8' })).toEqual({});
  });

  it('follows POSIX precedence when the locale variables disagree', () => {
    expect(
      resolveCocoaPodsLocaleEnv({ LC_ALL: 'C', LC_CTYPE: 'ja_JP.UTF-8' }),
    ).toEqual(utf8Override);
    expect(
      resolveCocoaPodsLocaleEnv({ LC_CTYPE: 'C', LANG: 'ja_JP.UTF-8' }),
    ).toEqual(utf8Override);
    expect(
      resolveCocoaPodsLocaleEnv({ LC_ALL: 'ja_JP.UTF-8', LC_CTYPE: 'C' }),
    ).toEqual({});
  });
});
