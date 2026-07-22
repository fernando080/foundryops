#!/usr/bin/env python3
"""Validate and optionally publish the approved FoundryOps backlog to GitHub.

Dry-run is the default. GitHub is modified only when --apply is supplied.
The stable marker in each body makes repeated runs idempotent.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BACKLOG = ROOT / "planning" / "backlog.json"
KEY_RE = re.compile(r"^FOUND-\d{3}$")
URL_NUMBER_RE = re.compile(r"/issues/(\d+)(?:$|[?#])")

LABEL_CATALOG: dict[str, tuple[str, str]] = {
    "type:epic": ("Epic or parent issue", "6F42C1"),
    "type:feature": ("User-visible vertical capability", "1D76DB"),
    "type:task": ("Scoped engineering task", "0E8A16"),
    "type:bug": ("Incorrect behavior or failed invariant", "D73A4A"),
    "type:spike": ("Time-boxed research or uncertainty reduction", "FBCA04"),
    "priority:P0": ("Critical path or release blocker", "B60205"),
    "priority:P1": ("Important for the complete MVP", "D93F0B"),
    "priority:P2": ("Useful after the core MVP", "FBCA04"),
    "priority:P3": ("Optional polish", "C5DEF5"),
    "phase:planning": ("Architecture and planning", "EDEDED"),
    "phase:mvp": ("Core demonstration path", "0052CC"),
    "phase:polish": ("Submission polish and hardening", "BFDADC"),
    "area:domain": ("Domain model and policies", "5319E7"),
    "area:integration": ("Foundry or external integration", "0366D6"),
    "area:backend": ("Backend application", "0E8A16"),
    "area:frontend": ("User interface", "1D76DB"),
    "area:ai": ("Model orchestration and structured generation", "A2EEEF"),
    "area:evals": ("Tests, evals, and release gates", "7057FF"),
    "area:security": ("Safety, authorization, or data handling", "D73A4A"),
    "area:devops": ("CI, deployment, and developer experience", "006B75"),
    "demo:critical": ("Visible or required in the Loom path", "B60205"),
}


class BacklogError(ValueError):
    """Raised when the local backlog is invalid."""


@dataclass(frozen=True)
class IssueSpec:
    key: str
    title: str
    body_file: Path
    kind: str
    priority: str
    labels: tuple[str, ...]
    parent: str | None
    depends_on: tuple[str, ...]
    effort: str | None

    @property
    def marker(self) -> str:
        return f"<!-- foundryops-key: {self.key} -->"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backlog", type=Path, default=DEFAULT_BACKLOG)
    parser.add_argument("--repo", help="GitHub repository in OWNER/REPO form")
    parser.add_argument("--assignee", help="Optional assignee, for example @me")
    parser.add_argument("--apply", action="store_true", help="Create/update labels and create issues")
    parser.add_argument("--validate-only", action="store_true", help="Validate local files and exit")
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise BacklogError(f"Backlog not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise BacklogError(f"Invalid JSON in {path}: {exc}") from exc


def resolve_body_file(raw: str) -> Path:
    candidate = (ROOT / raw).resolve()
    planning_root = (ROOT / "planning" / "issues").resolve()
    try:
        candidate.relative_to(planning_root)
    except ValueError as exc:
        raise BacklogError(f"Issue body must live under planning/issues: {raw}") from exc
    return candidate


def validate(data: dict[str, Any]) -> list[IssueSpec]:
    if data.get("project") != "FoundryOps":
        raise BacklogError("project must be 'FoundryOps'")
    status = data.get("status")
    if status not in {"draft", "approved"}:
        raise BacklogError("status must be 'draft' or 'approved'")
    raw_issues = data.get("issues")
    if not isinstance(raw_issues, list):
        raise BacklogError("issues must be an array")

    specs: list[IssueSpec] = []
    seen: set[str] = set()
    for index, raw in enumerate(raw_issues, start=1):
        if not isinstance(raw, dict):
            raise BacklogError(f"Issue #{index} must be an object")
        key = raw.get("key")
        if not isinstance(key, str) or not KEY_RE.fullmatch(key):
            raise BacklogError(f"Issue #{index} has invalid key: {key!r}")
        if key in seen:
            raise BacklogError(f"Duplicate issue key: {key}")
        seen.add(key)

        title = raw.get("title")
        if not isinstance(title, str) or len(title.strip()) < 3:
            raise BacklogError(f"{key}: title is required")

        body_raw = raw.get("body_file")
        if not isinstance(body_raw, str):
            raise BacklogError(f"{key}: body_file is required")
        body_file = resolve_body_file(body_raw)
        if not body_file.is_file():
            raise BacklogError(f"{key}: body file does not exist: {body_raw}")
        body = body_file.read_text(encoding="utf-8")
        marker = f"<!-- foundryops-key: {key} -->"
        if marker not in body:
            raise BacklogError(f"{key}: body is missing marker {marker}")

        kind = raw.get("kind")
        if kind not in {"epic", "feature", "task", "bug", "spike"}:
            raise BacklogError(f"{key}: invalid kind {kind!r}")
        priority = raw.get("priority")
        if priority not in {"P0", "P1", "P2", "P3"}:
            raise BacklogError(f"{key}: invalid priority {priority!r}")

        labels = raw.get("labels")
        if not isinstance(labels, list) or not all(isinstance(x, str) and x for x in labels):
            raise BacklogError(f"{key}: labels must be a non-empty string array")
        normalized_labels = list(dict.fromkeys([f"type:{kind}", f"priority:{priority}", *labels]))

        parent = raw.get("parent")
        if parent is not None and (not isinstance(parent, str) or not KEY_RE.fullmatch(parent)):
            raise BacklogError(f"{key}: invalid parent {parent!r}")
        depends_on = raw.get("depends_on", [])
        if not isinstance(depends_on, list) or not all(isinstance(x, str) and KEY_RE.fullmatch(x) for x in depends_on):
            raise BacklogError(f"{key}: depends_on must contain FOUND-NNN keys")
        if key in depends_on or key == parent:
            raise BacklogError(f"{key}: issue cannot depend on or parent itself")

        effort = raw.get("effort")
        if effort is not None and not isinstance(effort, str):
            raise BacklogError(f"{key}: effort must be a string or null")

        specs.append(
            IssueSpec(
                key=key,
                title=title.strip(),
                body_file=body_file,
                kind=kind,
                priority=priority,
                labels=tuple(normalized_labels),
                parent=parent,
                depends_on=tuple(dict.fromkeys(depends_on)),
                effort=effort,
            )
        )

    keys = {spec.key for spec in specs}
    for spec in specs:
        unknown = ({spec.parent} if spec.parent else set()) | set(spec.depends_on)
        missing = unknown - keys
        if missing:
            raise BacklogError(f"{spec.key}: references unknown keys: {', '.join(sorted(missing))}")

    topological_order(specs)  # Validate cycles.
    return specs


def topological_order(specs: list[IssueSpec]) -> list[IssueSpec]:
    by_key = {spec.key: spec for spec in specs}
    prerequisites: dict[str, set[str]] = {
        spec.key: set(spec.depends_on) | ({spec.parent} if spec.parent else set())
        for spec in specs
    }
    result: list[IssueSpec] = []
    ready = sorted(key for key, deps in prerequisites.items() if not deps)

    while ready:
        key = ready.pop(0)
        result.append(by_key[key])
        for other, deps in prerequisites.items():
            if key in deps:
                deps.remove(key)
                if not deps and other not in {item.key for item in result} and other not in ready:
                    ready.append(other)
                    ready.sort()

    if len(result) != len(specs):
        cyclic = sorted(key for key, deps in prerequisites.items() if deps)
        raise BacklogError(f"Backlog contains a dependency/parent cycle involving: {', '.join(cyclic)}")
    return result


def run_gh(args: list[str], *, capture: bool = True) -> str:
    process = subprocess.run(
        ["gh", *args],
        cwd=ROOT,
        text=True,
        capture_output=capture,
        check=False,
    )
    if process.returncode != 0:
        stderr = (process.stderr or "").strip()
        stdout = (process.stdout or "").strip()
        detail = stderr or stdout or f"exit code {process.returncode}"
        raise RuntimeError(f"gh {' '.join(args)} failed: {detail}")
    return (process.stdout or "").strip()


def existing_by_key(repo: str) -> dict[str, tuple[int, str]]:
    raw = run_gh([
        "issue", "list", "--repo", repo, "--state", "all", "--limit", "500",
        "--json", "number,body,url",
    ])
    items = json.loads(raw or "[]")
    found: dict[str, tuple[int, str]] = {}
    marker_re = re.compile(r"<!--\s*foundryops-key:\s*(FOUND-\d{3})\s*-->")
    for item in items:
        match = marker_re.search(item.get("body") or "")
        if match:
            found[match.group(1)] = (int(item["number"]), str(item["url"]))
    return found


def print_plan(repo: str | None, specs: list[IssueSpec], status: str) -> None:
    print(f"Backlog status: {status}")
    print(f"Repository: {repo or '[not supplied]'}")
    print(f"Issues: {len(specs)}")
    labels = sorted({label for spec in specs for label in spec.labels})
    print(f"Labels: {len(labels)}")
    print("\nCreation order:")
    for spec in topological_order(specs):
        relation = []
        if spec.parent:
            relation.append(f"parent={spec.parent}")
        if spec.depends_on:
            relation.append(f"blocked-by={','.join(spec.depends_on)}")
        suffix = f" ({'; '.join(relation)})" if relation else ""
        print(f"  {spec.key} [{spec.priority}/{spec.kind}] {spec.title}{suffix}")
    print("\nNo GitHub changes have been made.")


def ensure_labels(repo: str, labels: set[str]) -> None:
    for label in sorted(labels):
        description, color = LABEL_CATALOG.get(label, ("FoundryOps backlog label", "EDEDED"))
        run_gh([
            "label", "create", label, "--repo", repo,
            "--description", description, "--color", color, "--force",
        ])


def parse_issue_number(url: str) -> int:
    match = URL_NUMBER_RE.search(url)
    if not match:
        raise RuntimeError(f"Could not parse issue number from URL: {url}")
    return int(match.group(1))


def publish(repo: str, specs: list[IssueSpec], assignee: str | None) -> None:
    if shutil.which("gh") is None:
        raise RuntimeError("GitHub CLI 'gh' is not installed or not on PATH")
    run_gh(["auth", "status"])

    labels = {label for spec in specs for label in spec.labels}
    ensure_labels(repo, labels)

    known = existing_by_key(repo)
    created = 0
    skipped = 0

    for spec in topological_order(specs):
        if spec.key in known:
            number, url = known[spec.key]
            print(f"SKIP {spec.key}: already exists as #{number} {url}")
            skipped += 1
            continue

        command = [
            "issue", "create", "--repo", repo,
            "--title", spec.title,
            "--body-file", str(spec.body_file),
        ]
        for label in spec.labels:
            command.extend(["--label", label])
        if assignee:
            command.extend(["--assignee", assignee])
        if spec.parent:
            if spec.parent not in known:
                raise RuntimeError(f"{spec.key}: parent {spec.parent} has not been created")
            command.extend(["--parent", str(known[spec.parent][0])])
        if spec.depends_on:
            missing = [key for key in spec.depends_on if key not in known]
            if missing:
                raise RuntimeError(f"{spec.key}: dependencies not created: {', '.join(missing)}")
            numbers = ",".join(str(known[key][0]) for key in spec.depends_on)
            command.extend(["--blocked-by", numbers])

        url = run_gh(command)
        number = parse_issue_number(url)
        known[spec.key] = (number, url)
        created += 1
        print(f"CREATE {spec.key}: #{number} {url}")

    print(f"\nPublished: {created}; skipped existing: {skipped}; total known: {len(known)}")


def main() -> int:
    args = parse_args()
    try:
        data = load_json(args.backlog.resolve())
        specs = validate(data)
        status = str(data["status"])

        if args.validate_only:
            print(f"Valid backlog: {len(specs)} issue(s), status={status}")
            return 0

        if not args.repo:
            raise BacklogError("--repo OWNER/REPO is required unless --validate-only is used")
        if not re.fullmatch(r"[^/\s]+/[^/\s]+", args.repo):
            raise BacklogError("--repo must use OWNER/REPO form")

        print_plan(args.repo, specs, status)

        if not args.apply:
            print("\nDry run complete. Re-run with --apply only after reviewing the approved backlog.")
            return 0
        if status != "approved":
            raise BacklogError("Refusing to publish because backlog status is not 'approved'")
        if not specs:
            raise BacklogError("Refusing to publish an empty backlog")

        publish(args.repo, specs, args.assignee)
        return 0
    except (BacklogError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
