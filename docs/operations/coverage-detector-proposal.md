# Proposed detector: Supabase advisor coverage

## Decision needed

Evaluate a bounded Supabase advisor collector after a second independent review.
This is a detector proposal, not an instruction to modify production functions,
indexes, policies, PostgreSQL versions, or OperationsService ranking.

## Evidence

Project `urplxsioxepxopuababf`, observed 2026-09-16 around 07:20–07:24 UTC via
read-only `get_advisors`. Security advisors reported three
`function_search_path_mutable` warnings. The current product, cost, customer and
social adapters do not query Supabase advisors. This is observed advisor output;
exploitability and user impact have not been established.

## Proposed invariant and source

On a bounded provider read, inventory security advisor rule, schema/object,
severity, observation time and remediation URL. Fingerprint by rule and object,
not message wording. Distinguish new, persistent and resolved findings relative
to the previous complete successful read. Missing credentials, failed queries,
invalid payloads and truncated results are unknown; they must not erase findings
or imply resolution. Keep accepted intentional configurations explicitly reviewed
and scoped instead of broadly suppressing the rule.

## Validation and falsification

Fixtures should exercise absent credentials with zero requests, a successful empty
inventory, duplicates, persistent findings, new findings, resolution after a
complete scan, and unavailable/truncated scans that cannot resolve old findings.
Validate provider object identity and stable dedupe before promotion. A second
review that shows the warning has been resolved, or a documented intentional
configuration with no actionable invariant, falsifies promotion for that finding.

## Promotion status

One independent review recorded. Do not count an immediate repeated query as the
second review. On recurrence, obtain human review to implement a deterministic
collector or record why the detector is not worth maintaining. No agent-backlog
item is appropriate for this architecture/security decision.

## Fingerprint

coverage:supabase-advisors:function-search-path

[Provider remediation guidance](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
