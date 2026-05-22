import 'dotenv/config';
import { TriliumClient } from '../src/utils/trilium-client.js';
import { deleteNote } from '../src/tools/delete-note.js';
import { listChildren } from '../src/tools/list-children.js';

const client = new TriliumClient();
const results = [];
const log = (label, ok, info = '') => {
  results.push({ label, ok });
  console.log(` ${ok ? 'OK' : 'FAIL'}  ${label}${info ? ' — ' + info : ''}`);
};

const createdNoteIds = [];

async function createNote(parent, title) {
  const r = await client.post('create-note', {
    parentNoteId: parent, title, type: 'text', content: ''
  });
  createdNoteIds.push(r.note.noteId);
  return r.note.noteId;
}

try {
  console.log('=== SMOKE FASE 3 — delete_note ===');

  // Setup: dummy-root con leaf + parent → child
  const rootId = await createNote('root', 'mcp-smoke-delete-root');
  const leafId = await createNote(rootId, 'to-delete-leaf');
  const parentId = await createNote(rootId, 'to-delete-parent');
  const childId = await createNote(parentId, 'to-delete-child');
  console.log(` setup: root=${rootId} leaf=${leafId} parent=${parentId} child=${childId}`);

  // Test 1: protezione root
  let r = await deleteNote(client, { noteId: 'root' });
  log('refuse root delete', r.isError && r.content[0].text.includes('Cannot delete root'));

  // Test 2: cancellazione foglia diretta
  r = await deleteNote(client, { noteId: leafId });
  log('delete leaf direct', !r.isError);

  // Verifica: leaf cancellata, root ora ha 1 figlio (parent)
  r = await listChildren(client, { noteId: rootId });
  let data = JSON.parse(r.content[1].text);
  log('after leaf delete: root has 1 child', !r.isError && data.result.count === 1);

  // Test 3: cancellazione subtree senza confirmCascade → ValidationError
  r = await deleteNote(client, { noteId: parentId });
  log('refuse subtree without confirmCascade', r.isError && r.content[0].text.toLowerCase().includes('confirmcascade'));

  // Verifica: parent ancora c'è
  r = await listChildren(client, { noteId: parentId });
  data = JSON.parse(r.content[1].text);
  log('parent still alive (1 child)', !r.isError && data.result.count === 1);

  // Test 4: cancellazione subtree con confirmCascade
  r = await deleteNote(client, { noteId: parentId, confirmCascade: true });
  log('delete subtree with confirmCascade', !r.isError);

  // Verifica: parent cancellata
  r = await listChildren(client, { noteId: rootId });
  data = JSON.parse(r.content[1].text);
  log('after subtree delete: root has 0 children', !r.isError && data.result.count === 0);

  // Test 5: cancellazione nota che non esiste → 404
  r = await deleteNote(client, { noteId: 'nonexistent-xyz-123' });
  log('delete nonexistent note → 404', r.isError && r.content[0].text.includes('Note not found'));

  // Test 6: cancella la root del nostro tree dummy
  r = await deleteNote(client, { noteId: rootId });
  log('delete dummy-root cleanup', !r.isError);

} catch (err) {
  log('UNEXPECTED ERROR', false, err.message);
} finally {
  console.log(' cleanup: residual notes...');
  // Cleanup safety net (in caso lo smoke crashi prima della delete della root)
  for (const id of [...createdNoteIds].reverse()) {
    try {
      await client.delete(`notes/${id}`);
    } catch (_) {}
  }
  console.log(' cleanup done');
}

const ok = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok).length;
console.log(`\n=== RISULTATI: ${ok} OK / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
