// Minimal ambient typing for `import.meta.env` so this package type-checks
// without depending on Vite. Consumers (Vite apps) statically replace these at
// their own build; the moved runtime code reads keys defensively.
type ImportMetaEnv = Readonly<Record<string, string | undefined>>;

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
