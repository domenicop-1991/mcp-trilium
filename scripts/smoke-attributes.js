import 'dotenv/config';
import { TriliumClient } from '../src/utils/trilium-client.js';
import { listAttributes } from '../src/tools/list-attributes.js';
import { createAttribute } from '../src/tools/create-attribute.js';
import { updateAttribute } from '../src/tools/update-attribute.js';
import { deleteAttribute } from '../src/tools/delete-attribute.js';

const client = new TriliumClient();

let passed = 0;
let failed = 0;
let noteId = null;
let labelAttrId = null;
let relationAttrId = null;

function result(step, ok, detail = '') {
  if (ok) {
    console.log(`  OK  ${step}${detail ? ' — ' + detail : ''}`);
    passed++;
  } else {
    console.log(` FAIL ${step}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function isOk(res) {
  return !res.isError;
}

function parseData(res) {
  try {
    return JSON.parse(res.content[1].text);
  } catch {
    return null;
  }
}

async function createDummyNote() {
  const title = `mcp-smoke-attr-test-${Date.now()}`;
  const body = { parentNoteId: 'root', title, type: 'text', content: '' };
  const res = await client.post('create-note', body);
  return res.note?.noteId ?? res.noteId;
}

async function deleteDummyNote(id) {
  await client.delete(`notes/${id}`);
}

async function run() {
  console.log('=== Smoke test Fase 1 — attributes ===\n');

  try {
    noteId = await createDummyNote();
    result('setup: create dummy note', !!noteId, noteId ? `noteId=${noteId}` : 'no noteId returned');
    if (!noteId) {
      console.log('\nABORTED: impossibile creare nota dummy');
      process.exit(1);
    }
  } catch (e) {
    result('setup: create dummy note', false, e.message);
    console.log('\nABORTED: impossibile creare nota dummy');
    process.exit(1);
  }

  try {
    // Step 1 — listAttributes vuoto
    const r = await listAttributes(client, { noteId });
    const data = parseData(r);
    const count = data?.result?.count ?? -1;
    result('listAttributes (empty)', isOk(r) && count === 0, `count=${count}`);

    // Step 2 — createAttribute label
    const r2 = await createAttribute(client, { noteId, type: 'label', name: 'smoketest', value: 'phase1' });
    const data2 = parseData(r2);
    labelAttrId = data2?.result?.attributeId;
    result('createAttribute label', isOk(r2) && !!labelAttrId, labelAttrId ? `attributeId=${labelAttrId}` : 'no attributeId');

    // Step 3 — listAttributes 1 elemento
    const r3 = await listAttributes(client, { noteId });
    const data3 = parseData(r3);
    const attrs3 = data3?.result?.attributes ?? [];
    const ok3 = isOk(r3) && attrs3.length === 1 && attrs3[0]?.type === 'label' && attrs3[0]?.name === 'smoketest';
    result('listAttributes (1 label)', ok3, `count=${attrs3.length}`);

    // Step 4 — listAttributes filtro relation: 0 elementi
    const r4 = await listAttributes(client, { noteId, type: 'relation' });
    const data4 = parseData(r4);
    const count4 = data4?.result?.count ?? -1;
    result('listAttributes (filter relation = 0)', isOk(r4) && count4 === 0, `count=${count4}`);

    // Step 5 — createAttribute relation valida (target: root)
    const r5 = await createAttribute(client, { noteId, type: 'relation', name: 'related', value: 'root' });
    const data5 = parseData(r5);
    relationAttrId = data5?.result?.attributeId;
    result('createAttribute relation (target root)', isOk(r5) && !!relationAttrId, relationAttrId ? `attributeId=${relationAttrId}` : 'no attributeId');

    // Step 6 — createAttribute relation con target inesistente → ValidationError
    const r6 = await createAttribute(client, { noteId, type: 'relation', name: 'broken', value: 'nonexistent-xyz' });
    const isValidationError = r6.isError && r6.content[0]?.text?.includes('Validation error') && r6.content[0]?.text?.includes('does not exist');
    result('createAttribute relation (broken target → ValidationError)', isValidationError, r6.content[0]?.text?.substring(0, 80));

    // Step 7 — updateAttribute label
    if (labelAttrId) {
      const r7 = await updateAttribute(client, { attributeId: labelAttrId, value: 'phase1-updated' });
      result('updateAttribute label', isOk(r7), '');
    } else {
      result('updateAttribute label', false, 'SKIP: nessun labelAttrId');
    }

    // Step 8 — listAttributes: 2 elementi, label aggiornata
    const r8 = await listAttributes(client, { noteId });
    const data8 = parseData(r8);
    const attrs8 = data8?.result?.attributes ?? [];
    const labelUpdated = attrs8.find(a => a.name === 'smoketest');
    const ok8 = isOk(r8) && attrs8.length === 2 && labelUpdated?.value === 'phase1-updated';
    result('listAttributes (2 totali, label aggiornata)', ok8, `count=${attrs8.length}, labelValue=${labelUpdated?.value}`);

    // Step 9 — deleteAttribute label
    if (labelAttrId) {
      const r9 = await deleteAttribute(client, { attributeId: labelAttrId });
      result('deleteAttribute label', isOk(r9), '');
      if (isOk(r9)) labelAttrId = null;
    } else {
      result('deleteAttribute label', false, 'SKIP');
    }

    // Step 10 — deleteAttribute relation
    if (relationAttrId) {
      const r10 = await deleteAttribute(client, { attributeId: relationAttrId });
      result('deleteAttribute relation', isOk(r10), '');
      if (isOk(r10)) relationAttrId = null;
    } else {
      result('deleteAttribute relation', false, 'SKIP');
    }

    // Step 11 — listAttributes vuoto finale
    const r11 = await listAttributes(client, { noteId });
    const data11 = parseData(r11);
    const count11 = data11?.result?.count ?? -1;
    result('listAttributes (empty finale)', isOk(r11) && count11 === 0, `count=${count11}`);

  } catch (e) {
    result('unexpected crash', false, e.message);
  } finally {
    // Cleanup attributi rimasti (per sicurezza)
    for (const id of [labelAttrId, relationAttrId].filter(Boolean)) {
      try {
        await deleteAttribute(client, { attributeId: id });
      } catch (_) {}
    }
    // Cleanup nota dummy
    if (noteId) {
      try {
        await deleteDummyNote(noteId);
        console.log(`\n  cleanup: nota ${noteId} eliminata`);
      } catch (e) {
        console.log(`\n  cleanup WARN: non riuscito a eliminare nota ${noteId}: ${e.message}`);
      }
    }

    console.log(`\n=== RISULTATI: ${passed} OK / ${failed} FAIL ===`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

run();
