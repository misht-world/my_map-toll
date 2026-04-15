# Future routing engine — Valhalla vs GraphHopper

Routing is not part of the MVP. This document records the evaluation
that will inform the first integration and the architectural choices
already made to keep that integration a drop-in.

## Criteria (from the project brief)

1. Support for routing over **calendar dates** (time-dependent costing).
2. Support for **conditional / seasonal restrictions**.
3. Flexibility of the **passenger-car profile**.
4. Realism of **self-hosting** on a modest machine.
5. Integration complexity.
6. Headroom for "road rules + date + user-defined restrictions".

## Candidates

### Valhalla
- Native support for **time-dependent costing**: every edge may carry
  conditions; the router can compute routes "as of" a given local time.
- Understands OSM `access:conditional`, `hgv:conditional`, etc., out of
  the box — the same tag family our interpreter already understands.
- Costing is defined in JSON per request, with fine-grained knobs for
  passenger car profiles.
- Self-hosting: tile-based graph. Europe fits on a mid-range VPS with
  ~40–80 GB disk and ~16 GB RAM.
- Larger, more complex codebase; build times are non-trivial.

### GraphHopper (open-source edition)
- Simpler to stand up. Smaller memory footprint for small regions.
- Rich custom-model DSL for per-request profile adjustments.
- Time-dependent / conditional restrictions are supported but less
  idiomatic than in Valhalla: typically handled via custom
  `block_area` or preprocessing scripts that inject turn restrictions.
- Commercial add-ons exist for some advanced features; OSS edition is
  sufficient for our use case but less "first-class" for calendar
  routing.

## Verdict (current)

**Recommendation: Valhalla.**

Rationale:
- The project's core value is "routing that respects real, calendar-
  dependent road rules". Valhalla's time-dependent model maps 1:1 to the
  `Condition` structure our interpreter produces. Integration amounts to
  emitting the same conditional tags Valhalla already reads — we have no
  format impedance to bridge.
- The `ambiguous`/`conditional` statuses we carry today become natural
  inputs for Valhalla costing.
- GraphHopper would be faster to integrate at the "basic detour around
  tolls" level but would grow more awkward as we layer in seasons and
  user-defined restrictions — exactly the direction the brief asks us
  to prepare for.

The recommendation is **not** binding. `packages/routing-adapter` keeps
the engine choice swappable; if Valhalla hosting turns out to be too
heavy, a GraphHopper adapter can be added without touching the tile
pipeline or web app.

## Architectural seams already in place

- `packages/model`: statuses, reason codes, and `Condition` are the
  shared vocabulary — engine-neutral.
- `packages/interpreter`: normalization is independent of any engine.
- `packages/routing-adapter`: empty stub with an `exportForEngine(...)`
  signature; first real engine integration lives here.

## What's needed when routing lands

1. Decide final engine (confirm Valhalla or switch).
2. Implement `exportForEngine` → produce Valhalla tiles or GraphHopper
   graph from the same filtered PBF we already use.
3. Stand up the engine (Docker image + config) — can stay behind a
   tiny HTTP proxy on a free-tier VM.
4. Add a routing UI panel to `packages/web` — no changes to tile
   pipeline required.
