# Rednote distribution diagnosis (2026-09-21)

Bounded diagnostic run before reworking the social headline policy. No code
changed as part of this document. Every number below comes from
`from_fed_to_chain.social_posts` joined to `social_post_metrics` at
`measurement_window = '24h'` (68 Rednote posts with a 24h observation).

## Why this exists

The working hypothesis was "0-view Rednote posts are caused by weak titles".
That hypothesis is wrong in its stated form, and acting on it would have aimed
the headline work at the wrong metric. The data separates into two independent
problems.

## Finding 1 — the view distribution is bimodal, not graded

| 24h views | posts |
| --- | --- |
| 0–20 | 21 |
| 20–40 | 1 |
| 40–60 | 2 |
| 60–80 | 1 |
| 80–100 | 8 |
| 100–120 | 13 |
| 120–140 | 10 |
| 140–160 | 6 |
| 160–180 | 5 |
| 180–240 | 0 |
| 240–260 | 1 |

Two modes with an almost empty valley between them. A title affects
click-through *after* impressions are served, which produces a continuous
distribution. A gap between 20 and 80 is a binary gate, not a gradient.

## Finding 2 — dead and live posts are indistinguishable on every authored dimension

| | dead (≤5 views) | live (>5 views) |
| --- | --- | --- |
| posts | 19 (28%) | 49 |
| avg 24h views | 0.7 | 114.9 |
| avg hashtag count | 4.53 | 4.55 |
| avg title length | 15.5 | 16.5 |
| avg publish hour (Taipei) | 12.6 | 11.7 |

`review_status` is `visible` for 65 posts and `null` for 9 (rows that predate
the column). Nothing is `rejected` or `self_only` — these posts were not held
by review.

Topic words do not separate the groups either: 比特幣 / 加密 / 以太坊 / DeFi
appear on both sides. This matches the existing rule in
`apps/podcast-pipeline/CLAUDE.md` — do not answer a zero-view post by adding its
subject to a term list.

Two further hypotheses were tested and did not hold:

- **Position within the day.** Dead rate by nth-post-of-day is 23% / 41% / 9% /
  50% (n = 31 / 22 / 11 / 4). Noisy, no trend.
- **Price-or-return framing in the title.** Present in both groups
  (`SOL單月漲近47%` died; `240倍？杜蘭特押HuggingFace` and `13億變70億` lived).

## Finding 3 — the live mode has a hard ceiling, and it never moves

Weekly, for posts that cleared the gate:

| week (Taipei) | posts | posts/active day | dead | dead % | avg live views | best |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-10 | 4 | 1.33 | 0 | 0% | 129 | 172 |
| 2026-08-17 | 5 | 1.67 | 2 | 40% | 132 | 147 |
| 2026-08-24 | 15 | 3.00 | 3 | 20% | 99 | 161 |
| 2026-08-31 | 11 | 1.57 | 1 | 9% | 125 | 245 |
| 2026-09-07 | 19 | 2.71 | 8 | 42% | 105 | 170 |
| 2026-09-14 | 14 | 2.33 | 5 | 36% | 125 | 174 |

`avg live views` has not moved in six weeks: 129 / 132 / 99 / 125 / 105 / 125.
Splitting by position within the day gives the same answer — 120 / 112 / 110 /
100. One post in 68 has ever exceeded 180 views.

Engagement inside that pool is near zero: most live posts sit at roughly
150 views / 1 like, and comments are 0 almost everywhere.

An account whose posts all land in one narrow band regardless of subject,
timing, ordering or week is being served a fixed first-pool exposure. Nothing
is graduating to a second pool.

## Finding 4 — the existing packaging experiment already reads out

`rednote-packaging-v1-zh-Hant` has 49 assignments. Joining
`social_experiment_assignments` on `episode_id`:

| variant | posts | dead | avg live views | best | total likes |
| --- | --- | --- | --- | --- | --- |
| direct | 20 | 10 (50%) | 135 | 245 | 23 |
| hook_first | 24 | 4 (17%) | 109 | 174 | 34 |

Small sample, and the two arms trade off against each other rather than one
dominating. Neither arm breaks the ceiling.

**Measurement note:** `social_posts.experiment_key` and `experiment_variant`
are `null` for all 74 Rednote rows — `enqueueCohortJobs`
(`src/social/daemon.ts`) never stamps a packaging assignment onto the job, so
it never reaches the post row. The durable record lives only in
`social_experiment_assignments`, so any experiment read-out must join that
table on `episode_id`. Grouping by `social_posts.experiment_variant` returns a
single null bucket.

## Finding 5 — the over-length titles are old data, not a live bug

Three Rednote rows carry a title far over the 20-character limit:

| published | chars | title head |
| --- | --- | --- |
| 2026-08-12 | 40 | `太刺激了！以太坊核心開發者Justin Drake提出了一個超激進提案：質押獎勵` |
| 2026-08-14 | 40 | `上半年韓國股市熱到發燙，散戶資金全往股票跑，加密交易量直接腰斬。但進入第三季度，` |
| 2026-08-15 | 40 | `2025年底，Manus以超過20億美元賣給Meta，從接觸到簽約僅10天。一週` |

All three are exactly 40 characters and `generated_title` equals
`published_title`, so a body prefix was written into the title field and
truncated at 40 by a path that no longer exists. They fall in one three-day
window in August and nothing since. The current schema caps the title at 20
characters (`REDNOTE_TITLE_MAX_CHARACTERS`, `src/social/copy.ts`). No action.

## Not done: creator-backend inspection

The plan called for comparing 3 dead against 3 live posts in
`creator.rednote.com` 笔记管理 to read the platform's own status and any
薯条/限流 notice.

**This was not run.** `social:daemon` is running on this Mac (pid observed
2026-09-21) and publishes through the same persistent Chrome profile at
`~/.zap-pilot/rednote-chrome-profile`. Playwright takes an exclusive lock on
that profile, so opening it while the daemon is live can fail a real publish.
The profile was not locked at the moment it was checked, which is the
dangerous case, not the safe one — the daemon grabs it on its own schedule.

To run it safely: stop `social:daemon`, then drive the profile, then restart.
Candidate posts are recorded below.

Dead: `6aae43830000000019031bd3` (`Hayes預測歐元兌日圓跌到140`),
`6aa9e3d800000000190319e4` (`阿根廷比索加密交易94%流向穩定幣`),
`6aa34ee8000000001401e7dd` (`SOL單月漲近47%！機構是關鍵買盤`).

Live: `6aa8f45100000000100001dc` (`a16z：AI基建連銅礦都在缺`, 174),
`6aa4a029000000001401208e` (`韓國與全球加密差距比2021年還大`, 170),
`6aa892410000000019032b9e` (`特朗普家族信託銀行最大股東是阿布扎比王室`, 128).

## Finding 6 — concreteness cannot be checked mechanically on Chinese titles

The headline policy asks every title to carry a proper noun or a number. A
validator for that was written and reverted.

A Chinese proper noun has no orthographic marker: 輝達 (Nvidia) and 車企 (car
makers) are indistinguishable to a matcher, and neither shares characters with
a source headline that named the company in Latin script. Run over all 66
published Rednote titles joined to their `episodes.source_title`, a
digit-or-Latin-or-source-overlap proxy rejected five, including:

| title | 24h views | why it was rejected |
| --- | --- | --- |
| `輝達股票變成鏈上抵押品了` | **245** | best post in the corpus; source headline was `Coinbase 正式把美股搬上 Base` |
| `競爭者不搶交易老手，反而把市場做大` | 97 | |
| `機器人還得等幾年？` | 62 | |
| `政客想把債券燒掉？` | 12 | |
| `百年前期貨也曾是賭博` | 0 | |

The rule stays in the prose policy, where the writer can apply judgment.

With that check removed, the shipped validators reject **1 of 66** published
titles: `全員AI化後，公司反而傳統？` (0 views), whose source headline was
`创业两年半，全员AI化后，公司反而变得更"传统"了` — the publisher's clause
copied nearly verbatim. That is the failure the similarity ceiling exists for.

## Conclusion

Two independent problems:

- **A — the 0-view gate.** 28% of posts get no distribution at all, and the
  cause is not in the authored copy. This is account- or platform-level and is
  not addressable from the prompt. Still unexplained; needs the creator-backend
  evidence above.
- **B — the ~180-view ceiling.** Every post that *is* distributed lands in one
  narrow band and does not graduate. This is where copy can act.

Headline work targets B. Its success metric is `avg live views` and `best`
moving past the current 100–130 / 245 ceiling, and like rate rising. **It is
not "dead posts disappear"** — expect that number to be unchanged by any
headline change, because it is problem A.
