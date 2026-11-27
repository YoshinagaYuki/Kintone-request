# Copy source and staff review repair

- Public application submissions retain the assigned staff's review_required setting.
- Business-authorized admin copy, extension, confirmation, edits and inventory bundle input bypass preliminary staff review. Final registration and stock conflict checks remain intact.
- Existing internal-origin requests are exempted without registering, cancelling or changing their dates. One request changed review state during migration.
- Informational staff recipients match company_staff_name_input uniquely against active staff master email; legacy notification OFF no longer suppresses assigned-staff mail. Rental application, review and completion mail explicitly CC y-yoshinaga@unity-corp.jp. Authentication and password emails are excluded.
- Request notification delivery leases suppress retry duplicates and record failures without reporting a saved request as failed.

## Management number 1035

An imported hold (small stickcatch, unit 2) and a registered request (unit 8) described the same management number and use dates. Counting both failed the Kintone equipment multiset validation. Copy now resolves the unique registered request first and displays a source warning and its equipment numbers. Ambiguous records or different dates/items still fail. No source unit, date or Kintone record was changed.

## Validation

- 362 inventory tests, TypeScript and production build passed.
- Read-only prepareCopySource on the actual imported hold returned the registered source and unit 8, passing the existing Kintone equipment validation.
- Database transaction rolled back after assertions: public review required; public registration blocked; trusted internal edit exempt; notification leases deduplicate case-insensitive recipients, permit failed retries, suppress already-sent messages; anonymous/authenticated ledger access denied.
- No test emails sent and no test registration or stock changes persisted.
