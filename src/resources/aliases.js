import { readFileSync } from 'fs';
import { logger } from '../utils/logger.js';

const URI = 'trilium://aliases';

export function getAliasesResource(filePath) {
  let aliases = {};
  if (filePath) {
    try {
      const raw = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        aliases = parsed;
      } else {
        logger.warn(`Aliases file ${filePath} is not a JSON object; ignoring`);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn(`Could not read aliases file ${filePath}: ${error.message}`);
      }
    }
  }

  const data = {
    aliases,
    count: Object.keys(aliases).length,
    description: 'Configured name→noteId aliases (from TRILIUM_ALIASES_FILE)',
  };

  return {
    contents: [
      { uri: URI, mimeType: 'application/json', text: JSON.stringify(data, null, 2) },
    ],
  };
}
