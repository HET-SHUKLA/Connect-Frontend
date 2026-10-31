# Connect-Frontend — Specifications

Specs are the source of truth for **what** this repo must do; code and README describe **how it currently does it**. Derived from the project report (MCA Major Project, Oct 2026) and verified against the code on 2026-11-01. This folder is self-contained: you can work on this repo without cloning its siblings.

## Index

| File | Contents |
|---|---|
| [00-system-context.md](./00-system-context.md) | Vision, actors, whole-system architecture, sibling repos and contract ownership (duplicated in each repo) |
| [01-requirements.md](./01-requirements.md) | Requirements for this repo with status |
| [02-frontend.md](./02-frontend.md) | Routes, components, meeting flow, mediasoup client, state, configuration |
| [03-e2ee.md](./03-e2ee.md) | Encryption design, weaknesses, rules (shared with Connect-Backend; implemented here) |
| [04-backend-contract.md](./04-backend-contract.md) | Consumer-side mirror of the REST + WebSocket contract owned by Connect-Backend |
| [05-auth-integration.md](./05-auth-integration.md) | Consumer-side contract with Authentication-Service |
| [gap-analysis.md](./gap-analysis.md) | Report-vs-code gaps, defects, roadmap |
| [adr/](./adr) | Architecture decision records |
| [features/](./features) | One spec per feature/change |
| [templates/](./templates) | Feature spec and ADR templates |

## Status legend

`Implemented` works in code · `Partial` some exists · `Planned` specified, not built · `Deferred` out of scope for now · `Decision needed` ask the owner.

## Conventions

- Requirement IDs: `FR-<AREA>-<NN>` / `NFR-<AREA>-<NN>`. Never renumber; deprecate instead. IDs are shared across the three repos' requirement tables.
- RFC 2119 words (**must / should / may**).
- Feature specs: `features/<NNN>-<kebab-slug>.md`, numbered sequentially, from the template. ADRs: `adr/<NNNN>-<kebab-title>.md`; accepted ADRs are immutable (supersede instead).
- This repo **owns no network contract**; it consumes the backend (`04`) and auth (`05`) contracts. If a feature needs a contract change, record it in the feature spec's cross-repo impact section and ask the owner — don't change the mirror alone.
- Specs describe behaviour, not file-by-file code; file paths appear in the plan/tasks of feature specs.
- When code and spec disagree, fix one in the same change; record intentional drift in `gap-analysis.md`.

## Workflow

`/spec-new` → write spec (+ ADR if needed) → owner reviews → `/spec-implement` → verify → `/spec-sync`. See [AGENTS.md](../AGENTS.md).
