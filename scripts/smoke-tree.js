import 'dotenv/config';
import { TriliumClient } from '../src/utils/trilium-client.js';
import { listChildren } from '../src/tools/list-children.js';
import { moveNote } from '../src/tools/move-note.js';

const client = new TriliumClient();
const results = [];
const log = (label, ok, info = '') => {
  results.push({ label, ok });
  console.log(` ${ok ? 'OK' : 'FAIL'}  ${label}${info ? ' — ' + info : ''}`);
};
const isOk = (r) => !r.isError;

const createdNoteIds = [];
const createdBranchIds = [];

async function createNote(parent, title) {
  const r = await client.post('create-note', {
    parentNoteId: parent, title, type: 'text', content: ''
  });
  createdNoteIds.push(r.note.noteId);
  return r;
}

let treeRootId;

try {
  console.log('=== SMOKE FASE 2 — tree navigation ===');

  const rootNote = await createNote('root', 'mcp-smoke-tree-root');
  treeRootId = rootNote.note.noteId;
  console.log(` setup: tree-root noteId=${treeRootId}`);

  const childA = await createNote(treeRootId, 'child-a');
  const childB = await createNote(treeRootId, 'child-b');
  const childC = await createNote(treeRootId, 'child-c');
  const grand1 = await createNote(childA.note.noteId, 'grand-1');
  const grand2 = await createNote(childA.note.noteId, 'grand-2');

  // Test 1: list_children del tree-root → 3 figli
  let r = await listChildren(client, { noteId: treeRootId });
  let data = JSON.parse(r.content[1].text);
  log('list_children tree-root = 3', isOk(r) && data.result.count === 3, `count=${data.result.count}`);

  // Test 2: list_children di child-a → 2 figli
  r = await listChildren(client, { noteId: childA.note.noteId });
  data = JSON.parse(r.content[1].text);
  log('list_children child-a = 2', isOk(r) && data.result.count === 2, `count=${data.result.count}`);

  // Test 3: list_children di una foglia → 0
  r = await listChildren(client, { noteId: grand1.note.noteId });
  data = JSON.parse(r.content[1].text);
  log('list_children grand-1 = 0', isOk(r) && data.result.count === 0, `count=${data.result.count}`);

  // Test 4: move_note single-branch: grand-1 sotto child-b
  r = await moveNote(client, { noteId: grand1.note.noteId, newParentNoteId: childB.note.noteId });
  log('move_note grand-1 → child-b', isOk(r));

  // Verifica: child-b ora ha 1 figlio (grand-1)
  r = await listChildren(client, { noteId: childB.note.noteId });
  data = JSON.parse(r.content[1].text);
  log('child-b ora ha 1 figlio (grand-1)', isOk(r) && data.result.count === 1 && data.result.children[0].noteId === grand1.note.noteId);

  // Test 5: clone di grand-2 sotto child-c
  const newBranch = await client.post('branches', {
    noteId: grand2.note.noteId,
    parentNoteId: childC.note.noteId,
    prefix: '',
    isExpanded: false,
    notePosition: 0
  });
  createdBranchIds.push(newBranch.branchId);
  log('cloned grand-2 under child-c', true, `branchId=${newBranch.branchId}`);

  // Test 6: move il branch clone di grand-2 da child-c verso child-b usando oldParentNoteId
  r = await moveNote(client, {
    noteId: grand2.note.noteId,
    newParentNoteId: childB.note.noteId,
    oldParentNoteId: childC.note.noteId
  });
  log('move_note grand-2 (clone in child-c) → child-b', isOk(r));

  // Verifica: child-b ha 2 figli; child-a ha ancora 1 (originale grand-2); child-c ha 0
  r = await listChildren(client, { noteId: childB.note.noteId });
  data = JSON.parse(r.content[1].text);
  log('child-b ora ha 2 figli (grand-1 + grand-2 clone)', isOk(r) && data.result.count === 2);

  r = await listChildren(client, { noteId: childA.note.noteId });
  data = JSON.parse(r.content[1].text);
  log('child-a ancora 1 figlio (grand-2 originale)', isOk(r) && data.result.count === 1 && data.result.children[0].noteId === grand2.note.noteId);

  r = await listChildren(client, { noteId: childC.note.noteId });
  data = JSON.parse(r.content[1].text);
  log('child-c ora ha 0 figli', isOk(r) && data.result.count === 0);

  // Test 7: move multi-branch senza disambiguazione → errore esplicito
  r = await moveNote(client, { noteId: grand2.note.noteId, newParentNoteId: treeRootId });
  log('move_note multi-branch senza disambiguazione → errore', r.isError && r.content[0].text.includes('multiple branches'));

  // Test 8: move single-branch con branchId esplicito valido
  r = await moveNote(client, {
    noteId: childC.note.noteId,
    newParentNoteId: childB.note.noteId
  });
  log('move_note single-branch esplicito (child-c → child-b)', isOk(r));
  r = await listChildren(client, { noteId: childB.note.noteId });
  data = JSON.parse(r.content[1].text);
  log('child-b ora ha 3 figli (grand-1 + grand-2 clone + child-c)', isOk(r) && data.result.count === 3);

} catch (err) {
  log('UNEXPECTED ERROR', false, err.message);
} finally {
  console.log(' cleanup: deleting created notes...');
  for (const branchId of createdBranchIds) {
    try { await client.delete(`branches/${branchId}`); } catch (_) {}
  }
  if (treeRootId) {
    try { await client.delete(`notes/${treeRootId}`); } catch (_) {}
  }
  console.log(' cleanup done');
}

const ok = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok).length;
console.log(`\n=== RISULTATI: ${ok} OK / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
