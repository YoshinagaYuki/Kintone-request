# External staff and duplicate stock reservations

## Staff entry

Admin copy/extension, inventory confirmation (both businesses), and approval forms provide an explicit external-company toggle. The default remains master selection. External names are trimmed, limited to 100 characters and reject control characters. Mode and name survive form drafts. Public application input is unchanged.

Admin copy/confirmation persist `_inventory_external_staff` so informational notices do not attempt to notify an unknown external contact. Admin notices retain mandatory internal CC. Approval persists `approved_staff_external`, protected by a trigger that checks the administrator's business grant; Kintone registration and retries use this persisted decision and exact approved name. Switching back to master mode restores the active-master check.

## Actual duplicate repair

Management numbers 1035 and 1036 each appeared as an imported hold plus a registered request. Both sets matched rental item, quantity, usage period and Kintone equipment validation. Used the existing audited `set_inventory_hold_links` operation to link two legacy holds to their registered requests. No dates, units, Kintone records or source holds were deleted/rewritten. Model now returns one booking per number: 1035 unit 8, 1036 unit 7.

## Checks

- 363 inventory tests passed, including explicit external mode, master ID authority and invalid-name rejection.
- TypeScript and production build passed.
- SQL rollback checks accepted an authorized business administrator's external flag and rejected anonymous external flag insertion. No test request, registration or email persisted.
