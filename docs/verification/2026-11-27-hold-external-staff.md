# External staff in inventory holds

Added the external-company name toggle to the header stock reservation dialog, empty-cell hold form, and booking editor. Both hold entry points save the mode/name in their drafts. Inventory holds store either an active staff ID or an external name, never a placeholder staff-master entry. The existing authenticated administrator/actor/item validation, stock conflicts, audit and batch idempotency remain in place.

The inventory model retains the external name and mode through bundle edits and product additions. Both business confirmation forms prefill it and pass the existing external-name registration policy to approval and Kintone. External contacts do not receive review or informational staff emails.

Validation: 363 inventory tests, TypeScript, and production build passed. Actual create_inventory_hold_batch was called inside a rollback transaction: external name saved with a null staff ID; retry produced one hold; empty external name was rejected. No test hold, stock reservation, Kintone record or notification persisted.
