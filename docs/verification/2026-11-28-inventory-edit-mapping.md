# Inventory edit mapping and content-row alignment

An inventory edit with only transport/usage metadata changes can have zero changed ordinary mapped fields. Passing that empty selection to the full-registration mapper incorrectly reported field_mapping unconfigured. Inventory edit mapping now returns an empty ordinary-field patch for this case, while full registration and required mapped values retain validation. Actual Allmight configuration has 26 mappings.

Read-only preparation against registered management number 1215 with only the transport confirmation metadata changed succeeded and produced zero Kintone changes; no request, stock, date or Kintone data was written during verification.

Content selection and quantity now use an explicit 48px block control height and aligned grid columns. The content select uses a consistent arrow instead of the platform-dependent native compact appearance.

Validation: inventory regression suite, TypeScript and production build; browser geometry and screenshot check after deployment.
