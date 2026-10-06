export const common = {
  number: 1,
  state: 'open',
  html_url: 'https://github.com/zapPilot/zapEngine/security/1',
  created_at: '2026-10-04T00:00:00Z',
};
export const code = {
  ...common,
  rule: {
    id: 'js/test',
    description: 'Test rule',
    security_severity_level: 'high',
  },
  tool: { name: 'CodeQL' },
  most_recent_instance: {
    classifications: [null],
    location: { path: '.github/workflows/ci.yml', start_line: 3 },
    message: { text: 'm'.repeat(400) },
  },
};
export const dependency = {
  ...common,
  dependency: {
    package: { name: 'Pillow', ecosystem: 'pip' },
    manifest_path: 'requirements.txt',
  },
  security_advisory: {
    ghsa_id: 'GHSA-test',
    summary: 'Test vulnerability',
    severity: 'critical',
  },
  security_vulnerability: {
    vulnerable_version_range: '<2',
    first_patched_version: { identifier: '2.0' },
  },
};
export const secret = {
  ...common,
  secret: 'SENTINEL_NEVER_EXPOSE',
  secret_type: 'github_token',
  secret_type_display_name: 'GitHub token',
  validity: 'unknown',
  push_protection_bypassed: true,
  publicly_leaked: true,
  first_location_detected: {
    path: 'test.txt',
    start_line: 2,
    commit_sha: 'abc',
  },
};
