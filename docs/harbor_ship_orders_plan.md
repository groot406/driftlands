# Harbor Ship Orders Plan

## Goal

Add a PvP-friendly side-objective system built around Harbors and arriving ships.

The system should create economic races without forcing direct combat:

- players scout for valuable coastlines
- players build Harbors on large water bodies
- ships arrive with public orders
- settlements contribute resources before departure
- rewards scale by contribution, with a bonus for the top contributor

This should feel like a natural extension of the settlement economy, not a separate quest log.

## Core Design

### Dock vs Harbor

Dock:

- early-game shoreline building
- can be built next to any valid water tile
- supports fishing and basic water access
- works on ponds, lakes, rivers, and coastline

Harbor:

- mid-game trade building
- requires a large connected water body
- enables participation in ship orders
- creates strategic coastline value
- should be more expensive than a Dock

Suggested Harbor cost:

- wood
- stone
- tools

Exact values should be tuned after the first playable version.

## Large Water Body Requirement

There is no current way to explore or physically reach deep water tiles, so Harbor placement should not depend on discovered deep water.

Rule:

> A Harbor can be built if one of its adjacent water tiles belongs to a generated connected water region of at least `N` water tiles.

Suggested first threshold:

- Harbor requires `12+` connected generated water tiles.

The check should:

- start from each adjacent water tile
- flood-fill connected generated water tiles
- count water tiles whether discovered or not
- stop once the threshold is reached
- return valid as soon as one adjacent water body qualifies

This lets the player reach only the shore while the game evaluates whether the shore opens into a real lake/sea.

### Shoreline Labels

To make the rule understandable, classify adjacent water bodies:

- `Small Pond`: below Harbor threshold
- `Lake`: meets Harbor threshold
- `Open Water`: comfortably above Harbor threshold
- `Deepwater Coast`: large body, future upgrade candidate

Initial implementation only needs two states:

- `Small water body`
- `Large water body`

UI copy:

- valid: `Large water body: Harbor available`
- invalid: `Requires large water body`

Optional later helper:

- coastline hints can reveal the water-body classification on a shoreline tile
- helps players plan Harbor placement before committing expansion

## Ship Orders

Ship orders are global PvP economy events gated by Harbors.

Basic loop:

1. A ship arrives.
2. The ship has an order with 2-3 requested resources.
3. Settlements with a Harbor can contribute resources.
4. The ship departs after a timer.
5. Rewards are paid based on contribution share.
6. The top contributor gets an extra bonus.

Example announcement:

> The Gullwing has arrived. Requested cargo: 40 wood, 20 food, 10 ore. Departs in 12 minutes.

### Order Requirements

Each ship order should contain:

- ship id
- ship name
- arrival time
- departure time
- requested resources
- per-resource requested amounts
- contributions by settlement
- completion percentage
- status: arriving, active, departed

Example order:

```ts
{
  id: 'ship-001',
  name: 'The Gullwing',
  status: 'active',
  startedAt: 123000,
  departsAt: 843000,
  requested: [
    { type: 'wood', amount: 40 },
    { type: 'food', amount: 20 },
    { type: 'ore', amount: 10 }
  ],
  contributions: [
    {
      settlementId: '0,0',
      resources: { wood: 18, food: 4 },
      totalValue: 22
    }
  ]
}
```

## Contribution Rules

First version:

- only settlements with at least one completed Harbor can contribute
- contributions consume resources from that settlement storage
- contribution is immediate once submitted
- contribution cannot be withdrawn
- players can contribute partial amounts
- settlements can contribute multiple times before departure

Contribution UI should show:

- current ship
- time remaining
- total order progress
- requested resources
- settlement contribution
- contribution leaderboard
- projected reward

## Rewards

Use proportional rewards so late or partial participation is still worthwhile.

Recommended reward model:

- all contributors receive market gold based on contribution share
- top contributor receives a bonus crate
- if the full order is completed, everyone receives a completion multiplier
- if the order is underfilled, rewards are reduced but not zero

Avoid winner-takes-all rewards.

Example:

- base reward pool: `100 gold`
- settlement contribution share: `35%`
- full order multiplier: `1.25x`
- payout: `44 gold`
- top contributor bonus: `tools`, `weapons`, `study progress`, or `blueprint fragment`

Good top-contributor bonuses:

- tools
- weapons
- market gold
- temporary production boost
- guard training speed boost
- study progress
- blueprint fragment

Avoid permanent broad bonuses in the first version.

## PvP Value

This system creates PvP pressure through economy and geography:

- large coastline becomes valuable territory
- players can race to build the first Harbor
- ship orders create timed resource pressure
- players can decide to hoard resources or spend them for rewards
- players can watch leaderboards and respond
- direct combat can matter indirectly by threatening Harbor territory or supply lines

The system should not require direct combat to be fun.

## Discovery Side Quests

Harbors and ships should be the first side-objective system. Local discoveries can come later and use similar ideas.

Possible later local discovery flow:

1. Scout a tile.
2. Reveal a special opportunity.
3. Complete a local task or delivery.
4. Receive a small reward.

Examples:

- ancient grove: complete a recovery task for bonus wood
- exposed vein: deliver tools to unlock bonus ore
- buried supplies: excavate for resources
- old charter: activate ruins for study progress
- fish run: improve nearby Dock or Harbor output temporarily

These should stay smaller than ship orders.

## Implementation Plan

### Phase 1: Harbor Placement

Add Harbor as a building/task.

Tasks:

- add Harbor building metadata
- add Harbor tile art or temporary placeholder
- add `buildHarbor` task definition
- require shoreline adjacency
- require large generated water body
- add tests for water-body validation

Core helper:

```ts
function hasLargeWaterBodyAdjacent(tile, threshold = 12): boolean
```

Implementation notes:

- use generated terrain resolution, not only discovered map tiles
- flood-fill from adjacent generated water tiles
- cap traversal once threshold is reached
- keep the helper deterministic and testable

### Phase 2: Harbor State

Track which settlements have trade access through Harbors.

Tasks:

- detect completed Harbor buildings by settlement
- expose `hasSettlementHarbor(settlementId)`
- show Harbor status in tile/building UI
- block ship contributions without Harbor access

### Phase 3: Ship Order State

Create server-side ship order state.

Tasks:

- add `server/src/state/shipOrderState.ts`
- create active order snapshot type in shared protocol/types
- add order generation
- add order timer/departure handling
- broadcast ship order updates
- reset orders on world reset

Suggested server state:

- active order
- completed order history
- next arrival time
- contributions by settlement

### Phase 4: Contributions

Allow settlements to submit resources to the active order.

Tasks:

- add client message: `ship_order:contribute`
- validate player settlement
- require completed Harbor
- validate active order
- withdraw contributed resources from settlement storage
- update contribution totals
- broadcast resource withdrawal
- broadcast ship order update

### Phase 5: Rewards

Resolve ship rewards on departure.

Tasks:

- calculate total fulfilled value
- calculate settlement shares
- award proportional market gold
- award top-contributor bonus
- apply completion multiplier if fully filled
- broadcast departure summary

First version reward:

- market gold for all contributors
- tools or weapons for top contributor

### Phase 6: UI

Add a Harbor/ship-order UI.

Possible placements:

- Harbor tile panel
- Mission Center tab
- top-level ship button when an order is active

UI needs:

- ship name
- countdown
- requested resources
- total progress
- contribution form
- settlement contribution
- leaderboard
- projected reward

### Phase 7: Balance Pass

Tune:

- Harbor water threshold
- Harbor cost
- ship arrival interval
- order size
- reward pool
- top-contributor bonus
- completion multiplier

Initial tuning recommendation:

- first ship appears shortly after first Harbor is built
- later ships appear every 15-20 minutes
- orders should be possible for one strong settlement but easier with competition
- rewards should be useful, not decisive

## Open Questions

- Should ship orders start only after the first Harbor exists, or on a global timer?
- Should a ship order require all resources to be fully completed for the top bonus?
- Should Harbors be attackable/capturable like watchtowers later?
- Should multiple Harbors improve loading speed or contribution limits?
- Should water body size affect Harbor tier or ship quality?
- Should Market Charter and Harbor be separate unlocks or part of the same trade progression?

## Recommended First Slice

Build the smallest playable version:

1. Add Harbor placement with large-water-body validation.
2. Add one global active ship order.
3. Allow Harbor settlements to contribute resources.
4. Pay proportional market gold on departure.
5. Show a simple active ship UI.

Defer:

- Harbor upgrades
- local discoveries
- ship variety
- complex reward crates
- attacks specifically targeting Harbors
- multiple simultaneous ships
