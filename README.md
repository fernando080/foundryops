# FoundryOps — Claude Code planning bootstrap

This repository is deliberately **planning-first**. It gives Claude Code enough product and domain context to propose the architecture, stack, UX, safety model, evaluation strategy, and GitHub backlog **before** application code is written.

## Recommended workflow

1. Work locally until the architecture and backlog are approved.
2. Keep the GitHub repository private while the demo is being built.
3. Publish only reviewed planning artifacts and issues.
4. Implement one issue per branch and keep the live-lab adapter disabled by default.

## 1. Prerequisites

You need:

- Git
- Python 3.11+
- GitHub CLI (`gh`) if you want to publish the backlog
- Claude Code

Verify them:

```bash
git --version
python3 --version
gh --version
claude --version
claude doctor
```

Authenticate GitHub CLI when needed:

```bash
gh auth login
```

## 2. Start locally

Unzip this package, rename the directory if desired, and initialize Git:

```bash
cd foundryops-claude-bootstrap
git init -b main
git add .
git commit -m "chore: bootstrap FoundryOps planning workspace"
```

Start Claude Code in read-only planning mode:

```bash
claude --permission-mode plan
```

Inside Claude Code, first verify that the project instructions loaded:

```text
/context
```

Then run:

```text
/architecture-sprint
```

This project command now enters the `superpowers:brainstorming` workflow. Claude should ask one question at a time, compare approaches, use the FoundryOps agents as staged domain reviewers, and present the design incrementally. After you approve the design, allow it to save and commit the written spec under `docs/superpowers/specs/`. Review that actual file before approving the transition to `superpowers:writing-plans`, which writes the detailed plan under `docs/superpowers/plans/`.

Only after both the written spec and implementation plan are approved, run:

```text
/create-backlog
```

That skill packages the approved plan into a small GitHub-facing backlog under `planning/issues/` plus `planning/backlog.json`. It must not redesign the system or create GitHub issues by itself.

## 3. Create the GitHub repository

From the local directory:

```bash
gh repo create foundryops \
  --private \
  --source=. \
  --remote=origin \
  --push \
  --description "Safe experiment intake and results-review workflow for Adaptyv Foundry"
```

You can make the repository public shortly before submitting the application, after checking that it contains no secrets, customer data, private notes, or proprietary fixtures.

## 4. Review and publish the backlog

Dry-run first. This prints the labels and issue commands without changing GitHub:

```bash
python3 scripts/publish_backlog.py \
  --repo YOUR_GITHUB_USER/foundryops
```

After reviewing the output:

```bash
python3 scripts/publish_backlog.py \
  --repo YOUR_GITHUB_USER/foundryops \
  --assignee @me \
  --apply
```

The publisher is designed to be idempotent. Each issue body contains a stable `foundryops-key` marker; rerunning the script skips issues that already exist.

## 5. Implement issue by issue

A typical local session is:

```bash
claude
```

Then:

```text
/implement-issue 12
```

Claude must first restate the scope, acceptance criteria, risks, and test plan. The command delegates process control to Superpowers: design changes return to brainstorming, stale/missing detail returns to writing-plans, implementation occurs in an isolated worktree, behavior is developed with TDD, and completion requires verification and branch review.

Use one GitHub issue for a meaningful vertical slice, not for every 2–5 minute plan step. Superpowers keeps the fine-grained execution checklist in `docs/superpowers/plans/`.

## 6. Optional: Claude Code on GitHub

Do not enable this during the first architecture pass. Local plan mode is cheaper, easier to steer, and safer.

After the repository conventions are stable, run this inside Claude Code:

```text
/install-github-app
```

A disabled workflow example is included at:

```text
.github/workflows/claude.yml.example
```

Rename it to `claude.yml` only after adding `ANTHROPIC_API_KEY` as a GitHub Actions secret and reviewing its permissions. Never commit the API key.

## 7. Suggested planning sequence

```text
/architecture-sprint
# approve the written spec, then approve the Superpowers implementation plan
/create-backlog
/demo-readiness planning-only
```

The Superpowers-backed architecture sprint should settle, at minimum:

- MVP boundary and demo story
- backend/frontend topology
- Foundry adapter and mock strategy
- structured LLM extraction contract
- deterministic validation and policy engine
- approval state machine
- webhook ingestion and idempotency
- results QC and evidence-backed drafting
- observability and evaluation harness
- deployment and no-credentials fallback

## Repository map

```text
.
├── CLAUDE.md
├── docs/
│   ├── PROJECT_BRIEF.md
│   ├── PRODUCT_SPEC.md
│   ├── SAFETY_AND_TRUST.md
│   ├── DEMO_STORYBOARD.md
│   ├── RESEARCH_NOTES.md
│   ├── OPEN_QUESTIONS.md
│   ├── superpowers/
│   │   ├── specs/
│   │   └── plans/
│   ├── planning/
│   └── adr/
├── planning/
│   ├── backlog.json
│   └── issues/
├── .claude/
│   ├── agents/
│   └── skills/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── pull_request_template.md
└── scripts/
    └── publish_backlog.py
```

## Hard rule

Do not let the planning agent silently turn assumptions into code. Unresolved assumptions belong in `docs/OPEN_QUESTIONS.md`; accepted technical choices belong in ADRs.
