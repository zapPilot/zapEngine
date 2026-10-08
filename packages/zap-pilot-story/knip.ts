import { defineKnipConfig } from '@zapengine/knip-config/base';
const config = defineKnipConfig(
  {
    project: ['src/**/*.ts', 'src/**/*.tsx', 'scripts/**/*.ts'],
  },
  { omitDefaultIgnoreDependencies: ['@zapengine/types'] },
);

// Run from the monorepo root so workspace symlinks remain dependencies in the graph.
const { project, eslint, ...global } = config;
const workspaceConfig = {
  ...global,
  // Excluded workspaces must not execute their ESLint plugins. The selected
  // workspace keeps its original plugin setting below.
  eslint: false,
  workspaces: {
    'packages/zap-pilot-story': { project, eslint },
  },
};

export default workspaceConfig;
