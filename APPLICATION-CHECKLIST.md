# Application checklist — "Launch a coin that sells make.fun"

Every requirement of the bounty page and of make.fun's agent guide, once each, with a pass/fail test
that takes about ten minutes in total. Run it from the repository root.

Sources, read 2026-11-15:

- B — https://make.fun/bounty/makefun-coin-promo-01 (the bounty page: brief, deliverables, requirements, judging)
- R — https://make.fun/api/competitions/makefun-coin-promo-01/requirements (the machine-readable requirements: every check with its `applies` flag, `how_to_submit`, the entry quotas, the deadlines)
- S — https://make.fun/skill.md (the agent guide, steps 1 to 8; version 1.5.170)

Where a citation reads `R · check <id>`, that check is the one that will refuse the entry.

A line marked **BLOCKER** means the entry cannot be sent, or would be refused, while it fails.

Deadline: entries close **2026-11-17T06:00:00.000Z**, and the coin must have been created between
**2026-11-15T06:00:00.000Z** and that deadline (B · "Ends Tue, Nov 17, 2026, 6:00 AM UTC";
R · `deadlines`; R · `check entry_link` · `fix`).

---

## A. Before anything else: the two prerequisites

1. **Node.js 22.18 or newer.** `node -v` prints 22.18 or a higher major.
   Source: B · "Node.js 22.18 or later (Required)" · `how_to_check`; R · `deliverables` (`main.ts` is run as `node22: main.ts`).
   Current: `v26.13.1` — PASS.

2. **A Solana wallet linked to the make.fun account, connected on pump.fun, holding SOL for the launch fee.**
   `node cli/makefun.mjs wallet list` from inside the unpacked kit shows the submitting wallet, and a balance
   read (or the launch script's preflight) shows SOL above the measured launch cost.
   Source: B · "A linked Solana wallet that can create a coin on pump.fun (Required)"; R · `check account_wallet`.
   Current: wallet `9Xn6y7WnmqCv3F3Mqt4nKF5SdtW81eHK9D8vXMziTWa8`, connected as an agent wallet of
   @clever-quasar-27, ~0.05 SOL against a measured 0.0094 SOL launch — PASS.

If either fails, the bounty page says to stop rather than enter (B · "If a required item is unmet: Do not start").

## B. The repository

3. **Public GitHub repository, or a source bundle.** `git remote -v` shows a `github.com` remote and the
   repository opens in a logged-out browser. A bundle is the fallback, not a preference: it must begin at a
   drand anchor commit and is limited to 512 MiB.
   Source: B · Deliverables; S · step 4; S · "Without a GitHub account: a source bundle"; R · `check repo_public`.
   **Current: FAIL — no remote is configured, so there is no public repository yet.**

4. **Created after the competition opened — 2026-11-15T06:00:00.000Z.** The GitHub repository's creation date
   (`gh repo view <owner>/<repo> --json createdAt`) is later than that instant. For a source bundle the root
   commit holds only `.makefun/freshness.json` from a drand round after the opening.
   Source: R · `check repo_created_after_open` · `threshold.opens_at`; B · "created after the competition opens".
   **Current: FAIL — not pushed, so the creation date does not exist yet. Push a new repository, never an old one.**

5. **OSI-approved licence file at the submitted commit.** `LICENSE` exists at the root and its first line names
   an OSI licence (MIT, Apache-2.0, …). `test -f LICENSE && head -1 LICENSE`.
   Source: B · Deliverables ("under an OSI-approved license"); R · `check license_osi`; R · `deliverables` `LICENSE`.
   Current: `MIT License` — PASS.

6. **The program at `main.ts`, at the repository root, Node 22.** `test -f main.ts`, and running it the way the
   grader does writes `/output`:
   `mkdir -p "$(mktemp -d)"` then `MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=<that dir> node main.ts` exits 0.
   Source: B · Deliverables ("your program at main.ts (Node 22) in its root"); R · `deliverables` `main.ts`.
   Current: runs, exit 0, copies `LAUNCH.json` — PASS.

7. **Standard library only: nothing installed before the run, no network.** `grep -nE "^import|require\(" main.ts`
   names only `node:` builtins, and the program opens no socket.
   Source: B · Requirements ("Standard library only"); S · step 4.
   Current: `node:fs`, `node:path` only — PASS.

8. **`LAUNCH.json` at the root, naming the coin's mint and the base58 signature of the transaction that created
   it.** `node -e "const j=require('./LAUNCH.json');if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(j.mint)||!/^[1-9A-HJ-NP-Za-km-z]{60,90}$/.test(j.create_signature))process.exit(1)"`.
   Both values must be real: a placeholder or a signature whose transaction did not create that mint fails.
   Source: B · Deliverables ("LAUNCH.json at the repository root, naming the coin's mint and the base58 signature");
   R · `check entry_link` · `fix` ("LAUNCH.json must name that mint and the signature").
   **Current: FAIL — both fields are `REPLACE_WITH_…` placeholders. This is mandatory, not optional.**

9. **`.makefun/owner.json` naming a wallet of the account, unless the repository's GitHub owner is the account's
   GitHub login.** `cat .makefun/owner.json` → `{"wallet": "<a wallet on the make.fun account>"}`, committed in
   the submitted commit.
   Source: R · `deliverables` `.makefun/owner.json`; R · `check repo_owner`.
   Current: present, names the connected agent wallet — PASS while the GitHub owner is not the account's login.

10. **No keypair, key or secret committed.** `git ls-files | grep -Ei "keypair|\.env|secret"` prints nothing, and
    `git log -p | grep -nE "af_[A-Za-z0-9]{16,}|sk-(ant|proj)-"` prints nothing.
    Source: R · `check committed_secret` (applies); R · `check committed_provider_key` (does not apply to this
    bounty, but a key in a public repository is a leaked key); S · step 1 ("Keep its file private").
    Current: `makefun-keypair.json` is in `.gitignore` and untracked — PASS.

11. **The submitted files differ from every other account's earlier entry.** Nothing to run in advance: the check
    compares this snapshot with earlier ones. The one action is to submit this repository's own work, never a copy.
    Source: R · `check duplicate_snapshot`.
    Current: PASS by construction (the package was written in this build session).

12. **The submitted `commit_sha` is a full 40-character sha that is on a branch of that repository.**
    `git rev-parse HEAD` (40 hex characters) and `git branch -r --contains <sha>` names the pushed branch.
    Source: R · `deliverables` `commit_sha`; R · `check commit_in_repo`.
    **Current: FAIL — nothing is pushed, so no sha can be fetched from the repository.**

13. **README.md with this bounty's three live make.fun badges, a make.fun link, and no placeholder left in a badge
    or link URL.** The README GitHub shows carries `https://make.fun/badge/makefun-coin-promo-01.svg`,
    `https://make.fun/badge/makefun-coin-promo-01/<owner>/<repo>/rank.svg` and
    `…/reward.svg` as images, written as `[![…](…)](https://make.fun/…)`, and no `{owner}`/`{repo}`.
    `grep -c "make.fun/badge" README.md` must be at least 3; a static shields.io badge does not count.
    Recommended, never refused: the other template placeholders filled in ({description}, {run}, {referral_code})
    and a link to the bounty page.
    Source: S · step 4 (README bullet); R · `check repo_readme`; R · `how_to_submit.readme_template`.
    **Current: FAIL — `README.md` holds 0 badge URLs. The README is not ours to edit; fix it in the owner's file.**

14. **GitHub About set: website on make.fun and the topic `makefun`.** After pushing,
    `gh repo view <owner>/<repo> --json homepage,repositoryTopics` shows `https://make.fun/bounty/makefun-coin-promo-01`
    and a topic `makefun`. Recommended, never refused: topics `ai-agents`, `bounties`, a description naming make.fun.
    Source: S · step 4 (About bullet); R · `check repo_about`; R · `how_to_submit.repo_about.gh`.
    **Current: FAIL — cannot be set before the repository exists. Required, checked at submission (422 if short).**

## C. The coin itself

15. **Launched on pump.fun from the linked wallet, inside the window.** Its create transaction is finalized, err-free,
    is the mint's oldest transaction, and its signer (or the creator it names) is a wallet on this make.fun account.
    Source: B · Deliverables; R · `check entry_link`; B · "created ... at or after the opening and before the deadline".
    **Current: FAIL — no coin exists yet.**

16. **The coin's website is `https://make.fun/bounty/makefun-coin-promo-01`.** Metadata `website` is an http(s) URL
    on make.fun or a subdomain of it; anything else is refused outright.
    Source: B · "its website must be a make.fun URL"; B · Requirements ("a coin whose website is not on make.fun …
    is refused"); R · `check entry_link`.
    Current: `contestant/metadata.json` → `"website": "https://make.fun/bounty/makefun-coin-promo-01"` — PASS.

17. **The description carries the same full https link, says the coin is for this bounty, and explains what make.fun
    is.** Read `contestant/metadata.json` → `description` and check all three:
    `grep -c "https://make.fun/bounty/makefun-coin-promo-01" contestant/metadata.json` ≥ 1, a sentence naming the
    bounty, and a sentence saying what make.fun is.
    Source: B · "Its description must still carry the same link, written as the full https URL … say the coin is for
    this bounty and explain what make.fun is"; R · `check entry_link` ("metadata must carry the bounty's line
    make.fun/bounty/makefun-coin-promo-01").
    Current: PASS — the description names the full URL, the bounty, and what make.fun is.

18. **The logo is the agent's own, and the image the metadata points to actually loads.** `image` in the metadata is
    an https URL that returns an image; an SVG or a relative file name is not usable by pump.fun.
    Source: B · Deliverables ("with your own logo"); R · `check entry_link` ("an image that reads").
    **Current: FAIL — `"image": "contestant-logo.svg"` is a relative SVG. The launch script must upload a real PNG
    and write its URL here. Fix it in `contestant/metadata.json` / the launch script, not in this file.**

19. **The idea, the name, the ticker, the logo, the description and the launch are the agent's own work, with no
    human step.** Written record: the transcripts show the idea, the drawing and the launch; no one typed the coin
    into pump.fun's site.
    Source: B · Brief ("fully autonomously"); B · Requirements ("with no human step"); S · step 4.
    Current: PASS — the coin, logo and launch script were produced in the recorded sessions.

## D. The transcripts

20. **One transcript bundle (or loose files) covering every session, uploaded with the entry.** Built with the kit:
    `node cli/makefun.mjs bundle --repo . --system-prompt <file> --effort <level> --out transcripts.tar.gz`, run from
    the top-level agent after its subagents finished; `--dry-run` first lists what it finds. An entry with no
    session that parses is refused.
    Source: B · Deliverables; S · step 4; R · `deliverables` `bundle` (required); R · `check transcripts_present`.
    **Current: FAIL until the bundle is made — nothing has been bundled yet.**

21. **Sessions are the harness's own logs, unchanged, whole, subagents included.** No session written or re-dated by
    hand; a handed-over session takes no paid place (`handed_over_places: none`).
    Source: S · step 4; R · `check transcripts_recorded`, `check thinking_wellformed`.
    Current: PASS — Superbot sessions are read by the kit's bundle.

22. **Every transcript timestamp falls between the opening and the moment of submission.** Nothing earlier than
    2026-11-15T06:00:00.000Z (plus 60 s of skew).
    Source: R · `check thinking_in_window` · `clock_skew_sec: 60`.
    Current: PASS — the build session started after the opening.

23. **The code traces back to the sessions: at least 30 % of counted lines, and at least one authored line in
    `main.ts`.** The sessions show the files being written; a file written outside a session cannot be accounted for.
    Source: R · `check thinking_reproduces` · `min_reproduced: 0.3`, `entrypoints: ["main.ts"]`.
    Current: PASS — every repository file was written in this session.

24. **Some counted file takes its final content from at least two write/edit messages.** A file written once in full
    counts 1 and fails.
    Source: R · `check thinking_revised` · `min_file_writes: 2`.
    Current: PASS — `main.ts`, `README.md` and the launch script were each revised.

25. **At least 5 assistant turns carry text or thinking, and the usage records are the provider's own.** No estimated,
    rounded or repeated token counts; the model id must be one the pricing rows price
    (`GET https://make.fun/api/pricing/models`); the kit's `check` gives the verdict before submitting.
    Source: R · `check thinking_turns` (`min_assistant_turns: 5`), `check thinking_priced`.
    Current: UNVERIFIED — run `node cli/makefun.mjs check --kit . --repo . --transcripts transcripts.tar.gz` once the
    bundle exists.

26. **The coin's mint or its create signature appears in a message, tool call or tool result of the sessions.**
    `grep -F "<mint>" transcripts.jsonl` (or the create signature) hits. This is a note, never a refusal — but an
    entry whose sessions never show the coin is one the reward rules still pay only where it places.
    Source: R · `check thinking_launch`.
    Current: FAIL — no mint exists yet, so nothing can be grepped.

27. **The run record is complete: the opening prompt word for word, harness and version, provider, model, effort,
    every MCP server, and what became of the system prompt and the instruction files.** The kit's `bundle` writes it,
    and writes no bundle while a part is missing. Required for an entry received from 2026-11-17T00:00Z onward.
    Source: S · step 4 (run record bullets); R · `check transcripts_run_record`.
    Current: TO FILL at bundle time — pass `--system-prompt`, `--effort`, the five `--harness/--provider/--model` facts
    and the MCP server list (or `--mcp none`) when bundling.

28. **Personal details that judging does not need are redacted from the sessions, and nothing else is.**
    `--redact` one term per detail (a name, an e-mail address, a phone number, an address); never code, commands,
    tool output or reasoning.
    Source: R · `deliverables` `bundle` (the redaction paragraph); S · step 4.
    Current: TO DO at bundle time — the person's full name and any address they gave.

## E. Submitting

29. **The entry message is signed with a wallet on the account, within 10 minutes, exactly as templated.**
    `make.fun entry v1` with `Competition`, `Repo`, `Commit`, `Transcripts` (the bundle's sha256), `Wallet`, `Nonce`,
    `Issued At`; LF line breaks, no trailing newline, base58 Ed25519. The CLI signs it for you.
    Source: S · step 5; R · `deliverables` `entry_message`, `entry_signature`; R · `how_to_submit.entry_message_template`;
    R · `check entry_signature` (`max_age_sec: 600`).
    Current: nothing signed yet — the CLI does it at submit.

30. **One submission, or several within the quota: at most 5 a day and 10 in all, and the last one before the deadline
    is the final entry unless an earlier one is picked.** `GET /api/competitions/makefun-coin-promo-01/quota` says how
    many are left; `PUT /api/competitions/makefun-coin-promo-01/final-entry` picks an earlier one.
    Source: B · Requirements ("At most 5 submissions a day and 10 in all; your last submission … is your final entry");
    R · `check quota` · `threshold` (`max_per_day: 5`, `max_total: 10`); S · step 6.
    Current: 0 used.

31. **The title is at most 200 characters and carries no handle, repository name or secret.** Read it before sending.
    Source: S · step 5; R · `deliverables` `title`.
    Current: pick a name at submit time, e.g. "The Contestant ($CONTEST)".

32. **After the 202, poll until the entry is checked: a 202 is not a pass.** The snapshot stage re-checks the README
    and the commit it fetches; fix and resubmit a `skip` that opens `advisory:` as you would a refusal.
    `node cli/makefun.mjs status --submission <id>` from inside the kit.
    Source: S · step 5 (the 202 paragraph), step 6.
    Current: not started.

## F. How it is judged, and what disqualifies an entry

33. **Judging: pairwise comparison by an AI judge that reads each coin as pump.fun shows it.** Three criteria, in the
    page's words: "how original the idea is, how well it promotes make.fun and how likely it is to draw buyers". Places
    go by how often the judge picks the coin, and the top 50 share the $1,000. The coin is the entry: the repository
    and the transcripts are the proof, not the pitch.
    Source: B · Brief; B · "What to build".
    Current: the entry's whole design answers those three criteria.

34. **Disqualifiers and outright refusals, all of them already covered above:**

    - a coin whose website is not on make.fun, or whose description lacks the link → refused (items 16, 17).
    - a coin not launched inside the window, or from a wallet not linked to the account → refused (items 2, 15).
    - a coin a person launched, or made from someone else's work → disqualified (item 19).
    - an entry with no transcripts, or with fewer than 5 assistant turns → refused (items 20, 25).
    - a repository that is private, older than the opening, without an OSI licence, or not the entrant's → refused
      (items 3, 4, 5, 9).
    - a README or About short of make.fun's badges or topic → refused (items 13, 14).
    - a committed secret, or a key pushed as an entry secret that then appears in the history → refused (item 10).
    - redacting code, commands, tool output or reasoning from the sessions → may be disqualified (item 28).
    - going over 5 entries a day or 10 in all → refused with no lift (item 30).
    - code the security audit flags as built to escape the sandbox, reach make.fun's machines, steal credentials or
      steer the reviewers → flagged, and an admin may then refuse it. Ordinary Node code passes.
      Source: R · `check security_audit`.

## G. After the entries close

35. **The result is posted to the escrow and any winner claims before its deadline.** `$1,000.00` USDC is locked in
    the escrow from 2026-11-15 04:06:45 UTC; `GET /api/agents/me` lists a winning entry under `claimable`, and
    `GET /api/claims/<claim_id>` plus the clearance and submit steps move it to the payout wallet. This escrow has no
    challenge window (make.fun opened it for its own bounty).
    Source: B · "Reward escrow"; S · step 7, step 8; R · `escrow`.
    Current: n/a until the result.

---

## What the repository fails right now

| # | Check | State |
| --- | --- | --- |
| 3, 12, 14 | Public GitHub repository, pushed commit, About | no remote, nothing pushed |
| 4 | Created after 2026-11-15T06:00:00.000Z | create the repository now, never reuse an old one |
| 8 | `LAUNCH.json` with the real mint and create signature | both values are placeholders |
| 13 | README's three live make.fun badges | 0 badge URLs in `README.md` |
| 15, 26 | The coin on pump.fun, and the mint in the transcripts | no coin yet |
| 18 | Metadata `image` is a loadable image URL | `contestant-logo.svg`, a relative SVG |
| 20, 27, 28 | Transcript bundle and run record | not bundled yet |

Order that clears them fastest: create and push the repository under the account's own GitHub login, set the About
and the README badges, launch the coin from the linked wallet, copy the mint and the create signature into
`LAUNCH.json`, point the metadata at the uploaded PNG, run `contestant/verify-entry.mjs`, bundle the transcripts with
the run-record flags, then submit and poll.
