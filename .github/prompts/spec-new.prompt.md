---
description: "Create a new feature spec in specs/features from a short idea, grounded in the specs and the real code"
argument-hint: "Feature idea, e.g. 'room passwords' or 'fix refresh token bug'"
agent: "agent"
---
Create a feature spec for: **${input:idea}**

1. Read [AGENTS.md](../../AGENTS.md), [specs/README.md](../../specs/README.md), [specs/01-requirements.md](../../specs/01-requirements.md), [specs/gap-analysis.md](../../specs/gap-analysis.md), and the area spec(s) the idea touches. Check [specs/adr/](../../specs/adr) for related decisions.
2. Inspect the real code to confirm current behaviour. Specs and the report can be stale or aspirational.
3. Pick the next free number in `specs/features/` and create `NNN-<slug>.md` from [the template](../../specs/templates/feature-spec.md). Fill every section: requirement/gap IDs, in/out scope, testable behaviour, concrete contracts, cross-repo impact, security impact, acceptance criteria, ordered tasks.
4. Put unresolved choices under **Open questions** as `Decision needed` and ask the user about the ones that block design. For a lasting architectural choice, draft an ADR from [the template](../../specs/templates/adr.md) with status `Proposed`.
5. Do **not** write implementation code. Stop after the spec and summarise it plus the questions.
