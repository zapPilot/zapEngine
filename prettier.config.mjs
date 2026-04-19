/** @type {import('prettier').Config} */
const config = {
  singleQuote: true,
  trailingComma: 'all',
  overrides: [
    {
      files: 'apps/frontend/**/*',
      options: {
        semi: true,
        trailingComma: 'es5',
        singleQuote: false,
        printWidth: 80,
        tabWidth: 2,
        useTabs: false,
        bracketSpacing: true,
        bracketSameLine: false,
        arrowParens: 'avoid',
        endOfLine: 'lf',
        quoteProps: 'as-needed',
        jsxSingleQuote: false,
        embeddedLanguageFormatting: 'auto',
        insertPragma: false,
        proseWrap: 'preserve',
        requirePragma: false,
      },
    },
    {
      files: 'packages/intent-engine/**/*',
      options: {
        semi: true,
        trailingComma: 'es5',
        singleQuote: false,
        printWidth: 80,
        tabWidth: 2,
        useTabs: false,
        bracketSpacing: true,
        bracketSameLine: false,
        arrowParens: 'avoid',
        endOfLine: 'lf',
        quoteProps: 'as-needed',
        jsxSingleQuote: false,
        embeddedLanguageFormatting: 'auto',
        insertPragma: false,
        proseWrap: 'preserve',
        requirePragma: false,
      },
    },
    {
      files: 'packages/intent-engine/**/*.md',
      options: {
        printWidth: 100,
        proseWrap: 'always',
      },
    },
    {
      files: 'packages/intent-engine/**/*.json',
      options: {
        printWidth: 120,
        tabWidth: 2,
      },
    },
    {
      files: 'apps/alpha-etl/**/*',
      options: {
        singleQuote: false,
        trailingComma: 'all',
      },
    },
    {
      files: 'apps/landing-page/**/*',
      options: {
        semi: true,
        trailingComma: 'es5',
        singleQuote: true,
        printWidth: 100,
        tabWidth: 2,
        useTabs: false,
        bracketSpacing: true,
        bracketSameLine: false,
        arrowParens: 'avoid',
        endOfLine: 'lf',
        quoteProps: 'as-needed',
        jsxSingleQuote: false,
        proseWrap: 'preserve',
      },
    },
    {
      files: 'apps/frontend/**/*.md',
      options: {
        printWidth: 100,
        proseWrap: 'always',
      },
    },
    {
      files: 'apps/frontend/**/*.json',
      options: {
        printWidth: 120,
        tabWidth: 2,
      },
    },
  ],
};

export default config;
