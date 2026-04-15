# Tag interpretation rules

This document is the specification for `packages/interpreter`. Every rule
below is enforced by unit tests (`packages/interpreter/test/`).

## Statuses

| Status | Meaning |
|---|---|
| `explicit_yes` / `explicit` | OSM explicitly states the restriction applies. |
| `explicit_no` | OSM explicitly states the restriction does **not** apply. |
| `conditional` | Restriction applies only under a parsed time/date condition. |
| `ambiguous` | OSM signals something relevant but does not fully specify it. Kept, not hidden. |
| `unknown` | No relevant tag present. Segment is not part of the layer. |

`ambiguous` exists on purpose: it prevents the common failure mode of
silently dropping data that looks messy. The user sees a grey dashed line
and can click through to raw tags.

## Toll (cars)

Evaluated in order:

| # | Condition | Status | Reason code |
|---|---|---|---|
| 1 | `toll:motorcar=yes` | `explicit_yes` | `toll:motorcar=yes` |
| 2 | `toll:motorcar=no` | `explicit_no` | `toll:motorcar=no` |
| 3 | Any conditional tag (`toll:conditional`, `toll:motorcar:conditional`, `toll:motor_vehicle:conditional`) | `conditional` | `toll*:conditional` |
| 4 | `toll=yes` (no per-vehicle override) | `explicit_yes` | `toll=yes+no_vehicle_override` |
| 5 | `toll:motor_vehicle=yes` | `explicit_yes` | `toll:motor_vehicle=yes` |
| 6 | Only `toll:hgv=yes`, no car signal | `ambiguous` | `toll:hgv=yes+no_motorcar_info` |
| 7 | Otherwise | `unknown` | — |

### Assumptions documented here

- **Bare `toll=yes` is treated as applicable to cars.** This matches the
  dominant real-world usage (motorways with a uniform toll). Where OSM
  authors wanted to exclude cars, they would add `toll:motorcar=no`.
- **HGV-only toll is not rewritten as "no toll for cars".** It is flagged
  `ambiguous` because the absence of a car-specific tag is not a
  statement of absence.

## Snow chains

| # | Condition | Status | Reason code |
|---|---|---|---|
| 1 | `snow_chains:conditional=*` | `conditional` | `snow_chains:conditional` |
| 2 | `snow_chains=required` | `explicit` | `snow_chains=required` |
| 3 | `snow_chains=yes` | `explicit` | `snow_chains=yes` |
| 4 | `winter_road=yes` (no chain tag) | `ambiguous` | `winter_road=yes+no_chains_info` |
| 5 | Otherwise | `unknown` | — |

### Caveat

The snow-chain tag family in OSM is sparsely and unevenly populated across
Europe — many regions with real chain requirements (esp. rural Alpine
passes) have no such tag. This is a property of the data, not a bug. It
is called out prominently in `docs/LIMITATIONS.md`.

## Conditional expression parsing

For any `*:conditional` tag, the value is split into clauses on top-level
`;` (parentheses are respected), producing `<value> @ <expr>` pairs.
The `<expr>` is fed to `opening_hours.js`. The parsed AST is stored on
the `Condition.when` field of the source model; the original raw
expression is preserved for traceability on `Condition.raw`.

Tiles embed only `status` and `reason_code`. Clients that need to
evaluate "is this active today?" reparse the condition from the raw
tags obtained via Overpass (or a sidecar fetch) — see
`docs/ROADMAP.md` for the planned calendar-active layer.
