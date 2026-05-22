export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const validators = {
  noteId: (noteId) => {
    if (!noteId || typeof noteId !== 'string') {
      throw new ValidationError('Note ID must be a non-empty string');
    }
    if (noteId.trim().length === 0) {
      throw new ValidationError('Note ID cannot be empty');
    }
    return noteId.trim();
  },

  title: (title) => {
    if (!title || typeof title !== 'string') {
      throw new ValidationError('Title must be a non-empty string');
    }
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Title cannot be empty');
    }
    if (trimmed.length > 200) {
      throw new ValidationError('Title cannot exceed 200 characters');
    }
    return trimmed;
  },

  content: (content) => {
    if (content === null || content === undefined) {
      throw new ValidationError('Content cannot be null or undefined');
    }
    if (typeof content !== 'string') {
      throw new ValidationError('Content must be a string');
    }
    if (content.length > 1000000) { // 1MB limit
      throw new ValidationError('Content cannot exceed 1MB');
    }
    return content;
  },

  noteType: (type) => {
    const validTypes = ['text', 'code', 'file', 'image', 'search', 'book', 'relationMap', 'canvas'];
    if (type && !validTypes.includes(type)) {
      throw new ValidationError(`Note type must be one of: ${validTypes.join(', ')}`);
    }
    return type || 'text';
  },

  searchQuery: (query) => {
    if (!query || typeof query !== 'string') {
      throw new ValidationError('Search query must be a non-empty string');
    }
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Search query cannot be empty');
    }
    if (trimmed.length > 500) {
      throw new ValidationError('Search query cannot exceed 500 characters');
    }
    return trimmed;
  },

  attributeId: (id) => {
    if (!id || typeof id !== 'string') {
      throw new ValidationError('Attribute ID must be a non-empty string');
    }
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Attribute ID cannot be empty');
    }
    return trimmed;
  },

  attributeType: (type) => {
    if (type !== 'label' && type !== 'relation') {
      throw new ValidationError("Attribute type must be 'label' or 'relation'");
    }
    return type;
  },

  attributeName: (name) => {
    if (!name || typeof name !== 'string') {
      throw new ValidationError('Attribute name must be a non-empty string');
    }
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Attribute name cannot be empty');
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      throw new ValidationError('Attribute name can only contain letters, digits, and underscores');
    }
    return trimmed;
  },

  branchId: (id) => {
    if (!id || typeof id !== 'string') {
      throw new ValidationError('Branch ID must be a non-empty string');
    }
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Branch ID cannot be empty');
    }
    return trimmed;
  },

  limit: (limit) => {
    if (limit === undefined || limit === null) {
      return 10; // default
    }
    const num = parseInt(limit, 10);
    if (isNaN(num) || num < 1) {
      throw new ValidationError('Limit must be a positive integer');
    }
    if (num > 100) {
      throw new ValidationError('Limit cannot exceed 100');
    }
    return num;
  }
};