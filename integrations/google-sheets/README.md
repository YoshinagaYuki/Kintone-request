# Existing workbook writer (enabled 2026-10-23)

Eight protected Allmight mirror tabs now use the authenticated writer (deployed version 3). The old IMPORTDATA formulas were replaced after the user approved Google access. See docs/inventory-sheet-import.md for live verification. The following steps describe setup or recovery.

The writer renders protected viewing tabs named ガント STC(小), etc. It uses the same layout, colors and merged staff/store periods as the web board, over six monthly blocks. Original manual rows 1–249 remain intact. Previous output below row 250 is replaced by a pointer to the viewing tab. The mirror JSON contains inventory fields only, with no contact details, addresses, prices or credentials.

1. Open the existing workbook's bound Apps Script project and add Code.gs.
2. Set FEED_URL to the existing protected CSV feed URL (key only, without product/months).
3. Generate a new, independent 32+ byte PUSH_KEY and store it in Script Properties and Vercel INVENTORY_SHEETS_PUSH_KEY. Never reuse the public spreadsheet's read-feed key for writes.
4. Review Google's authorization scopes. Spreadsheet write access, outgoing requests, script properties and a time trigger are required. Obtain action-time confirmation before granting new security-sensitive access in the browser.
5. Deploy the web app executing as its owner. Configure INVENTORY_SHEETS_PUSH_URL with its /exec URL. Deploy the app.
6. Run installRecoveryTrigger as the owner after authorization. Push runs after application mutations; a one-minute reconciliation trigger repairs missed pushes. This gives prompt updates, not a hard realtime latency guarantee.
7. Verify one temporary hold appears and disappears after cancellation without changing any original manual input. Record measured latency before claiming activation.

Rollback: unset the two PUSH environment variables, remove the syncInventory trigger, restore the original IMPORTDATA formula in A251 of each tab. Data remains authoritative in the application. Do not enable this writer without the one-minute recovery trigger.
