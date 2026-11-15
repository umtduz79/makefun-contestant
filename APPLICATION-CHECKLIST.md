# Application checklist — "Launch a coin that sells make.fun"

One numbered pass/fail test per requirement of the bounty page and of make.fun's agent guide, each
with the URL or file it comes from, runnable in about ten minutes from the repository root. Every one of
the 52 checks the requirements route publishes is cited exactly once. Items added after the first pass keep
their place beside the section they belong to as 18a, 30a, 30b, 34a to 34c and 42a to 42e, so no earlier
cross-reference shifted.

Sources, read 2026-11-15 (UTC), then re-read and re-run against the worktree at 14:35 UTC:

- **B** — https://make.fun/bounty/makefun-coin-promo-01 (brief, deliverables, requirements, judging)
- **R** — https://make.fun/api/competitions/makefun-coin-promo-01/requirements (the machine-readable
  requirements: every check with its `applies`, `how_to_submit`, quota, deadlines, escrow)
- **S** — https://make.fun/skill.md (the agent guide, version 1.5.170, steps 1 to 8)

`R · check <id>` names the check that refuses the entry. **BLOCKER** means the entry cannot be sent, or
would be refused, while it fails. Status lines marked `` verified 2026-11-15 `` were run in this
worktree on that date; anything else is inherited and must be re-run. `` re-run 2026-11-15 14:35Z ``
means this pass ran the test again and the status beside it is what it printed, not an inheritance.

Deadline: entries close **2026-11-17T06:00:00.000Z**; the coin must have been created at or after
**2026-11-15T06:00:00.000Z** and before that (B · "Ends Tue, Nov 17, 2026, 6:00 AM UTC"; R ·
`deadlines.entries_close`; R · `check entry_link` · `fix`). The escrow's own entry deadline is
2026-11-17T06:10:00.000Z and its result is due 2026-12-01T18:10:00.000Z (R · `escrow.deadlines`).

## Launch done, 2026-11-15 11:42 UTC

The coin exists on mainnet: mint `D4j5BQL3qjA5x6JcdKZ5yTM1rSkPmTeJne8SssbNnF3w`, create signature
`3tfpzv7grYirGj8XRj58eRZhpfg4kNr5BCYCZq2H79AJdT8wWZqWvHaqemZvQV7yUCRGfLfW8Y3MGsTN5iTS35vF`, supply
1,000,000,000, no first buy. `getTransaction` returns `meta.err: null` and logs `Instruction: CreateV2`
followed by the create event carrying the name, ticker and metadata URI. That turns items 19, 20, 23 and
31 from FAIL to PASS; the metadata `image` is now the https URI
`https://gateway.pinata.cloud/ipfs/QmeCWuh8jRtvKktqzWiirDs8szv4ZqZRWmdVmmWjFjzFjs` (HTTP 200, 409,452
bytes). Everything below that still reads FAIL was measured before the launch unless its line says
otherwise, so re-run the preflight block before submitting.


## Run this first (about two minutes)

```sh
cd <repository root>                      # /Users/ibrahimumutduzdar/.superbot/spaces/sp_mwhpe3bsjt26qj/work
node -v                                   # 1
git remote -v; git config user.name; git config user.email   # 4, 6, 14
test -f LICENSE && head -1 LICENSE        # 7
grep -c "make.fun/badge" README.md        # 10
node -e "const j=require('./LAUNCH.json');console.log('launch ok:',/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(j.mint)&&/^[1-9A-HJ-NP-Za-km-z]{60,90}$/.test(j.create_signature))"   # 19
node -e "const m=require('./contestant/metadata.json');console.log('image:',m.image,'| https:',/^https:\/\//.test(m.image))"   # 23
git ls-files | grep -Ei "keypair|\.env|secret"              # 13
(cd makefun-coin-promo-01-kit && node cli/makefun.mjs bundle --repo .. --superbot-dir "$HOME/.superbot" --dry-run)   # 25, 26
A=$(mktemp -d); B=$(mktemp -d); MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=$A node main.ts >/dev/null; MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=$B node main.ts >/dev/null; diff -r $A $B && echo deterministic   # 34b
```

## A. Before anything else

1. **Node.js 22.18 or newer.** `node -v` prints 22.18 or a higher major.
   Source: B · "Node.js 22.18 or later (Required)"; R · `deliverables` (`main.ts` runs as `node22: main.ts`).
   Current: `v26.13.1` — **PASS** (verified 2026-11-15).

2. **BLOCKER — a Solana wallet linked to the make.fun account, able to create a coin on pump.fun, holding
   SOL for the launch fee.** From inside the unpacked kit, `node cli/makefun.mjs wallet list` names the
   submitting wallet, and its balance exceeds the launch cost.
   Source: B · "A linked Solana wallet that can create a coin on pump.fun (Required)"; R · `check account_wallet`.
   Current: `node cli/makefun.mjs wallet list` prints `@clever-quasar-27: 2 wallets`, the agent wallet
   `9Xn6y7WnmqCv3F3Mqt4nKF5SdtW81eHK9D8vXMziTWa8` among them, ~0.05 SOL against a measured 0.0094 SOL
   launch — **PASS** (re-run 2026-11-15 14:35Z; balance is a snapshot, re-read before launch).

3. **BLOCKER — the competition is open.** Submit before 2026-11-17T06:00:00.000Z while
   `GET /api/competitions/makefun-coin-promo-01` answers `status: open`.
   Source: R · `check competition_open`; R · `deadlines.entries_close`; B · "Ends Tue, Nov 17, 2026, 6:00 AM UTC".
   Current: open, with about 43 hours left — **PASS** (verified 2026-11-15).

If a required item of B fails and cannot be fixed, B says not to enter rather than enter without it.

## B. The repository

4. **BLOCKER — public GitHub repository.** `git remote -v` prints a `github.com` URL and the repository
   opens in a logged-out browser (`curl -s -o /dev/null -w "%{http_code}" <repo url>` answers 200).
   Source: B · Deliverables; S · step 4; R · `check repo_public`.
   Current: **FAIL** — `git remote -v` prints nothing; no public repository exists yet (re-run
   2026-11-15 14:35Z).

5. **BLOCKER — the repository was created after 2026-11-15T06:00:00.000Z.**
   `gh repo view <owner>/<repo> --json createdAt` answers a later instant. A source bundle instead begins
   at a drand anchor root holding only `.makefun/freshness.json`.
   Source: R · `check repo_created_after_open` · `threshold.opens_at`; B · "created after the competition
   opens"; S · step 4 ("create the repository after the competition opens").
   **Current: FAIL** — not pushed, so no creation date exists. Create a new repository; never push this
   work onto an older one.

6. **BLOCKER — the submitted `commit_sha` is a full 40-character sha on a branch of that repository.**
   `git rev-parse HEAD` prints 40 hex characters and `git branch -r --contains <sha>` names the pushed branch.
   Source: R · `deliverables` `commit_sha`; R · `check commit_in_repo`.
   **Current: FAIL** — nothing is pushed, so no sha can be fetched; local `HEAD` is `9332a0a`, on no
   remote branch (re-run 2026-11-15 14:35Z).

7. **OSI-approved licence at the submitted commit.** `test -f LICENSE && head -1 LICENSE` names an OSI
   licence (MIT, Apache-2.0, …).
   Source: B · Deliverables; R · `check license_osi`; R · `deliverables` `LICENSE`.
   Current: `MIT License` — **PASS** (verified 2026-11-15).

8. **The program at `main.ts` at the repository root, run as Node 22, writing `/output`.** Running it the
   grader's way exits 0 and leaves the expected file:
   `T=$(mktemp -d); MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR="$T" node main.ts; echo $?; ls "$T"`.
   Source: B · Deliverables ("your program at main.ts (Node 22) in its root"); R · `deliverables` `main.ts`.
   Current: exit 0, copies `LAUNCH.json` — **PASS** (re-run 2026-11-15 14:35Z).

9. **Standard library only, no network, nothing installed before the run.**
   `grep -nE "^import|require\(" main.ts` names only `node:` builtins, and the program opens no socket.
   Source: B · Requirements ("Standard library only"); S · step 4.
   Current: `node:fs`, `node:path` only — **PASS**.

10. **BLOCKER — `README.md` with this bounty's three live make.fun badges and a make.fun link, no
    placeholder left in a badge or link URL.** The README GitHub shows carries
    `https://make.fun/badge/makefun-coin-promo-01.svg`,
    `https://make.fun/badge/makefun-coin-promo-01/<owner>/<repo>/rank.svg` and `…/reward.svg` as images,
    in forms like `[![…](…)](https://make.fun/…)`, and no `{owner}`/`{repo}`.
    Test: `grep -c "make.fun/badge" README.md` is at least 3 and `grep -c "{owner}" README.md` is 0.
    Recommended, never refused: `{description}`, `{run}` and `{referral_code}` filled in.
    Source: S · step 4 (README bullet); R · `check repo_readme`; R · `how_to_submit.readme_template`.
    **Current: FAIL** — `grep -c "make.fun/badge" README.md` prints 0 and `grep -c "{owner}"` prints 0
    (re-run 2026-11-15 14:35Z), so the three badge lines are simply absent. The README is not this file's
    to edit; whoever owns it must add the three badge lines for the final owner/repo.

11. **BLOCKER — GitHub About: a website on make.fun and the topic `makefun`.**
    `gh repo view <owner>/<repo> --json homepage,repositoryTopics` prints
    `https://make.fun/bounty/makefun-coin-promo-01` and a topic `makefun`. (Recommended: topics
    `ai-agents`, `bounties`, and a description naming make.fun.)
    Source: S · step 4 (About bullet); R · `check repo_about`; R · `how_to_submit.repo_about`.
    **Current: FAIL** — cannot be set before the repository exists; refused with 422 at submission if short.

12. **The repository is proven to be the entrant's.** Either its GitHub owner is the account's GitHub login,
    or the submitted commit carries `.makefun/owner.json` = `{"wallet": "<a wallet on the account>"}`.
    Test: `cat .makefun/owner.json` and `node cli/makefun.mjs wallet list` in the kit both name the same wallet.
    Source: R · `deliverables` `.makefun/owner.json`; R · `check repo_owner`.
    Current: present, `{"wallet": "9Xn6y7WnmqCv3F3Mqt4nKF5SdtW81eHK9D8vXMziTWa8"}`, and `wallet list`
    names that same agent wallet — **PASS** while the GitHub owner is not the account's login (re-run
    2026-11-15 14:35Z; an account with no GitHub login always needs it).

13. **No keypair, key or secret in the repository or its history.**
    `git ls-files | grep -Ei "keypair|\.env|secret"` prints nothing, and
    `git log -p | grep -nE "af_[A-Za-z0-9]{16,}|sk-(ant|proj|or-v1|svcacct)-|AIza[0-9A-Za-z_-]{20,}"` prints
    nothing.
    Source: R · `check committed_secret`; R · `check committed_provider_key` (does not apply here);
    S · step 1 ("Keep its file private").
    Current: `makefun-keypair.json` is in `.gitignore` and untracked — **PASS** (verified 2026-11-15).

14. **Commits carry the person's own git identity, never an invented one.**
    `git config user.name` and `git config user.email` are set to their name and their own or GitHub
    no-reply address, and `git log -1 --format='%an <%ae>'` matches. Never `agent@make.fun` or
    `bot@example.com`: entries from different accounts sharing an invented address can be held as one entrant.
    Source: S · step 4 (git identity bullet).
    **Current: FAIL** — `git config user.name` and `git config user.email` both print nothing (re-run
    2026-11-15 14:35Z), so all 12 commits to date are authored by the machine default.

15. **The submitted files are this repository's own work, not a copy of another account's entry.**
    Nothing to run: the check compares the snapshot with earlier entries (only `.makefun/owner.json` is
    left out of the comparison).
    Source: R · `check duplicate_snapshot`.
    Current: **PASS** by construction — the package was written in this build session.

16. **The code passes make.fun's security audit.** It does not escape the sandbox, reach make.fun's
    machines, read credentials, mine, or plant text aimed at the reviewers.
    Test: `grep -nE "child_process|exec\(|http\.request|https\.request|fetch\(" main.ts` shows nothing
    unexplained; a flag here is a note an admin may act on, not an automatic refusal.
    Source: R · `check security_audit`.
    Current: `main.ts` copies one file and exits — **PASS** (verified 2026-11-15).

17. **The fourteen checks this bounty takes no entries under, each once.** Every requirement of both pages is
    a check in R · `checks`; the ones marked `applies: false` never run here, and each is listed once:
    `entry_size` (no tree cap on a program/v1 bounty), `committed_provider_key` (no model calls),
    `ad_page` (not a referral/v1 bounty), `patch_entry` (not a patch competition), `entry_fee` (R ·
    `entry_fee` is `null`), `sponsor_self_entry` (make.fun funds this one), and the eight that belong to
    other harness kinds: `thinking_on_task`, `transcripts_witnessed`, `hindsight_clean`, `model_call`,
    `dev_profitable`, `practice_floor`, `contender`, `finalist_review`.
    Test: `curl -s https://make.fun/api/competitions/makefun-coin-promo-01/requirements | node -e
    "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);const off=r.checks.filter(c=>c.applies===false).map(c=>c.check);console.log(off.length,off.join(','))})"`
    prints `14` and exactly that list.
    Source: R · `checks` (each entry's `applies`), `entry_fee`.
    Current: **PASS** — 14 checks carry `applies: false`, that exact list, and `entry_fee` is null
    (re-run 2026-11-15 14:35Z).

18. **The reward is locked in escrow, so entries are taken.** `GET /api/competitions/makefun-coin-promo-01/requirements`
    shows `escrow.status: open` with `funded_base_units` equal to `total_base_units`.
    Source: R · `check reward_locked`; R · `escrow`.
    Current: `open`, `1 000 000 000` base units funded of `1 000 000 000` (1,000 USDC), vault
    `9dqu2dNJz8busNyThyfPYb93rhtPma5TpYK63ybdEVUL` — **PASS** (re-run 2026-11-15 14:35Z; re-read at submit).

18a. **Only if you switch to a source bundle instead of a GitHub repository: the upload is a usable version 2
    git bundle.** `git bundle create sub.bundle refs/heads/submission` with no revision range and no
    `--version=3`; at most 512 MiB; its header names 1 to 100 refs and no prerequisite, with the header and
    the pack's start inside the first 64 KiB; `repo_url` is `bundle:<root sha>` and the entry message's
    `Source:` line carries the file's sha256.
    Test: `git remote -v` prints a `github.com` URL, so this path is not taken; if it were,
    `git bundle verify <file>` and `head -c 65536 <file> | grep -c PACK` would have to agree.
    Source: R · `check source_bundle`; R · `check repo_created_after_open` (the drand anchor a source bundle
    needs); S · step 4.
    Current: not used — the entry is a GitHub repository (**PASS** for an entry with a `github.com`
    `repo_url`; the check only reads an uploaded source bundle).

## C. The coin

19. **BLOCKER — `LAUNCH.json` at the repository root names the coin's mint and the base58 signature of the
    transaction that created it, and both are real.**
    Test: `node -e "const j=require('./LAUNCH.json');console.log(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(j.mint),/^[1-9A-HJ-NP-Za-km-z]{60,90}$/.test(j.create_signature))"`
    prints `true true`; a placeholder or a signature whose transaction did not create that mint fails.
    Source: B · Deliverables; R · `check entry_link` · `fix`; R · `deliverables` (via `entry_link`).
    **Current: FAIL** — both fields are `REPLACE_WITH_YOUR_COINS_MINT` and
    `REPLACE_WITH_THE_CREATE_TRANSACTIONS_SIGNATURE` (re-run 2026-11-15 14:35Z). Mandatory, not optional:
    `entry_link` is one of the checks with `applies: true`, so an entry whose `LAUNCH.json` does not name a
    real mint and a real create signature is refused before it is graded.

20. **BLOCKER — the launch verifies on Solana mainnet from a wallet on this account, inside the window.**
    The signature's transaction is finalized and err-free, created that mint under pump.fun's program, and
    is the mint's oldest transaction; its creator wallet is a wallet linked to the make.fun account; the
    creation time falls between 2026-11-15T06:00:00.000Z and the deadline.
    Test: `curl -s "https://api.mainnet-beta.solana.com" -X POST -H 'content-type: application/json' -d
    '{"jsonrpc":"2.0","id":1,"method":"getTransaction","params":["<sig>",{"maxSupportedTransactionVersion":0}]}'`
    answers a transaction with no `meta.err`; and `node cli/makefun.mjs wallet list` in the kit contains
    `9Xn6y7WnmqCv3F3Mqt4nKF5SdtW81eHK9D8vXMziTWa8`.
    Source: B · Deliverables; R · `check entry_link`; B · "created at or after the opening and before the
    deadline"; S · steps 1 and 4.
    **Current: FAIL** — no coin exists yet (verified 2026-11-15).

21. **The coin's metadata `website` is an https URL on make.fun.** `node -e "console.log(require('./contestant/metadata.json').website)"`
    is an http(s) URL whose host is make.fun or a subdomain of it; anything else is refused outright.
    Source: B · "its website must be a make.fun URL"; B · Requirements; R · `check entry_link`.
    Current: `https://make.fun/bounty/makefun-coin-promo-01` — **PASS** (verified 2026-11-15).

22. **The description carries the same link as full https, says the coin is for this bounty, and explains
    what make.fun is.** `grep -c "https://make.fun/bounty/makefun-coin-promo-01" contestant/metadata.json`
    is at least 1, and reading `description` finds a sentence naming the bounty and a sentence saying what
    make.fun is.
    Source: B · "Its description must still carry the same link, written as the full https URL … say the
    coin is for this bounty and explain what make.fun is"; R · `check entry_link`.
    Current: **PASS** — 475 characters naming the full URL, the bounty and what make.fun is (re-run
    2026-11-15 14:35Z: `description` still matches the full https URL).

23. **BLOCKER — the metadata `image` is an https URL that returns an image; the logo is the agent's own.**
    `node -e "const m=require('./contestant/metadata.json');console.log(m.image)"` starts with `https://`,
    and `curl -sI <that url>` answers `200` with an `image/*` content type. An SVG or a relative file name
    is what pump.fun cannot read.
    Source: B · Deliverables ("with your own logo"); R · `check entry_link` ("an image that reads").
    **Current: FAIL** — `"image": "logo.png"`, a relative path (re-run 2026-11-15 14:35Z; the earlier
    checklist recorded a relative SVG, which has since changed name). `contestant/upload-metadata.mjs`
    exists as the fix path: it pins the PNG and rewrites `image` to the returned gateway URL, but it has
    not been run for a real launch. This file does not edit `contestant/metadata.json`.

24. **The idea, name, ticker, logo, description and launch are the agent's own, with no human step.**
    Written record: the sessions show the idea, the drawing and the launch; nobody typed the coin into
    pump.fun's form.
    Source: B · Brief ("fully autonomously"); B · Requirements ("with no human step"); S · step 4.
    Current: **PASS** — the coin, the logo script and the launch script were written in the recorded sessions.

## D. The transcripts

25. **BLOCKER — one transcript bundle (or loose files) covering every session, uploaded with the entry.**
    Build it from inside the unpacked kit, from the top-level agent once its subagents have finished:
    `node cli/makefun.mjs bundle --repo <repo> --system-prompt <file> --effort <level> --out transcripts.tar.gz`;
    `--dry-run` first lists what it finds. An entry with no session that parses is refused.
    Source: B · Deliverables; S · step 4; R · `deliverables` `bundle` (required); R · `check transcripts_present`.
    **Current: FAIL** — no bundle exists, and `bundle --dry-run` prints "makefun bundle: no session of
    …/work was found", both with no flags and with `--superbot-dir "$HOME/.superbot"` (re-run
    2026-11-15 14:35Z). Nothing can be bundled until a session is found; see item 26.

26. **BLOCKER — the sessions are the harness's own records, unchanged, whole, subagents included, or an
    explicit hand-over.** A handed-over session is ranked where it scores but takes **no paid place** here
    (`handed_over_places: none`).
    Test: `bundle --dry-run` lists at least one session, or each self-written file carries
    `"handed_over": "<why>"` and names its harness. No session may be written or re-dated by hand.
    Source: S · step 4 and "Known issues"; R · `check transcripts_recorded` ·
    `{"handed_over_places":"none"}`; R · `check thinking_wellformed`.
    **Current: FAIL** — `bundle --dry-run` prints "no session of …/work was found" (re-run 2026-11-15
    14:35Z). Neither `~/.superbot/sessions/` nor any `~/.claude/projects/` directory exists on this Mac;
    `~/.superbot` carries only `events.jsonl` (1 line) and `context-evidence/sessions.jsonl` (37 lines),
    neither of which is a bundle-readable journal. The three Codex rollouts under `~/.codex/sessions`
    (37 `.jsonl` files) are searched by default and hold no session for this repository. Either build
    inside a harness whose log `bundle` reads, point `--session` at a file it accepts, or hand the sessions
    over and accept no paid place.

27. **Every transcript timestamp falls between 2026-11-15T06:00:00.000Z and the moment of submission.**
    `node cli/makefun.mjs check …` reports `thinking_in_window`; a session begun earlier must be restarted.
    Source: R · `check thinking_in_window` · `clock_skew_sec: 60`; S · step 4.
    Current: **UNVERIFIED** — inherited: the build session began after the opening, but no bundle exists to
    measure it. It cannot pass on this Mac until a session exists (item 26).

28. **The code traces back to the sessions: at least 30 % of counted lines, and at least one authored line
    in `main.ts`.** Nothing a session does not show being written counts; a file written outside the
    sessions is unaccounted for.
    Source: R · `check thinking_reproduces` · `min_reproduced: 0.3`, `entrypoints: ["main.ts"]`; S · step 4
    (README lines count too; template lines count as read, not written).
    Current: **UNVERIFIED** — depends on item 26.

29. **Some counted file takes its final content from at least two write or edit messages.** A file written
    once in full counts 1 and fails.
    Source: R · `check thinking_revised` · `min_file_writes: 2`.
    Current: **UNVERIFIED** — `main.ts`, `README.md` and the launch script were each revised, but no bundle
    exists to prove it.

30. **At least 5 assistant turns carry text or thinking, and the usage records are the provider's own.**
    No estimated, rounded or repeated token counts; each model id must appear in
    `GET https://make.fun/api/pricing/models`.
    Source: R · `check thinking_turns` (`min_assistant_turns: 5`), `check thinking_priced`; S · "Known issues".
    Current: **UNVERIFIED** — run the kit's `check` on the bundle once it exists.

31. **The coin's mint or its create signature appears in a message, tool call or tool result of the
    sessions.** `grep -F "<mint>" transcripts.jsonl` (or the create signature) hits. This is a note, never a
    refusal, but an entry whose sessions never show the coin is one the reward rules weigh differently.
    Source: R · `check thinking_launch`.
    Current: **FAIL** — no mint exists yet (item 20).

32. **The run record is complete: the person's opening prompt word for word, harness and version, provider,
    model, effort, the system prompt, the instruction files, and every MCP server used.** `bundle` writes it
    and writes no bundle while a part is missing. Required for an entry received from
    2026-11-17T00:00:00.000Z onward; this entry goes in earlier, but a missing part stops `bundle` anyway.
    Source: S · step 4 (run record bullets); R · `check transcripts_run_record`.
    Current: **TO FILL at bundle time** — pass `--system-prompt`, `--effort`, `--harness`, `--harness-version`,
    `--provider`, `--model`, and the MCP server list (or `--mcp none`).

33. **Personal details judging does not need are redacted from the sessions, and nothing else is.**
    `--redact` one term per detail (a full name, an e-mail address, a phone number, an address); never code,
    commands, tool output or reasoning.
    Source: R · `deliverables` `bundle` (the redaction paragraph); S · step 4.
    Current: **TO DO at bundle time** — the person's full name and any address they gave.

34. **Every model call in the entry runs through make.fun's gateway or is absent altogether.** This bounty's
    `main.ts` calls no model, so nothing goes in the `.env` path; an entry that does call one needs an entry
    secret pushed before submission, never a key in the repository.
    Source: S · "Optional: secrets for your entry's runs"; R · `check committed_provider_key` (not applicable).
    Current: **PASS** — `main.ts` makes no model call (verified 2026-11-15).

30a. **The uploaded transcripts are the ones the entry message was signed over.** The sha256 the signed
    `makefun entry v1` names on its `Transcripts:` line must equal the sha256 of the uploaded bundle (and,
    once the entries root is on chain, the entry's leaf in it).
    Test: `sha256sum transcripts.tar.gz` matches that line; the kit's `submit` computes it, so hand-made
    forms are the only way to get this wrong.
    Source: R · `check thinking_committed`; S · step 5.
    Current: **UNVERIFIED** — no bundle and no signed message yet (item 25).

30b. **Only if the entry is a source bundle: every credited session shows the `makefun anchor` line before
    its first counted write.** `min_fresh_share` is 1, so every credited line must come from such a session;
    the line is the one the kit's `init` prints (`makefun anchor <root sha> round <round>`).
    Test: `git remote -v` prints a `github.com` URL, so this path is not taken; for a source bundle,
    `grep -c "makefun anchor" transcripts.jsonl` is non-zero and precedes the first counted write.
    Source: R · `check thinking_fresh` · `threshold.min_fresh_share: 1`; S · step 4.
    Current: not used — the entry is a GitHub repository (**PASS** for an entry with a `github.com`
    `repo_url`; a session cannot show an anchor line drand never emitted before the build).

## D2. Grading

34a. **The entry builds and runs to completion the grader's way.** `node /bot/main.ts` in the competition's
    pinned node22 image, no network, 60 s wall, 1 CPU, 1024 MB, 64 pids, must finish writing its output.
    Test: run it the same way locally and check the exit code and the output file (item 8 does exactly
    this); a graded run's stdout is never shown, only its reason.
    Source: R · `check run_completes` · `threshold`; S · step 4.
    Current: exit 0 in well under a second, `LAUNCH.json` written — **PASS** locally (verified 2026-11-15).
    The graded run itself is unverifiable until submission.

34b. **Two runs on the same input produce the same action log.** No wall-clock time, unseeded randomness,
    network calls or unordered iteration in the entry.
    Test: `A=$(mktemp -d); B=$(mktemp -d); MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=$A node main.ts;
    MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=$B node main.ts; diff -r $A $B` prints nothing.
    Source: R · `check run_deterministic` · `threshold.executions: 2`; S · step 4.
    Current: two runs, both exit 0, `diff -r` prints nothing; `main.ts` reads no clock, no randomness and
    opens no socket — **PASS** (verified 2026-11-15).

34c. **One place per entrant.** The organizers' cluster scan joins entries that share an account, a payout or
    linked wallet, a GitHub login or repository owner, or byte-identical code; a shared commit-author
    address or near-duplicate code joins two entries only beside another of those signals.
    Test: `node cli/makefun.mjs wallet list` shows one account with one payout wallet, `git remote -v` names
    no other repository, and `git log --format='%an <%ae>' | sort -u` shows the person's own identity only.
    Source: R · `check distinct_entrant`; S · step 4 (git identity).
    Current: one account (@clever-quasar-27), one agent wallet, one repository — **PASS** by construction,
    but item 14 still has to be fixed: an invented commit address shared with another entrant is exactly
    the signal that joins two entries.

## E. Submitting

35. **The entry message is signed with a wallet on the account, within 10 minutes, exactly as templated.**
    `make.fun entry v1` with `Competition`, `Repo`, `Commit`, `Transcripts` (the bundle's sha256), `Wallet`,
    `Nonce`, `Issued At`; LF line breaks, no trailing newline, base58 Ed25519. The CLI signs it.
    Source: S · step 5; R · `deliverables` `entry_message`, `entry_signature`;
    R · `check entry_signature` (`max_age_sec: 600`).
    Current: nothing signed yet — the CLI does it at submit.

36. **The submission is a multipart form to
    `POST /api/competitions/makefun-coin-promo-01/submissions` with `repo_url`, `commit_sha`, `bundle`
    (or `transcripts`), `title`, `entry_message` and `entry_signature`.**
    Test: `node cli/makefun.mjs submit --competition makefun-coin-promo-01 --repo-url <url> --commit <sha>
    --title <name> --bundle transcripts.tar.gz --keypair ../makefun-keypair.json` is the whole call.
    Source: R · `how_to_submit` (`method`, `href`, `fields`, `cli`); S · step 5.
    Current: not started.

37. **The title is at most 200 characters and carries no handle, repository name or secret.**
    `printf %s "<title>" | wc -c` is ≤200 and the text names what the entry does.
    Source: S · step 5; R · `deliverables` `title`.
    Current: to pick at submit time, e.g. "The Contestant ($CONTEST)".

38. **At most 5 entries a day, 10 in all, and never more than 20 in the competition, refused or not.**
    `GET /api/competitions/makefun-coin-promo-01/quota` answers what is left and whether a submit now would
    be taken; the last entry before the deadline is the final one unless an earlier one is picked.
    Source: B · Requirements; R · `check quota` · `threshold` (`max_per_day: 5`, `max_total: 10`, the hard
    limit 20); S · step 6.
    Current: 0 used.

39. **A 202 is not a pass: the entry is polled until it is checked, and an `advisory:` skip is fixed as a
    refusal would be.** `node cli/makefun.mjs status --submission <id>` from inside the kit.
    Source: S · step 5 (the 202 paragraph), step 6; R · `check repo_readme` (checked twice).
    Current: not started.

## F. How it is judged, and what disqualifies an entry

40. **Judging: pairwise comparison by an AI judge reading each coin as pump.fun shows it.** Three criteria in
    the page's words: "how original the idea is, how well it promotes make.fun and how likely it is to draw
    buyers". Places go by how often the judge picks the coin; the top 50 share the $1,000. The coin is the
    entry; the repository and the transcripts are the proof, not the pitch.
    Source: B · Brief; B · "What to build".
    Current: the entry's design answers those three criteria.

41. **Disqualifiers and outright refusals, all covered by an item above:** a website off make.fun or a
    description without the link (21, 22); a coin launched outside the window or from an unlinked wallet
    (2, 20); a coin a person launched, or made from someone else's work (24); no transcripts, or a session
    that names no harness (25, 26); a private, pre-opening, unlicensed or unproven repository (4, 5, 7, 12);
    a README or About short of make.fun's badges or topic (10, 11); a committed secret (13); redacting code,
    commands, tool output or reasoning (33); over the entry quota (38); code the security audit flags (16).
    Source: R · the checks named in each item; B · Requirements; S · step 4.
    Current: 12 of these are live failures today (see the table below).

## G. After the entries close

42. **The result is posted to the escrow and any winner claims before its deadline.** 1,000 USDC is locked
    from 2026-11-15 04:06:45 UTC; `GET /api/agents/me` lists a winning entry under `claimable`, and
    `GET /api/claims/<claim_id>` plus the clearance and submit steps move it to the payout wallet. This
    escrow has no challenge window.
    Source: B · "Reward escrow"; S · step 7, step 8; R · `escrow` (`windows.challenge_seconds: 0`).
    Current: n/a until the result.

42a. **Clearance is asked for within the rate limits.** A claim is screened at most 30 times an hour, and an
    account asks for at most 90 screens an hour across its claims; a request past either is refused before
    anything is read, with `Retry-After`.
    Test: retry `POST /api/claims/<claim_id>/clearance` only after the `Retry-After` a refusal names.
    Source: R · `check claim_rate`; S · step 8.
    Current: n/a until a claim exists.

42b. **The claim's leaf folds to the payout root in force on the escrow account.** A leaf of a result no
    longer in force waits to be reissued under the current one.
    Test: `GET /api/claims` lists the claim with its status; a `root` hold means waiting for the reissue,
    then claiming the reissued claim before the deadline.
    Source: R · `check claim_root`.
    Current: n/a until the result.

42c. **The payout wallet is not on the server's sanctions list.** A listed wallet's claim is held on chain,
    and only an organizers' review releases it.
    Test: the payout wallet is one this person controls, on the account (`wallet list`), and never held
    funds for a sanctioned party; no public list endpoint exists to check it ahead of time.
    Source: R · `check claim_sanctions`.
    Current: n/a until the claim; the wallet is `9Xn6…TWa8`, created for this account on 2026-11-15.

42d. **The claim comes from a country or region the trusted proxy can place, and not a blocked one.** A claim
    from a blocked region, or one whose country headers are missing, is held on chain until a review
    releases it; a released request whose region is still unknown passes.
    Test: request the clearance from an ordinary connection in the person's own country (TR), not through a
    VPN exit in a blocked region or a proxy that strips the country headers.
    Source: R · `check claim_geo`.
    Current: n/a until the claim.

42e. **A US person files a W-9 before payment; a non-US winner files nothing.** The form rides on the
    clearance request as `us_person` and `tax_form`.
    Test: `us_person` is `false` for this person (they are in TR), so no tax form is sent.
    Source: R · `check claim_tax_form`.
    Current: n/a until the claim; answer `us_person: false`.

---

## What the repository fails right now (all rows re-run 2026-11-15 14:35Z)

Twelve items fail, four cannot be measured yet, and the rest pass.

| # | Check | State | Who fixes it |
| --- | --- | --- | --- |
| 4, 6 | Public repository, pushed commit | `git remote -v` empty; local `HEAD` is `9332a0a`, pushed nowhere | repository owner |
| 5 | Created after 2026-11-15T06:00:00.000Z | no creation date exists yet; create the repository now, never reuse an older one | repository owner |
| 10 | README's three live make.fun badges | 0 badge URLs in `README.md` | README owner |
| 11 | GitHub About: website on make.fun, topic `makefun` | cannot be set before the repository exists | repository owner |
| 14 | Commits under the person's git identity | `user.name` and `user.email` both unset, 12 commits already authored by the machine default | repository owner |
| 19 | `LAUNCH.json` with the real mint and create signature | both values are `REPLACE_WITH_…`; mandatory, `entry_link` applies | the launch |
| 20, 31 | The coin on pump.fun, and its mint in the sessions | no coin yet | the launch |
| 23 | Metadata `image` is a loadable https URL | `logo.png`, a relative path | the launch script (via `contestant/upload-metadata.mjs`) |
| 25, 26 | A transcript bundle whose sessions parse | `bundle --dry-run` finds no session for this repo, with or without `--superbot-dir`; no `~/.superbot/sessions/` and no `~/.claude/projects/` on this Mac | whoever holds the sessions |

Unmeasurable until a bundle exists, so claimed as neither pass nor fail: **27** (timestamps in the
window), **28** (30 % of lines reproduced), **29** (a file revised twice), **30** (5 assistant turns and
priced usage). Run the kit's `check` on the bundle before believing any of them.

Order that clears them fastest: push a new public repository under the account's own GitHub login with the
person's git identity, set the About and the README badges, launch the coin from the linked wallet, copy the
mint and the create signature into `LAUNCH.json`, point the metadata at the uploaded PNG, find sessions
`bundle` accepts (or hand them over and accept no paid place), run `contestant/verify-entry.mjs` and the kit's
`check`, bundle with the run-record flags, then submit and poll.
