#!/usr/bin/env node

import 'dotenv/config';
import { createRequire } from 'module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const require = createRequire(import.meta.url);
const { version: PACKAGE_VERSION } = require('../package.json');
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from './utils/logger.js';
import { TriliumClient, TriliumAPIError } from './utils/trilium-client.js';
import { ValidationError } from './utils/validation.js';
import { createNote } from './tools/create-note.js';
import { searchNotes } from './tools/search-notes.js';
import { getNote } from './tools/get-note.js';
import { updateNote } from './tools/update-note.js';
import { listAttributes } from './tools/list-attributes.js';
import { createAttribute } from './tools/create-attribute.js';
import { updateAttribute } from './tools/update-attribute.js';
import { deleteAttribute } from './tools/delete-attribute.js';
import { listChildren } from './tools/list-children.js';
import { moveNote } from './tools/move-note.js';
import { deleteNote } from './tools/delete-note.js';
import { updateNoteTitle } from './tools/update-note-title.js';
import { getRecentNotesResource } from './resources/recent-notes.js';

class TriliumMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'mcp-trilium',
        version: PACKAGE_VERSION,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.triliumClient = new TriliumClient();
    
    this.setupHandlers();
    logger.info('TriliumMCP Server initialized');
  }

  setupHandlers() {
    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupErrorHandling();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug('Listing available tools');
      return {
        tools: [
          {
            name: 'create_note',
            description: 'Create a new note in TriliumNext. For text notes, content is interpreted as markdown by default and converted to HTML server-side to save tokens.',
            inputSchema: {
              type: 'object',
              properties: {
                title: {
                  type: 'string',
                  description: 'The title of the note (max 200 characters)',
                },
                content: {
                  type: 'string',
                  description: 'Content of the note (max 1MB). For type=text with format=markdown (default), pass terse markdown — the server converts to HTML before storing.',
                },
                format: {
                  type: 'string',
                  enum: ['markdown', 'html', 'raw'],
                  default: 'markdown',
                  description: "Input format. 'markdown' (default): convert md→html for text notes (saves tokens). 'html': pass content as-is (no conversion). 'raw': passthrough. Conversion is skipped automatically when type!='text' or mime contains 'markdown'.",
                },
                type: {
                  type: 'string',
                  enum: ['file', 'image', 'search', 'noteMap', 'launcher', 'doc', 'contentWidget',
                    'text', 'relationMap', 'render', 'canvas', 'mermaid', 'book', 'webView',
                    'code', 'mindMap', 'spreadsheet', 'llmChat'],
                  default: 'text',
                  description: 'Note type. text=HTML editor (default); code=monospace+syntax (use mime for language); mermaid=diagram; mindMap=mindmap; spreadsheet=Univer Sheets (v0.103+); canvas=Excalidraw; book=container; relationMap=visual nodes graph; render=custom HTML render; file/image=binary; search=saved search; webView=iframe; doc/noteMap/launcher/contentWidget/llmChat=internal Trilium types',
                },
                mime: {
                  type: 'string',
                  description: 'MIME type. Optional, auto-determined by server based on type if omitted. Esempi: text/markdown per note text in markdown; application/javascript per code JS; text/x-python per code Python.',
                },
                parentNoteId: {
                  type: 'string',
                  description: 'ID of the parent note (defaults to "root" if not provided)',
                },
              },
              required: ['title', 'content'],
            },
          },
          {
            name: 'search_notes',
            description: 'Search for notes in TriliumNext',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query (fulltext or structured, max 500 characters)',
                },
                limit: {
                  type: 'number',
                  minimum: 1,
                  maximum: 100,
                  default: 10,
                  description: 'Maximum number of results to return',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_note',
            description: 'Get details of a specific note. By default converts HTML content to markdown to reduce token usage.',
            inputSchema: {
              type: 'object',
              properties: {
                noteId: {
                  type: 'string',
                  description: 'The ID of the note to retrieve',
                },
                format: {
                  type: 'string',
                  enum: ['markdown', 'html', 'raw'],
                  default: 'markdown',
                  description: "Content format. 'markdown' (default) converts HTML notes to markdown to save tokens; 'html' returns original HTML; 'raw' returns content untouched.",
                },
                includeContent: {
                  type: 'boolean',
                  default: true,
                  description: 'If false, only metadata is returned (no content fetch). Useful for cheap exploration.',
                },
                maxContentChars: {
                  type: 'number',
                  minimum: 1,
                  description: 'Optional. Truncate content to this many characters (after format conversion). Adds truncated:true and originalLength to response.',
                },
              },
              required: ['noteId'],
            },
          },
          {
            name: 'update_note',
            description: 'Update content of an existing note. For text notes, content is interpreted as markdown by default and converted to HTML server-side.',
            inputSchema: {
              type: 'object',
              properties: {
                noteId: {
                  type: 'string',
                  description: 'The ID of the note to update',
                },
                content: {
                  type: 'string',
                  description: 'New content (max 1MB). For text notes with format=markdown (default), pass terse markdown — the server converts to HTML.',
                },
                format: {
                  type: 'string',
                  enum: ['markdown', 'html', 'raw'],
                  default: 'markdown',
                  description: "Input format. 'markdown' (default): convert md→html for text notes. 'html'/'raw': passthrough. Conversion is skipped automatically when the existing note type!='text' or mime contains 'markdown'.",
                },
              },
              required: ['noteId', 'content'],
            },
          },
          {
            name: 'list_attributes',
            description: 'List all attributes (labels and relations) of a note',
            inputSchema: {
              type: 'object',
              properties: {
                noteId: { type: 'string', description: 'The ID of the note' },
                type: { type: 'string', enum: ['label', 'relation'], description: 'Filter by attribute type (optional)' }
              },
              required: ['noteId']
            }
          },
          {
            name: 'create_attribute',
            description: 'Create a new label or relation on a note',
            inputSchema: {
              type: 'object',
              properties: {
                noteId: { type: 'string', description: 'Note to attach the attribute to' },
                type: { type: 'string', enum: ['label', 'relation'], description: "'label' for #tag, 'relation' for ~link" },
                name: { type: 'string', description: 'Attribute name without # or ~ prefix (a-zA-Z0-9_)' },
                value: { type: 'string', description: "Label value (optional, empty allowed) or target noteId for relations (required)" },
                isInheritable: { type: 'boolean', default: false },
                position: { type: 'number' }
              },
              required: ['noteId', 'type', 'name']
            }
          },
          {
            name: 'update_attribute',
            description: 'Update value or position of an existing attribute (type and name are immutable)',
            inputSchema: {
              type: 'object',
              properties: {
                attributeId: { type: 'string' },
                value: { type: 'string', description: 'New value (string for labels, target noteId for relations)' },
                position: { type: 'number' }
              },
              required: ['attributeId']
            }
          },
          {
            name: 'delete_attribute',
            description: 'Delete an attribute (label or relation) by its ID',
            inputSchema: {
              type: 'object',
              properties: { attributeId: { type: 'string' } },
              required: ['attributeId']
            }
          },
          {
            name: 'list_children',
            description: 'List direct children (depth=1) of a note in the tree',
            inputSchema: {
              type: 'object',
              properties: {
                noteId: { type: 'string' },
                limit: { type: 'number', minimum: 1, maximum: 100, default: 50 }
              },
              required: ['noteId']
            }
          },
          {
            name: 'move_note',
            description: 'Move a note to a new parent. For cloned notes (multi-branch), pass branchId or oldParentNoteId to disambiguate.',
            inputSchema: {
              type: 'object',
              properties: {
                noteId: { type: 'string' },
                newParentNoteId: { type: 'string' },
                branchId: { type: 'string', description: 'Explicit branch to move (required if note has multiple branches and oldParentNoteId is not provided)' },
                oldParentNoteId: { type: 'string', description: 'Current parent of the branch to move (alternative to branchId)' }
              },
              required: ['noteId', 'newParentNoteId']
            }
          },
          {
            name: 'delete_note',
            description: 'Delete a note. If the note has children, confirmCascade must be true.',
            inputSchema: {
              type: 'object',
              properties: {
                noteId: { type: 'string' },
                confirmCascade: { type: 'boolean', default: false, description: 'Required true if the note has children' }
              },
              required: ['noteId']
            }
          },
          {
            name: 'update_note_title',
            description: 'Rename a note (change its title). The note ID and type stay the same.',
            inputSchema: {
              type: 'object',
              properties: {
                noteId: { type: 'string', description: 'The ID of the note to rename' },
                title: { type: 'string', description: 'New title (max 200 chars, non-empty)' }
              },
              required: ['noteId', 'title']
            }
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        logger.info(`Executing tool: ${request.params.name}`);
        
        switch (request.params.name) {
          case 'create_note':
            return await this.createNote(request.params.arguments);
          case 'search_notes':
            return await this.searchNotes(request.params.arguments);
          case 'get_note':
            return await this.getNote(request.params.arguments);
          case 'update_note':
            return await this.updateNote(request.params.arguments);
          case 'list_attributes':
            return await this.listAttributes(request.params.arguments);
          case 'create_attribute':
            return await this.createAttribute(request.params.arguments);
          case 'update_attribute':
            return await this.updateAttribute(request.params.arguments);
          case 'delete_attribute':
            return await this.deleteAttribute(request.params.arguments);
          case 'list_children':
            return await this.listChildren(request.params.arguments);
          case 'move_note':
            return await this.moveNote(request.params.arguments);
          case 'delete_note':
            return await this.deleteNote(request.params.arguments);
          case 'update_note_title':
            return await this.updateNoteTitle(request.params.arguments);
          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        logger.error(`Tool execution failed: ${error.message}`);
        throw error;
      }
    });
  }

  setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      logger.debug('Listing available resources');
      return {
        resources: [
          {
            uri: 'trilium://recent-notes',
            name: 'Recent Notes',
            description: 'Recently modified notes in TriliumNext',
            mimeType: 'application/json',
          },
        ],
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      logger.info(`Reading resource: ${request.params.uri}`);
      
      const uri = request.params.uri;
      
      if (uri === 'trilium://recent-notes') {
        return await this.getRecentNotesResource();
      }
      
      throw new Error(`Unknown resource: ${uri}`);
    });
  }

  setupErrorHandling() {
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection:', reason);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      process.exit(1);
    });
  }

  async createNote(args) {
    return await createNote(this.triliumClient, args);
  }

  async searchNotes(args) {
    return await searchNotes(this.triliumClient, args);
  }

  async getNote(args) {
    return await getNote(this.triliumClient, args);
  }

  async updateNote(args) {
    return await updateNote(this.triliumClient, args);
  }

  async listAttributes(args) {
    return await listAttributes(this.triliumClient, args);
  }

  async createAttribute(args) {
    return await createAttribute(this.triliumClient, args);
  }

  async updateAttribute(args) {
    return await updateAttribute(this.triliumClient, args);
  }

  async deleteAttribute(args) {
    return await deleteAttribute(this.triliumClient, args);
  }

  async listChildren(args) {
    return await listChildren(this.triliumClient, args);
  }

  async moveNote(args) {
    return await moveNote(this.triliumClient, args);
  }

  async deleteNote(args) {
    return await deleteNote(this.triliumClient, args);
  }

  async updateNoteTitle(args) {
    return await updateNoteTitle(this.triliumClient, args);
  }

  async getRecentNotesResource() {
    return await getRecentNotesResource(this.triliumClient);
  }

  async run() {
    try {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.info('TriliumNext MCP server running on stdio');
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start the server
const server = new TriliumMCPServer();
server.run().catch((error) => {
  logger.error('Server startup failed:', error);
  process.exit(1);
});