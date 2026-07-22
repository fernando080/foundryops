.PHONY: help validate-backlog backlog-dry

help:
	@printf '%s\n' \
	  'make validate-backlog  Validate planning/backlog.json and issue bodies' \
	  'make backlog-dry       Print the GitHub changes without applying them'

validate-backlog:
	python3 scripts/publish_backlog.py --validate-only

backlog-dry:
	@test -n "$(REPO)" || (echo 'Usage: make backlog-dry REPO=OWNER/REPO' && exit 1)
	python3 scripts/publish_backlog.py --repo "$(REPO)"
