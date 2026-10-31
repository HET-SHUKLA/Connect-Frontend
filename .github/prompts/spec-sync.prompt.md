---
description: "Reconcile specs, requirements, gap analysis, ADRs and README with the current code after a change"
argument-hint: "Optional: area or feature just changed"
agent: "agent"
---
Synchronise documentation with the code. Focus area (optional): ${input:area:all areas}.

1. Identify what changed (`git status` / `git diff`).
2. Update statuses in [specs/01-requirements.md](../../specs/01-requirements.md) (`Planned → Partial → Implemented`) and the area spec(s) (contracts, config, behaviour).
3. In [specs/gap-analysis.md](../../specs/gap-analysis.md): close fixed gaps/defects, add newly discovered ones.
4. Update ADR statuses if a decision was made (never rewrite an accepted ADR; supersede it).
5. Update the README and env samples so setup steps and tables match the code.
6. If a contract owned by this repo changed, make sure the spec states it as a breaking/non-breaking change for the sibling repos.
7. Report the doc files changed and any drift you could not resolve (ask the user).
