---
name: publish-backlog
description: Safely publish an approved local FoundryOps backlog to GitHub through the dry-run-first publisher. Use only after the user explicitly asks to create the GitHub issues.
disable-model-invocation: true
---
Publish the approved backlog, with no hidden mutations.

1. Read `planning/backlog.json` and confirm `status` is `approved`.
2. Confirm every referenced issue body exists and has the matching `foundryops-key` marker.
3. Determine the target repository from `$ARGUMENTS` or `git remote -v`.
4. Run the validator/dry run:

   ```bash
   python3 scripts/publish_backlog.py --repo OWNER/REPO
   ```

5. Show the exact repository, number of labels, number of issues, skipped duplicates, parents, and dependencies.
6. Run with `--apply` only when the user has explicitly instructed you to publish the reviewed backlog in the current conversation.
7. Never publish to an inferred repository when more than one remote or owner is plausible.
8. Report created and skipped issue URLs. Do not implement an issue automatically.
