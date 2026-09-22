# HANDOFF.md — how to hand work to another agent

A handoff makes the next agent (or person) **faster without making them wrong**.
Most handoffs fail the second half: they read as finished, so the reader trusts
the parts that were guessed.

There are two kinds. Declare `Type:` on the first line of every handoff.

| Type                            | Situation                                                                                            | Example header                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **A — WIP handover**            | You have a branch with work in progress. The reader picks up your branch.                            | `Type: A — WIP handover, branch <name>`   |
| **B — pre-implementation spec** | No implementation exists yet. The reader implements from your spec against `main` (or a named base). | `Type: B — spec, base <commit or branch>` |

Section applicability differs. **Omit** sections that do not apply — do not
fill them with `N/A` ritual (`Status: not started`, `Working tree: not
inspected`, `mutation: not run`, `Gates: [not run]`). Four such blocks cost
~15 lines and teach the reader to skim the whole file.

- Both: §0, §1, §2, §4, §6, §7, §9.
- Mostly A: §3 (tests), §5 (gates), §8 (working-tree state).
- Type B omits §§3/5/8 unless there is something real to say. An intended
  test invariant may appear as a `[suggestion]`; a skipped gate may not appear
  as `[not run]` when no implementation exists to gate.

## §0 Vantage point — read first, write first

This section comes before everything because it defines what every citation
below is worth. Three lines, no prose:

```
Can read: <e.g. repo main via GitHub connector at <commit>; files X–Y actually opened>
Can run: <e.g. nothing | full local toolchain + <commands you ran>>
Cannot see: <e.g. local working tree; uncommitted changes; CI secrets; device-only behavior>
```

Why: `Working tree: not inspected — GitHub connector was used against
repository main` means every `[verified:]` below is really "I read this on
`main`". Any local uncommitted change silently invalidates it, and the author
can execute nothing. The reader must know that **before** trusting the
inventory, not buried in §8 next to untracked-file bookkeeping.

## The one rule — per type

A handoff carries your **reasoning**, your **scope boundary**, and **how sure
you were**. It never carries what the reader can already see.

- Type A: a diff carries your **conclusion**. Anything already visible in
  `git diff` does not belong here.
- Type B: there is no diff, so the equivalent rule is: **anything the reader
  sees by opening your cited location does not belong here. Do not restate
  it.** No ASCII redraws of the current UI, no repetition of state enums or
  prop lists visible at the cited lines. Cite the location once, then say only
  what the location cannot say: what to change, what to keep, how sure you are.

## Evidence notation

Every claim about behavior carries exactly one behavior tag. Every prescription
carries exactly one prescription tag. There is no third option and no untagged
authoritative-sounding sentence.

| Tag                                              | Meaning                                                                                                                                                                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ``[verified: path — `symbol/excerpt` (line N)]`` | You read the source. Quote the symbol name or a short verbatim excerpt so the reader can re-find it after line numbers drift; the line number is auxiliary.                                                                         |
| `[verified: <cmd> → <excerpt>]`                  | You ran it. Quote the line of output that proves the claim.                                                                                                                                                                         |
| `[assumed — <why you could not check>]`          | You did not check. Say so. This is the most valuable tag you own.                                                                                                                                                                   |
| `[not run]`                                      | A check that exists and you skipped. Name it. Type B omits this when there is nothing to run.                                                                                                                                       |
| `[requirement]`                                  | A product/design decision the reader must not trade away (e.g. icon-only, no status text). To overturn it, ask the owner — do not silently implement around it.                                                                     |
| `[suggestion]`                                   | The author's guess at implementation (e.g. "add an optional `utilityAction: ReactNode` slot to `EpisodeRow`"). On conflict with repo reality, **discard directly, no need to report or justify**. No argument is needed to deviate. |
| `[out-of-band: <where to confirm>]`              | A first-hand fact only you know because it lives outside the repo: an approved mockup, a rejection notice, a hallway decision. Name where the reader can confirm it. Bare "the approved direction" is not a citation.               |

The old `[verified: path:line]` form is deprecated: line numbers rot after one
unrelated commit. Promote what the old "Example of the notation" section did —
quote `` `EpisodeDownloadButton` `` or `` `S = class extends Error …` `` — from
example to requirement.

**Never resolve doubt with code.** "I am not sure whether X, so I handle both X
and not-X" turns an open question into a permanent artifact that _looks_
handled. Leave the doubt as an `[assumed]` line or an open question instead.
Likewise, never give a `[suggestion]` the tone of a `[requirement]`: one wrong
API guess written with product-decision authority costs the reader a full
disproof cycle (precedent: a guessed executability flag written in the same
voice as a hard no-disabled-buttons constraint).

## What goes in, in priority order

### 0. Vantage point (A + B, mandatory)

Per §0. One to three lines. No `N/A` filler.

### 1. Verified facts

The facts your change (or spec) depends on, each tagged. Prefer few and cited
over many and vague. If a common belief is false, say so explicitly — negative
knowledge is the most expensive to re-derive. Repo-external facts go here as
`[out-of-band: …]`, never as bare prose.

### 2. Inventory, including what you left alone

Every site you examined, with a verdict and the reason:

```
<path> — `symbol/excerpt` (line N)   <what it does>          → changed | implement: <what to do>
<path> — `symbol/excerpt` (line N)   <what it does>          → left alone: <reason>
<path> — `symbol/excerpt` (line N)   <what it does>          → not examined
```

The **negatives are the point** — in Type A the positives are already in the
diff; in Type B the positives are one hop away at the citation. The reader must
be able to tell "did not look" from "looked and decided no". A partial fix
(Type A) or partial survey (Type B) with no negative list forces a full
re-inventory, the single largest token cost you can push onto the next agent.

### 3. Tests: what each locks, and whether you saw it red (mostly A)

For every new or changed test:

- the invariant it protects (one line);
- the **mutation check**: break or revert the production change, run the test,
  confirm it fails. Record `mutation: red ✅` or `mutation: not run`.

A test that has only ever been green proves nothing, and a green test built on
an `[assumed]` fact is worse than no test. Type B: omit this section, or state
an intended invariant as a `[suggestion]` — never a `mutation: not run` ritual
for code that does not exist.

### 4. Scope boundary — two separate lists (A + B)

- **Deliberately out**: what you chose not to touch, and why.
- **Not reached**: what you would have done with more time.

Platform splits (`.ios.tsx`, `.web.ts`), sibling issues, adjacent call paths go
here. Mixing the two lists makes both useless.

### 5. Gates: ran / did not run (mostly A)

Name each check by command with result. Name skipped ones. "Verified" with no
command is not verified. A workaround for a failed gate is a **decision**
(§6), not a green. Type B: omit when there is nothing to run.

### 6. Decisions and rejected alternatives (A + B)

For each non-obvious choice: alternatives considered and the concrete reason
each lost, one line per alternative. Tag the verdict: `[requirement]` (holds
even if the reader's constraints differ — do not trade) vs `[suggestion]`
(discard on conflict, no report needed). This is where the reader learns which
choices survive contact with repo reality.

### 7. Traps (A + B)

Anything that cost you minutes and would cost the next agent the same:
environment quirks, gates failing non-obviously, deadlocking mocks, silently
no-op tools. Symptom — cause — workaround.

**Tag by evidence, not by type.** A Type B trap you actually checked is
`[verified: …]` — "deleting the size copy orphans the `totalDownloadedBytes`
import and turns `deadcode` red" is one grep away. Only an unchecked prediction
is `[assumed]`. Forcing every Type B trap down to `[assumed]` sends the reader
to re-derive a fact you already hold: the notation failing in reverse.

### 8. Working-tree state (A only)

Untracked files, unrelated commits on the branch, generated artifacts —
anything `git status` or `git log origin/main..HEAD` would surprise the reader
with. **Report, do not fix** — branch surgery is the owner's call. Type B has
no working tree by definition; its §0 already covers this.

### 9. Open questions, each with stakes (A + B)

Things you could not settle, phrased as questions, each followed by its stakes:

```
- <question>? [assumed — <what you did instead>]
  Stakes: answer A → <concrete consequence, e.g. one extra PR in account-engine>;
          answer B → <concrete consequence, e.g. a two-line branch>.
```

A Privy-scope question that decides a whole PR's worth of token-auth work must
not look identical to a two-line style preference. Without stakes the reader
cannot triage: they must either ask everything or guess everything.

## What does not go in

- Type A: a description of what the diff does. The reader has `git diff`.
- Type B: a restatement of what the cited code already shows. The reader has
  the file open.
- File lists, line counts, code summaries.
- Reassurance without a command: "should work", "tested thoroughly", "handles
  all cases".
- Anything the repo already records (AGENTS.md, ADRs, git history).
- `N/A` placeholders for inapplicable sections. Omit the section.

## Anti-patterns that make a handoff net-negative

| Pattern                                                  | Why it hurts                                                                | Instead                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Belt-and-braces code for an unverified assumption        | Reader cannot see the doubt; the guess ships as fact                        | `[assumed]` line or open question                          |
| Green test that encodes the assumption                   | Closes the question downstream; reader trusts it                            | Mutation check, or `mutation: not run`                     |
| Partial fix/survey with no negative inventory            | Reader cannot tell "missed" from "dismissed"; must redo the whole search    | Section 2 with every examined site                         |
| "Verified" / "works" without a command                   | Unfalsifiable; reader re-runs everything anyway                             | Command + output excerpt                                   |
| Summarising the diff (A) / restating cited code (B)      | Spends attention on what is already visible                                 | Spend words only on what the diff / cited file cannot show |
| Untagged prescription ("add X", "preferred shape: …")    | Reads with `[verified:]` authority; guess and requirement indistinguishable | `[requirement]` or `[suggestion]` on every prescription    |
| Out-of-band fact buried in prose ("the approved mockup") | Unchallengeable and unverifiable; most valuable facts hidden                | `[out-of-band: <where to confirm>]`                        |
| Ritual `N/A` sections in a Type B spec                   | ~15 lines of nothing; teaches skimming                                      | Omit inapplicable sections                                 |
| Open question without stakes                             | Reader cannot triage ask-vs-guess                                           | `Stakes: A → …; B → …`                                     |
| Bare `path:line` citation                                | Rots on the next unrelated commit                                           | Symbol/excerpt + line as auxiliary                         |
| Silently choosing when unsure                            | Looks like a decision; is an inherited coin flip                            | Section 9                                                  |
| Fixing branch state "helpfully" (rebase, stash, rm)      | Destroys context; violates repository guardrails                            | Section 8, report only                                     |

## Reader's protocol

0. Read **§0 Vantage point** first. It sets the strength of every citation:
   `main`-only reads go stale on contact with a dirty tree; `[not run]` gates
   outrank `[verified:]` prose.
1. Read `[assumed]` and **Open questions** next — with their stakes. That is
   your search space, triaged by cost. Everything else, trust at the strength
   of its tag.
2. Treat `[suggestion]` as disposable: verify against the tree, keep or drop
   silently. `[out-of-band: …]` is load-bearing — challenge it at the cited
   confirmation point, never by re-deriving it from code. `[requirement]` is
   load-bearing differently: it has no confirmation point, so when repo reality
   makes it unbuildable, take that evidence to the owner. Never silently
   implement around it.
3. Treat any test marked `mutation: not run` as unverified. Run the mutation
   yourself before relying on it.
4. Run the `[not run]` gates before anything else (Type A) — a change that has
   not seen the full gate has not been finished.
5. Do **not** re-inventory sites already listed with a reason unless the reason
   is wrong. Search only the gaps the inventory admits to.
6. Report what you changed in the same format. Your reader inherits your
   `[assumed]` tags exactly as you inherited theirs.

## Template

```markdown
# HANDOFF — <branch or topic>

Type: A — WIP handover, branch <name> | B — spec, base <commit/branch>

## §0 Vantage

Can read: <…>
Can run: <…>
Cannot see: <…>

## Verified facts

- <claim> [verified: <path> — `symbol/excerpt` (line N)]
- <claim> [verified: <cmd> → <excerpt>]
- <external fact> [out-of-band: <where to confirm, e.g. Figma <link>, ASC notice id>]
- <claim> [assumed — <why you could not check>]

## Inventory

<path> — `symbol` (line N) <role> → changed | implement: <what>
<path> — `symbol` (line N) <role> → left alone: <reason>
<path> — `symbol` (line N) <role> → not examined

## Tests (A; omit in B unless an intended invariant exists)

- <test file › name>: locks <invariant>. mutation: red ✅ | not run

## Gates (A; omit in B when nothing ran)

- <command> → pass | fail: <excerpt> | [not run]

## Decisions

- Chose <A> over <B> because <concrete reason>. [requirement | suggestion]

## Scope

Deliberately out: <item — reason>
Not reached: <item>

## Traps

- <symptom> — <cause> — <workaround>

## Open questions

- <question>? [assumed — <what you did instead>]
  Stakes: answer A → <consequence>; answer B → <consequence>.
```

## Example of the notation

Same fact, three ways. Only the first two are acceptable in a handoff.

```
✅ Privy rejects a dismissed login with an Error subclass carrying `code`
   [verified: node_modules/.pnpm/@privy-io+expo@0.69.4…/dist/esm/ui.js —
   `S = class extends Error { constructor(t, o) { super(o); this.code = t } }`]

✅ The shipped build used the same Privy version
   [assumed — lockfile at HEAD pins 0.69.4; release commit not checked]

✗  "Privy might throw without a code, so also match on the message."
   ← the assumption is gone; it now lives in production code and a green test.
```

Prescriptions and external facts:

```
✅ Episode rows are icon-only with no status text. [requirement]
✅ Add the download affordance beside each row. [requirement]
✅ Put it via an optional slot, e.g. `utilityAction: ReactNode` on `EpisodeRow`. [suggestion]
✅ The mockup also puts a compact download action beside rows.
   [out-of-band: approved mockup, Figma <link>]
```

The third line may be dropped silently if `EpisodeRow` has no such slot in the
reader's tree. The first two may not.

## Where it lives

`HANDOFF-<topic>.md` at the repository root. Type A is committed together with
the WIP it describes (precedent: `HANDOFF-ADR-0002-EXEC.md`); Type B may exist
before any implementation. When the PR opens, fold **Decisions**, **Scope**,
and **Gates** into the PR description and delete the file at merge.

Length test (replaces the old ~60-line cap): **every line must change the
reader's next action.** A 230-line spec where each line steers action beats a
60-line handoff padded with `N/A`. If a Type A handoff is long, you are
describing the diff — cut it. If a Type B handoff is long, check whether you
are restating cited code — cite once, then stop.
