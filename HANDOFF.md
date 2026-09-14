# HANDOFF.md — how to hand work to another agent

A handoff is for the agent (or person) who picks up your branch. Its job is to
make them **faster without making them wrong**. Most handoffs fail the second
half: they read as finished, so the reader trusts the parts that were guessed.

## The one rule

A diff carries your **conclusion**. It destroys your **reasoning**, your
**scope boundary**, and **how sure you were**. A handoff exists to carry those
three things. Anything already visible in `git diff` does not belong here.

## Evidence notation

Every claim about how a library, runtime, service, platform, or gate behaves
carries exactly one of these tags. There is no third option.

| Tag                             | Meaning                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `[verified: path:line]`         | You read the source. Cite it so the reader can re-check in one hop. |
| `[verified: <cmd> → <excerpt>]` | You ran it. Quote the line of output that proves the claim.        |
| `[assumed]`                     | You did not check. Say so. This is the most valuable tag you own.  |
| `[not run]`                     | A check that exists and you skipped. Name it.                      |

**Never resolve doubt with code.** "I am not sure whether X, so I handle both X
and not-X" turns an open question into a permanent artifact that _looks_
handled. Leave the doubt as an `[assumed]` line or an open question instead.

## What goes in, in priority order

### 1. Verified facts

The facts your change depends on, each tagged. Prefer few and cited over many
and vague. If you found that a common belief is false, say that explicitly —
negative knowledge is the most expensive to re-derive.

### 2. Inventory, including what you left alone

Every site you examined for this change, with a verdict and the reason:

```
<path:line>   <what it does>          → changed
<path:line>   <what it does>          → left alone: <reason>
<path:line>   <what it does>          → not examined
```

The **negatives are the point** — the positives are already in the diff. The
reader must be able to tell "did not look" from "looked and decided no". A
partial fix with no negative list forces a full re-inventory, which is the
single largest token cost you can push onto the next agent.

### 3. Tests: what each locks, and whether you saw it red

For every new or changed test:

- the invariant it protects (one line);
- the **mutation check**: break or revert the production change, run the test,
  confirm it fails. Record the result: `mutation: red ✅` or `mutation: not run`.

A test that has only ever been green proves nothing about the code, and it
converts an open question into a closed one for everyone downstream. A green
test built on an `[assumed]` fact is worse than no test.

### 4. Scope boundary — two separate lists

- **Deliberately out**: what you chose not to touch, and why.
- **Not reached**: what you would have done with more time.

Platform splits (`.ios.tsx`, `.web.ts`), sibling issues, and adjacent call
paths go here. Mixing the two lists makes both useless.

### 5. Gates: ran / did not run

Name each check by its command, with its result. Name the ones you skipped.
"Verified" with no command attached is not verified. If a gate failed and you
worked around it, that is a **decision** (section 6), not a green.

### 6. Decisions and rejected alternatives

For each non-obvious choice: the alternative(s) considered and the concrete
reason each lost. One line per alternative. This is where the reader learns
whether your choice still holds if their constraints differ from yours.

### 7. Traps

Anything that cost you more than a few minutes and would cost the next agent
the same: environment quirks, gates that fail for non-obvious reasons, mocks
that deadlock, tools that silently no-op. State the symptom, the cause, the
way around.

### 8. Working-tree state

Untracked files, unrelated commits riding on the branch, generated artifacts,
anything `git status` or `git log origin/main..HEAD` would surprise the reader
with. **Report, do not fix** — branch surgery is the owner's call.

### 9. Open questions

Things you could not settle, phrased as questions. Not silently resolved by
picking one.

## What does not go in

- A description of what the diff does. The reader has `git diff`.
- File lists, line counts, code summaries.
- Reassurance without a command: "should work", "tested thoroughly", "handles
  all cases".
- Anything the repo already records (AGENTS.md, ADRs, git history).

## Anti-patterns that make a handoff net-negative

| Pattern                                              | Why it hurts                                                                  | Instead                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Belt-and-braces code for an unverified assumption    | Reader cannot see the doubt; the guess ships as fact                          | `[assumed]` line or open question                              |
| Green test that encodes the assumption               | Closes the question for everyone downstream; reader trusts it                 | Mutation check, or mark `mutation: not run`                    |
| Partial fix with no negative inventory               | Reader cannot tell "missed" from "dismissed"; must redo the whole search      | Section 2 with every examined site                             |
| "Verified" / "works" without a command               | Unfalsifiable; reader must re-run everything anyway                           | Command + output excerpt                                       |
| Summarising the diff                                 | Spends the reader's attention on what they can already see                    | Spend words only on what the diff cannot show                  |
| Silently choosing when unsure                        | Looks like a decision; is a coin flip the reader inherits                     | Section 9                                                      |
| Fixing branch state "helpfully" (rebase, stash, rm)  | Destroys context the owner may need; violates repository guardrails           | Section 8, report only                                         |

## Reader's protocol

If you are picking up a branch with one of these attached:

1. Read `[assumed]` and **Open questions** first. Those are your search space.
   Everything else, trust at the strength of its tag.
2. Treat any test marked `mutation: not run` as unverified. Run the mutation
   yourself before relying on it.
3. Run the `[not run]` gates before anything else — a change that has not seen
   the full gate has not been finished.
4. Do **not** re-inventory sites already listed with a reason unless the reason
   is wrong. Search only the gaps the inventory admits to.
5. Report what you changed in the same format. Your reader inherits your
   `[assumed]` tags exactly as you inherited theirs.

## Template

```markdown
# HANDOFF — <branch or topic>

## Status
<one sentence: what is done, what is not>
Working tree: <untracked files / unrelated commits / artifacts>

## Verified facts
- <claim> [verified: path:line]
- <claim> [assumed — <why you could not check>]

## Inventory
<path:line>  <role>  → changed
<path:line>  <role>  → left alone: <reason>
<path:line>  <role>  → not examined

## Tests
- <test file › name>: locks <invariant>. mutation: red ✅ | not run

## Gates
- <command> → pass | fail: <excerpt> | [not run]

## Decisions
- Chose <A> over <B> because <concrete reason>.

## Scope
Deliberately out: <item — reason>
Not reached: <item>

## Traps
- <symptom> — <cause> — <workaround>

## Open questions
- <question>?
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

## Where it lives

`HANDOFF-<topic>.md` at the repository root, committed together with the WIP
it describes (precedent: `HANDOFF-ADR-0002-EXEC.md`). When the PR opens, fold
the **Decisions**, **Scope**, and **Gates** sections into the PR description
and delete the file at merge. Keep it under ~60 lines; if it is longer, you are
describing the diff.
