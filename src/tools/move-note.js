import { validators, ValidationError } from '../utils/validation.js';
import { TriliumAPIError } from '../utils/trilium-client.js';
import { logger } from '../utils/logger.js';

export async function moveNote(triliumClient, args) {
  try {
    const noteId = validators.noteId(args.noteId);
    const newParentNoteId = validators.noteId(args.newParentNoteId);
    const explicitBranchId = args.branchId ? validators.branchId(args.branchId) : null;
    const oldParentHint = args.oldParentNoteId ? validators.noteId(args.oldParentNoteId) : null;

    const note = await triliumClient.get(`notes/${noteId}`);
    const branchIds = Array.isArray(note?.branchIds) ? note.branchIds : [];

    if (branchIds.length === 0) {
      throw new ValidationError(`Note ${noteId} has no branches; cannot move`);
    }

    let branchId;
    let resolvedOldParent;

    if (explicitBranchId) {
      if (!branchIds.includes(explicitBranchId)) {
        throw new ValidationError(`Branch ${explicitBranchId} does not belong to note ${noteId}. Available branches: ${branchIds.join(', ')}`);
      }
      branchId = explicitBranchId;
    } else if (branchIds.length === 1) {
      branchId = branchIds[0];
    } else {
      const branches = await Promise.all(branchIds.map(id => triliumClient.get(`branches/${id}`)));
      if (oldParentHint) {
        const match = branches.find(b => b.parentNoteId === oldParentHint);
        if (!match) {
          throw new ValidationError(`No branch of note ${noteId} found under parent ${oldParentHint}. Available parents: ${branches.map(b => b.parentNoteId).join(', ')}`);
        }
        branchId = match.branchId;
        resolvedOldParent = match.parentNoteId;
      } else {
        const hint = branches.map(b => `${b.branchId} (under ${b.parentNoteId})`).join('; ');
        throw new ValidationError(`Note ${noteId} has multiple branches — specify branchId or oldParentNoteId. Branches: ${hint}`);
      }
    }

    if (resolvedOldParent === undefined) {
      const currentBranch = await triliumClient.get(`branches/${branchId}`);
      resolvedOldParent = currentBranch?.parentNoteId;
    }

    logger.debug(`Moving branch ${branchId} from ${resolvedOldParent} to ${newParentNoteId}`);
    await triliumClient.put(`branches/${branchId}`, { parentNoteId: newParentNoteId });

    const data = {
      operation: 'move_note',
      timestamp: new Date().toISOString(),
      request: { noteId, newParentNoteId, branchId: explicitBranchId, oldParentNoteId: oldParentHint },
      result: { noteId, branchId, oldParentNoteId: resolvedOldParent, newParentNoteId }
    };
    return {
      content: [
        { type: 'text', text: `Note ${noteId} moved (branch ${branchId}: ${resolvedOldParent} → ${newParentNoteId})` },
        { type: 'text', text: JSON.stringify(data, null, 2) }
      ]
    };
  } catch (error) {
    logger.error(`move_note failed: ${error.message}`);
    const errorData = {
      operation: 'move_note',
      timestamp: new Date().toISOString(),
      request: args,
      error: {
        type: error.constructor.name,
        message: error.message,
        ...(error instanceof TriliumAPIError && { status: error.status, details: error.details })
      }
    };
    if (error instanceof ValidationError) {
      const text = error.message.includes('multiple branches') ? `Note has multiple branches: ${error.message}` : `Validation error: ${error.message}`;
      return { content: [{ type: 'text', text }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    if (error instanceof TriliumAPIError && error.status === 404) {
      return { content: [{ type: 'text', text: `Note or parent not found` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    if (error instanceof TriliumAPIError && error.status === 409) {
      return { content: [{ type: 'text', text: `Conflict: cannot move note (cycle or duplicate)` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
    }
    return { content: [{ type: 'text', text: `Failed to move note: ${error.message}` }, { type: 'text', text: JSON.stringify(errorData, null, 2) }], isError: true };
  }
}
