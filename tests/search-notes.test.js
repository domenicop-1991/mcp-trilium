import { jest } from '@jest/globals';
import { searchNotes } from '../src/tools/search-notes.js';
import { ValidationError } from '../src/utils/validation.js';
import { TriliumAPIError } from '../src/utils/trilium-client.js';

// Mock the logger to avoid console output during tests
jest.mock('../src/utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('searchNotes', () => {
  let mockTriliumClient;

  beforeEach(() => {
    // Create a fresh mock for each test
    mockTriliumClient = {
      get: jest.fn()
    };
    jest.clearAllMocks();
  });

  describe('successful searches', () => {
    test('should return formatted results for basic fulltext search', async () => {
      const mockResponse = {
        results: [
          {
            noteId: 'note123',
            title: 'JavaScript Programming',
            type: 'text',
            dateModified: '2024-01-15T14:30:00.000Z',
            parentNoteIds: ['parent456']
          },
          {
            noteId: 'note789',
            title: 'Advanced JavaScript',
            type: 'code',
            dateModified: '2024-01-14T10:15:00.000Z',
            parentNoteIds: ['parent456']
          }
        ]
      };

      mockTriliumClient.get.mockResolvedValue(mockResponse);

      const result = await searchNotes(mockTriliumClient, {
        query: 'javascript programming',
        limit: 10
      });

      expect(mockTriliumClient.get).toHaveBeenCalledWith('notes?search=javascript+programming&limit=10');
      expect(result.content).toHaveLength(2);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Found 2 notes for "javascript programming"');
      expect(result.content[1].type).toBe('text');
      
      const searchData = JSON.parse(result.content[1].text);
      expect(searchData.query).toBe('javascript programming');
      expect(searchData.limit).toBe(10);
      expect(searchData.totalResults).toBe(2);
      expect(searchData.notes).toHaveLength(2);
      expect(searchData.notes[0].noteId).toBe('note123');
      expect(searchData.notes[0].title).toBe('JavaScript Programming');
      expect(searchData.notes[1].noteId).toBe('note789');
      expect(searchData.notes[1].title).toBe('Advanced JavaScript');
    });

    test('should handle exact match search with quotes', async () => {
      const mockResponse = {
        results: [
          {
            noteId: 'note456',
            title: 'The Two Towers',
            type: 'text',
            dateModified: '2024-01-15T14:30:00.000Z'
          }
        ]
      };

      mockTriliumClient.get.mockResolvedValue(mockResponse);

      const result = await searchNotes(mockTriliumClient, {
        query: '"Two Towers"',
        limit: 5
      });

      expect(mockTriliumClient.get).toHaveBeenCalledWith('notes?search=%22Two+Towers%22&limit=5');
      expect(result.content[0].text).toBe('Found 1 note for "\"Two Towers\""');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.query).toBe('"Two Towers"');
      expect(jsonData.notes[0].title).toBe('The Two Towers');
    });

    test('should handle label-based search', async () => {
      const mockResponse = {
        results: [
          {
            noteId: 'note789',
            title: 'JavaScript Book',
            type: 'book',
            dateModified: '2024-01-15T14:30:00.000Z'
          }
        ]
      };

      mockTriliumClient.get.mockResolvedValue(mockResponse);

      const result = await searchNotes(mockTriliumClient, {
        query: '#book javascript',
        limit: 10
      });

      expect(mockTriliumClient.get).toHaveBeenCalledWith('notes?search=%23book+javascript&limit=10');
      expect(result.content[0].text).toBe('Found 1 note for "#book javascript"');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.query).toBe('#book javascript');
    });

    test('should use default limit when not specified', async () => {
      const mockResponse = { results: [] };
      mockTriliumClient.get.mockResolvedValue(mockResponse);

      await searchNotes(mockTriliumClient, {
        query: 'test query'
      });

      expect(mockTriliumClient.get).toHaveBeenCalledWith('notes?search=test+query&limit=10');
    });

    test('should handle notes with missing optional fields', async () => {
      const mockResponse = {
        results: [
          {
            noteId: 'note123',
            // Missing title, type, dateModified, parentNoteId
          }
        ]
      };

      mockTriliumClient.get.mockResolvedValue(mockResponse);

      const result = await searchNotes(mockTriliumClient, {
        query: 'test',
        limit: 10
      });

      expect(result.content[0].text).toBe('Found 1 note for "test"');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.notes[0].title).toBe('Untitled');
      expect(jsonData.notes[0].type).toBe('text');
      expect(jsonData.notes[0].dateModified).toBeUndefined();
      expect(jsonData.notes[0].parentNoteIds).toEqual([]);
    });

    test('should include all optional fields when present', async () => {
      const mockResponse = {
        results: [
          {
            noteId: 'note123',
            title: 'Complete Note',
            type: 'code',
            dateModified: '2024-01-15T14:30:00.000Z',
            parentNoteIds: ['parent456']
          }
        ]
      };

      mockTriliumClient.get.mockResolvedValue(mockResponse);

      const result = await searchNotes(mockTriliumClient, {
        query: 'test',
        limit: 10
      });

      expect(result.content[0].text).toBe('Found 1 note for "test"');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.notes[0].title).toBe('Complete Note');
      expect(jsonData.notes[0].type).toBe('code');
      expect(jsonData.notes[0].dateModified).toBe('2024-01-15T14:30:00.000Z');
      expect(jsonData.notes[0].parentNoteIds).toEqual(['parent456']);
    });

    test('projection omits dateCreated and isProtected but keeps dateModified/parentNoteIds', async () => {
      mockTriliumClient.get.mockResolvedValue({
        results: [{
          noteId: 'n1', title: 'T', type: 'text',
          dateCreated: '2024-01-01', dateModified: '2024-02-02',
          parentNoteIds: ['p1'], isProtected: false,
        }],
      });
      const res = await searchNotes(mockTriliumClient, { query: 'x', limit: 5 });
      const data = JSON.parse(res.content[1].text);
      const note = data.notes[0];
      expect(note.noteId).toBe('n1');
      expect(note.title).toBe('T');
      expect(note.type).toBe('text');
      expect(note.dateModified).toBe('2024-02-02');
      expect(note.parentNoteIds).toEqual(['p1']);
      expect(note).not.toHaveProperty('dateCreated');
      expect(note).not.toHaveProperty('isProtected');
    });

    test('appends optional ETAPI params only when provided', async () => {
      mockTriliumClient.get.mockResolvedValue({ results: [] });

      await searchNotes(mockTriliumClient, {
        query: 'diario',
        limit: 5,
        ancestorNoteId: 'abc123',
        orderBy: 'dateModified',
        orderDirection: 'desc',
        fastSearch: true,
        includeArchivedNotes: false,
        ancestorDepth: 'eq1'
      });

      const calledUrl = mockTriliumClient.get.mock.calls[0][0];
      expect(calledUrl).toContain('search=diario');
      expect(calledUrl).toContain('limit=5');
      expect(calledUrl).toContain('ancestorNoteId=abc123');
      expect(calledUrl).toContain('ancestorDepth=eq1');
      expect(calledUrl).toContain('orderBy=dateModified');
      expect(calledUrl).toContain('orderDirection=desc');
      expect(calledUrl).toContain('fastSearch=true');
      expect(calledUrl).toContain('includeArchivedNotes=false');
    });

    test('does not append optional params when absent (backward compatible)', async () => {
      mockTriliumClient.get.mockResolvedValue({ results: [] });

      await searchNotes(mockTriliumClient, { query: 'plain', limit: 10 });

      expect(mockTriliumClient.get).toHaveBeenCalledWith('notes?search=plain&limit=10');
    });
  });

  describe('empty results', () => {
    test('should return helpful message when no notes found', async () => {
      mockTriliumClient.get.mockResolvedValue({ results: [] });

      const result = await searchNotes(mockTriliumClient, {
        query: 'nonexistent query',
        limit: 10
      });

      expect(result.content).toHaveLength(2);
      expect(result.content[0].text).toBe('No notes found for "nonexistent query"');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.query).toBe('nonexistent query');
      expect(jsonData.totalResults).toBe(0);
      expect(jsonData.notes).toEqual([]);
    });
  });

  describe('input validation', () => {
    test('should reject empty query', async () => {
      const result = await searchNotes(mockTriliumClient, {
        query: '',
        limit: 10
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Validation error: Search query must be a non-empty string');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.error.type).toBe('ValidationError');
      expect(jsonData.error.message).toBe('Search query must be a non-empty string');
      expect(mockTriliumClient.get).not.toHaveBeenCalled();
    });

    test('should reject whitespace-only query', async () => {
      const result = await searchNotes(mockTriliumClient, {
        query: '   \t\n   ',
        limit: 10
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Validation error: Search query cannot be empty');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.error.message).toBe('Search query cannot be empty');
      expect(mockTriliumClient.get).not.toHaveBeenCalled();
    });

    test('should reject query that is too long', async () => {
      const longQuery = 'a'.repeat(501); // Exceeds 500 character limit

      const result = await searchNotes(mockTriliumClient, {
        query: longQuery,
        limit: 10
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Validation error: Search query cannot exceed 500 characters');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.error.message).toBe('Search query cannot exceed 500 characters');
      expect(mockTriliumClient.get).not.toHaveBeenCalled();
    });

    test('should reject non-string query', async () => {
      const result = await searchNotes(mockTriliumClient, {
        query: 123,
        limit: 10
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Validation error: Search query must be a non-empty string');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.error.message).toBe('Search query must be a non-empty string');
      expect(mockTriliumClient.get).not.toHaveBeenCalled();
    });

    test('should reject null/undefined query', async () => {
      const result = await searchNotes(mockTriliumClient, {
        query: null,
        limit: 10
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Validation error: Search query must be a non-empty string');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.error.message).toBe('Search query must be a non-empty string');
      expect(mockTriliumClient.get).not.toHaveBeenCalled();
    });

    test('should reject limit less than 1', async () => {
      const result = await searchNotes(mockTriliumClient, {
        query: 'test',
        limit: 0
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Validation error: Limit must be a positive integer');
      expect(mockTriliumClient.get).not.toHaveBeenCalled();
    });

    test('should reject limit greater than 100', async () => {
      const result = await searchNotes(mockTriliumClient, {
        query: 'test',
        limit: 101
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Validation error: Limit cannot exceed 100');
      expect(mockTriliumClient.get).not.toHaveBeenCalled();
    });

    test('should reject non-numeric limit', async () => {
      const result = await searchNotes(mockTriliumClient, {
        query: 'test',
        limit: 'invalid'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Validation error: Limit must be a positive integer');
      expect(mockTriliumClient.get).not.toHaveBeenCalled();
    });

    test('should accept valid limit boundaries', async () => {
      mockTriliumClient.get.mockResolvedValue({ results: [] });

      // Test minimum valid limit
      await searchNotes(mockTriliumClient, {
        query: 'test',
        limit: 1
      });

      expect(mockTriliumClient.get).toHaveBeenCalledWith('notes?search=test&limit=1');

      mockTriliumClient.get.mockClear();

      // Test maximum valid limit
      await searchNotes(mockTriliumClient, {
        query: 'test',
        limit: 100
      });

      expect(mockTriliumClient.get).toHaveBeenCalledWith('notes?search=test&limit=100');
    });

    test('should trim whitespace from query', async () => {
      mockTriliumClient.get.mockResolvedValue({ results: [] });

      await searchNotes(mockTriliumClient, {
        query: '  test query  ',
        limit: 10
      });

      expect(mockTriliumClient.get).toHaveBeenCalledWith('notes?search=test+query&limit=10');
    });
  });

  describe('API error handling', () => {
    test('should handle TriliumNext API errors', async () => {
      const apiError = new TriliumAPIError('Server unavailable', 503);
      mockTriliumClient.get.mockRejectedValue(apiError);

      const result = await searchNotes(mockTriliumClient, {
        query: 'test',
        limit: 10
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('TriliumNext API error: Server unavailable');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.error.type).toBe('TriliumAPIError');
      expect(jsonData.error.message).toBe('Server unavailable');
      expect(jsonData.error.status).toBe(503);
    });

    test('should handle authentication errors', async () => {
      const authError = new TriliumAPIError('Authentication failed', 401);
      mockTriliumClient.get.mockRejectedValue(authError);

      const result = await searchNotes(mockTriliumClient, {
        query: 'test',
        limit: 10
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('TriliumNext API error: Authentication failed');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.error.message).toBe('Authentication failed');
      expect(jsonData.error.status).toBe(401);
    });

    test('should handle invalid API response format', async () => {
      // Return response without results array
      mockTriliumClient.get.mockResolvedValue({ invalid: 'response' });

      const result = await searchNotes(mockTriliumClient, {
        query: 'test',
        limit: 10
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('TriliumNext API error: Invalid response from TriliumNext API - expected object with results array');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.error.message).toBe('Invalid response from TriliumNext API - expected object with results array');
    });

    test('should handle network errors', async () => {
      const networkError = new Error('Network timeout');
      mockTriliumClient.get.mockRejectedValue(networkError);

      const result = await searchNotes(mockTriliumClient, {
        query: 'test',
        limit: 10
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Search failed: Network timeout');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.error.type).toBe('Error');
      expect(jsonData.error.message).toBe('Network timeout');
    });
  });

  describe('URL encoding', () => {
    test('should properly encode special characters in search query', async () => {
      mockTriliumClient.get.mockResolvedValue({ results: [] });

      await searchNotes(mockTriliumClient, {
        query: 'test & encode + special % chars',
        limit: 10
      });

      expect(mockTriliumClient.get).toHaveBeenCalledWith(
        'notes?search=test+%26+encode+%2B+special+%25+chars&limit=10'
      );
    });

    test('should properly encode quotes in search query', async () => {
      mockTriliumClient.get.mockResolvedValue({ results: [] });

      await searchNotes(mockTriliumClient, {
        query: '"exact phrase" with quotes',
        limit: 10
      });

      expect(mockTriliumClient.get).toHaveBeenCalledWith(
        'notes?search=%22exact+phrase%22+with+quotes&limit=10'
      );
    });

    test('should properly encode hash symbols for label search', async () => {
      mockTriliumClient.get.mockResolvedValue({ results: [] });

      await searchNotes(mockTriliumClient, {
        query: '#label #tag search',
        limit: 10
      });

      expect(mockTriliumClient.get).toHaveBeenCalledWith(
        'notes?search=%23label+%23tag+search&limit=10'
      );
    });
  });

  describe('edge cases', () => {
    test('should handle very large result sets', async () => {
      // Create mock response with many notes
      const mockResponse = {
        results: Array.from({ length: 50 }, (_, i) => ({
          noteId: `note${i}`,
          title: `Note ${i}`,
          type: 'text',
          dateModified: '2024-01-15T14:30:00.000Z'
        }))
      };

      mockTriliumClient.get.mockResolvedValue(mockResponse);

      const result = await searchNotes(mockTriliumClient, {
        query: 'test',
        limit: 50
      });

      expect(result.content[0].text).toBe('Found 50 notes for "test" (showing first 50)');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.totalResults).toBe(50);
      expect(jsonData.hasMore).toBe(true);
      expect(jsonData.notes).toHaveLength(50);
      // Check first and last notes
      expect(jsonData.notes[0].title).toBe('Note 0');
      expect(jsonData.notes[49].title).toBe('Note 49');
    });

    test('should handle notes with very long titles', async () => {
      const longTitle = 'A'.repeat(200);
      const mockResponse = {
        results: [
          {
            noteId: 'note123',
            title: longTitle,
            type: 'text'
          }
        ]
      };

      mockTriliumClient.get.mockResolvedValue(mockResponse);

      const result = await searchNotes(mockTriliumClient, {
        query: 'test',
        limit: 10
      });

      expect(result.content[0].text).toBe('Found 1 note for "test"');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.notes[0].title).toBe(longTitle);
    });

    test('should handle Unicode characters in search query and results', async () => {
      const mockResponse = {
        results: [
          {
            noteId: 'note123',
            title: '日本語のノート 🌸',
            type: 'text'
          }
        ]
      };

      mockTriliumClient.get.mockResolvedValue(mockResponse);

      const result = await searchNotes(mockTriliumClient, {
        query: '日本語 emoji 🌸',
        limit: 10
      });

      expect(mockTriliumClient.get).toHaveBeenCalledWith(
        'notes?search=%E6%97%A5%E6%9C%AC%E8%AA%9E+emoji+%F0%9F%8C%B8&limit=10'
      );
      expect(result.content[0].text).toBe('Found 1 note for "日本語 emoji 🌸"');
      
      const jsonData = JSON.parse(result.content[1].text);
      expect(jsonData.notes[0].title).toBe('日本語のノート 🌸');
    });
  });

  describe('validation errors', () => {
    test('rejects invalid orderDirection', async () => {
      const result = await searchNotes(mockTriliumClient, {
        query: 'x', orderDirection: 'upside-down'
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Validation error/);
      expect(mockTriliumClient.get).not.toHaveBeenCalled();
    });
  });
});