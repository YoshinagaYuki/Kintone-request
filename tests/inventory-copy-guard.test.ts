import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertCopySourceEditable } from '../lib/inventory/copy-guard';
function database(data: unknown[], error: unknown = null) {
 const query = { select() { return query; }, neq() { return query; }, contains(column: string, value: unknown) {
  assert.equal(column, 'slots');
  // PostgREST serializes JS arrays as PostgreSQL arrays, not JSONB.
  assert.equal(typeof value, 'string');
  assert.deepEqual(JSON.parse(value as string), [{ source_key: 'sheet:ordinary' }]);
  return query;
 }, async limit() { return { data, error }; } };
 return { from() { return query; } } as unknown as SupabaseClient;
}
test('ordinary edit passes a valid JSONB filter and remains an update', async () => {
 await assertCopySourceEditable(database([]), 'sheet:ordinary');
});
test('an active copy still protects its source', async () => {
 await assert.rejects(assertCopySourceEditable(database([{id:'copy'}]), 'sheet:ordinary'), /コピー先の新規申請/);
});
test('database failures do not silently remove source protection', async () => {
 await assert.rejects(assertCopySourceEditable(database([], {code:'offline'}), 'sheet:ordinary'), /確認できません/);
});
