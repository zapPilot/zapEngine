import { ESLint, Linter } from 'eslint';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: path.resolve('.') });
const fixturePaths = [
  'src/screens/UiContractFixture.tsx',
  'src/screens/UiContractFixture.web.tsx',
  'src/integration/UiContractFixture.tsx',
  'src/components/ui/UiContractFixture.tsx',
];
const configs = new Map(
  await Promise.all(
    fixturePaths.map(
      async (file) =>
        [file, await eslint.calculateConfigForFile(file)] as const,
    ),
  ),
);
const linter = new Linter();
function rules(source: string, file = fixturePaths[0]!) {
  const config = configs.get(file)!;
  // Resolve the real flat config once, then run only the contract under test.
  // This keeps fixture imports from loading resolvers or scanning project files.
  const guardedRules = Object.fromEntries(
    Object.entries(config.rules as Linter.RulesRecord).filter(
      ([name]) =>
        name.startsWith('zap-ui/') ||
        [
          'react/jsx-no-literals',
          'no-restricted-syntax',
          'no-restricted-imports',
        ].includes(name),
    ),
  );
  return linter
    .verify(
      source,
      {
        files: ['**/*.tsx'],
        plugins: config.plugins,
        languageOptions: {
          parser: config.languageOptions.parser,
          parserOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            ecmaFeatures: { jsx: true },
          },
        },
        rules: guardedRules,
      },
      { filename: file },
    )
    .map((message) => message.ruleId);
}

describe('design system and platform lint guards', () => {
  it('rejects new raw colors and Tailwind sizes outside the migration baseline', async () => {
    expect(await rules("export const color = '#abcdef';")).toContain(
      'zap-ui/no-raw-design-values',
    );
    expect(
      await rules(
        "export const classes = 'text-[14px] rounded-lg font-sans-bold';",
      ),
    ).toContain('zap-ui/no-raw-design-values');
    expect(
      await rules(
        "export const classes = 'text-body rounded-card font-sans-bold';",
      ),
    ).not.toContain('zap-ui/no-raw-design-values');
  });
  it('rejects raw typography and radius styles and permits web-only motion', async () => {
    expect(
      await rules('export const style = { fontSize: 14, borderRadius: 8 };'),
    ).toContain('zap-ui/no-raw-design-values');
    expect(
      await rules(
        "export const classes = 'transition-transform';",
        'src/screens/UiContractFixture.web.tsx',
      ),
    ).not.toContain('zap-ui/no-raw-design-values');
  });
  it('requires Text primitives outside the UI library', async () => {
    const source =
      "import { Text as NativeText } from 'react-native'; export default function Fixture() { return <NativeText />; }";
    expect(await rules(source)).toContain('zap-ui/no-raw-text');
    expect(
      await rules(source, 'src/components/ui/UiContractFixture.tsx'),
    ).not.toContain('zap-ui/no-raw-text');
  });
  it('requires icon primitives for direct rendering', async () => {
    expect(
      await rules(
        "import { ArrowLeft as Back } from 'lucide-react-native'; export default function Fixture() { return <Back />; }",
      ),
    ).toContain('zap-ui/no-direct-icon');
  });
  it('requires translated text while allowing punctuation', async () => {
    expect(
      await rules(
        'export default function Fixture() { return <div>New untranslated copy</div>; }',
      ),
    ).toContain('react/jsx-no-literals');
    expect(
      await rules('export default function Fixture() { return <div>·</div>; }'),
    ).not.toContain('react/jsx-no-literals');
  });
  it('accepts typed presentation props while rejecting visible and accessible untranslated copy', async () => {
    expect(
      await rules(
        'export default function Fixture() { return <Card padding="sm" radius="card" keyboardShouldPersistTaps="handled"><PageHeader mode="wizard"><Text variant="body" tone="muted" className="text-body" /></PageHeader></Card>; }',
      ),
    ).not.toContain('react/jsx-no-literals');
    expect(
      await rules(
        'export default function Fixture() { return <Button accessibilityLabel="Untranslated label" title="Untranslated title" />; }',
      ),
    ).toContain('react/jsx-no-literals');
    expect(
      await rules(
        'export default function Fixture() { return <Text className="text-[7px]" />; }',
      ),
    ).toContain('zap-ui/no-raw-design-values');
  });
  it('preserves both integration TSX guards after flat-config merging', async () => {
    const result = await rules(
      "import { View } from 'react-native'; export default function Fixture() { return <View onPress={async () => { await Promise.resolve(); }} />; }",
      'src/integration/UiContractFixture.tsx',
    );
    expect(
      result.filter((rule) => rule === 'no-restricted-syntax'),
    ).toHaveLength(2);
  });
  it('keeps native-safe barrel restrictions in web platform files', async () => {
    expect(
      await rules(
        "import { useAccount } from '@zapengine/app-core/hooks'; export { useAccount };",
        'src/screens/UiContractFixture.web.tsx',
      ),
    ).toContain('no-restricted-imports');
    expect(
      await rules(
        "import { PrivyProvider } from '@privy-io/react-auth'; export { PrivyProvider };",
        'src/screens/UiContractFixture.web.tsx',
      ),
    ).not.toContain('no-restricted-imports');
    expect(
      await rules(
        "import { PrivyProvider } from '@privy-io/expo'; export { PrivyProvider };",
        'src/screens/UiContractFixture.web.tsx',
      ),
    ).toContain('no-restricted-imports');
  });
  it('blocks native CSS motion and permits explicit web motion', async () => {
    expect(
      await rules("export const classes = 'transition-transform';"),
    ).toContain('zap-ui/no-raw-design-values');
    expect(
      await rules("export const classes = 'web:transition-transform';"),
    ).not.toContain('zap-ui/no-raw-design-values');
  });
});
