# Adjacent equipment preference for new stock reservations

A new inventory hold batch now groups repeated content by item across all input lines. Automatic assignments first seek a consecutive block of normal stock over the full shipping, rental, return and turnaround period. Among feasible blocks, existing packing scores choose the least wasteful fit. If no block exists, the existing individual allocation policy fills available gaps.

Explicit numbers, intentional unassigned units, existing reservations and reserve-stock rules are preserved. A repeated save using the same deterministic hold keys retains already-saved numbers. All allocations still pass normal equipment validation, shared-screen capacity, stock-version checks and the existing database conflict/idempotency validation before a single batch save. No existing records or dates were changed for this feature.

Validation: 371 inventory tests and production build passed. Added cases for an isolated earlier gap versus a later consecutive block, fragmented-stock fallback, manual/unassigned/other-item independence, reserve and turnaround constraints, and retries after a lost response.
