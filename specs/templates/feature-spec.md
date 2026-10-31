# NNN — <Feature title>

- **Status:** Draft | Approved | In progress | Implemented
- **Requirements:** FR-XXX-NN, … (from `specs/01-requirements.md`)
- **Gap / defect IDs:** G#, D# (from `specs/gap-analysis.md`), if any
- **Branch:** `feat/<slug>`
- **Author / date:**

## 1. Problem and goal

One paragraph: who needs what, and why. Link the report section if relevant.

## 2. Scope

**In:** …
**Out (explicitly):** …

## 3. Behaviour

User-visible and API-visible behaviour as numbered, testable statements ("The server **must** …"). Include error cases and edge cases.

## 4. Contracts

- **REST / WebSocket / DB / env:** exact shapes, paths, codes, new variables (and where they are documented).
- **Cross-repo impact:** does a sibling repo (Authentication-Service, Connect-Backend, Connect-Frontend) have to change? Describe the contract change precisely enough that someone working only in that repo can implement their side from this spec; state who owns the contract and whether the change is breaking. Sibling repos track their own tasks in their own specs.

## 5. Security and E2EE considerations

Authn/authz, data exposure, effect on key handling (`specs/03-e2ee.md` if present), rate limits, logging of sensitive data.

## 6. Acceptance criteria

- [ ] Criterion 1 (observable, verifiable)
- [ ] …

## 7. Plan and tasks

Order: contracts → implementation → docs. One checkbox per task, with file paths.

- [ ] task (files)
- [ ] Docs: spec status, requirement table, `gap-analysis.md`, README / env samples

## 8. Verification

Commands actually run, manual steps, results. State what was not verified.

## 9. Open questions

- Decision needed: … (promote to an ADR in `specs/adr/` if it is a lasting architectural choice)
