---
description: "Implement an approved feature spec task-by-task, verify it, and sync docs"
argument-hint: "Path or number of the feature spec, e.g. specs/features/002-room-model.md"
agent: "agent"
---
Implement the feature spec: **${input:spec}**

1. Read [AGENTS.md](../../AGENTS.md), the spec, and every spec/ADR it references. If its status is not `Approved` / `In progress`, stop and ask the user to confirm. Resolve any `Decision needed` first.
2. Work through **Plan and tasks** in order: contracts (types/schema/env) → implementation → docs. Small focused changes matching local style. Only this repo is in scope; for cross-repo contract changes, implement this side and leave the **Cross-repo impact** note accurate.
3. Never push or rewrite history; create a branch or commit only if asked.
4. Verify using the commands in AGENTS.md. State exactly what was run and what was not (there is no automated test suite unless AGENTS.md says otherwise).
5. Tick acceptance criteria honestly; leave unmet ones unticked and explain.
6. Finish with the `/spec-sync` checklist.
