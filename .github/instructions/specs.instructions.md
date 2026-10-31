---
description: "Use when writing or editing specs, requirements, ADRs, gap analysis or feature specs under specs/"
applyTo: "specs/**"
---
# Spec writing rules

- Follow [specs/README.md](../../specs/README.md): stable requirement IDs, RFC 2119 wording, status legend, one feature per `features/NNN-slug.md` from the template, one decision per `adr/NNNN-title.md`.
- Describe behaviour and contracts, not implementation details; keep file paths to the plan/tasks section.
- Never mark something `Implemented` without checking the code. Mark anything you could not verify as `Decision needed` or leave a question.
- Don't copy the project report's claims about test results or measurements as facts — they aren't backed by code in the repos.
- Accepted ADRs are immutable: supersede, don't edit. Proposed ADRs state a recommendation but leave the decision to the project owner.
- When a spec changes a contract this repo owns, update the area spec, the requirement status and `gap-analysis.md` in the same change, and state whether it is breaking for sibling repos.
- `specs/00-system-context.md` is duplicated across the three Connect repos; keep edits to it minimal and factual.
