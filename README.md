# MCP TriliumNext Server

A Model Context Protocol (MCP) server for integrating with TriliumNext, a hierarchical note-taking application.

## 🚀 Features

### 🛠️ Tools
- **`create_note`**: Create new notes with validation and support for all note types
- **`search_notes`**: Search through notes with query validation and result formatting
- **`get_note`**: Retrieve complete note details including metadata and content
- **`update_note`**: Update note content with proper error handling

### 📋 Resources
- **`trilium://recent-notes`**: Access to your 10 most recently modified notes in JSON format

### 🔒 Security & Validation
- Comprehensive input validation for all parameters
- Secure authentication token handling
- Error handling with user-friendly messages
- Request timeout and retry logic

## 📦 Installation

1. **Clone or download this repository**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your TriliumNext configuration
   ```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file or set these environment variables:

```bash
# Required
TRILIUM_URL=http://localhost:8080          # Your TriliumNext server URL
TRILIUM_AUTH_TOKEN=your_auth_token_here    # Your TriliumNext auth token

# Optional
LOG_LEVEL=info                             # Logging level (error, warn, info, debug)
REQUEST_TIMEOUT=30000                      # Request timeout in milliseconds
```

### Getting Your Auth Token

1. **Open TriliumNext in your browser** (usually `http://localhost:8080`)
2. **Go to Options → ETAPI** (or look for API tokens section)
3. **Create a new token:**
   - Click "Create new token" or "+" button
   - Give it a descriptive name (e.g., "MCP Server")
   - Copy the generated token
4. **Set the token in your environment:**
   ```bash
   export TRILIUM_AUTH_TOKEN="your_copied_token_here"
   ```

## 🎯 Usage

### Standalone Server

```bash
# Start the server
npm start

# Development mode with auto-reload
npm run dev
```

### Claude Desktop Integration

Add this configuration to your Claude Desktop MCP settings:

```json
{
  "mcpServers": {
    "triliumnext": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-triliumnext/src/index.js"],
      "env": {
        "TRILIUM_URL": "http://localhost:8080",
        "TRILIUM_AUTH_TOKEN": "your_auth_token_here"
      }
    }
  }
}
```

### MCP Inspector Testing

Test your server interactively:

```bash
npx @modelcontextprotocol/inspector node src/index.js
```

This opens a web interface where you can test all tools and resources.

## 🛠️ Tool Reference

### create_note

Create a new note in TriliumNext.

**Parameters:**
- `title` (required): Note title (max 200 characters)
- `content` (required): Note content (max 1MB)
- `type` (optional): Note type - one of: `text`, `code`, `file`, `image`, `search`, `book`, `relationMap`, `canvas` (default: `text`)
- `parentNoteId` (optional): ID of parent note

**Example:**
```json
{
  "title": "My New Note",
  "content": "This is the content of my note.",
  "type": "text"
}
```

### search_notes

Search for notes using TriliumNext's search capabilities.

**Parameters:**
- `query` (required): Search query (max 500 characters)
- `limit` (optional): Maximum results to return (1-100, default: 10)

**Example:**
```json
{
  "query": "javascript programming",
  "limit": 5
}
```

### get_note

Retrieve detailed information about a specific note.

**Parameters:**
- `noteId` (required): The ID of the note to retrieve

**Example:**
```json
{
  "noteId": "abc123def456"
}
```

### update_note

Update the content of an existing note.

**Parameters:**
- `noteId` (required): The ID of the note to update
- `content` (required): New content for the note (max 1MB)

**Example:**
```json
{
  "noteId": "abc123def456",
  "content": "Updated content for the note."
}
```

## 📋 Resource Reference

### trilium://recent-notes

Returns a JSON object containing your 10 most recently modified notes with metadata.

**Response format:**
```json
{
  "notes": [
    {
      "noteId": "abc123",
      "title": "Note Title",
      "type": "text",
      "dateCreated": "2024-01-01T00:00:00.000Z",
      "dateModified": "2024-01-01T12:00:00.000Z",
      "parentNoteId": "parent123",
      "isProtected": false,
      "contentLength": 1024,
      "attributes": []
    }
  ],
  "timestamp": "2024-01-01T12:00:00.000Z",
  "count": 10,
  "description": "Recently modified notes from TriliumNext"
}
```

## 🔧 Development

### Project Structure

```
mcp-triliumnext/
├── src/
│   ├── index.js              # Main server implementation
│   ├── tools/                # Tool implementations
│   │   ├── create-note.js
│   │   ├── search-notes.js
│   │   ├── get-note.js
│   │   └── update-note.js
│   ├── resources/            # Resource handlers
│   │   └── recent-notes.js
│   └── utils/                # Utility modules
│       ├── logger.js         # Logging functionality
│       ├── validation.js     # Input validation
│       └── trilium-client.js # TriliumNext API client
├── docs/                     # Documentation
├── package.json
├── .env.example
└── README.md
```

### Error Handling

The server implements comprehensive error handling:

- **Validation errors**: Input parameter validation with helpful messages
- **API errors**: TriliumNext API error handling with status codes
- **Network errors**: Timeout and connection error handling
- **Authentication errors**: Clear messages for auth failures

### Logging

Configurable logging levels:
- `error`: Only error messages
- `warn`: Warnings and errors
- `info`: General information (default)
- `debug`: Detailed debugging information

Set via `LOG_LEVEL` environment variable.

## 🔍 Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Check your `TRILIUM_AUTH_TOKEN` is correct
   - Verify the token hasn't expired
   - Ensure TriliumNext is running and accessible

2. **Connection Refused**
   - Verify `TRILIUM_URL` is correct
   - Check TriliumNext is running on the specified port
   - Test connectivity: `curl http://localhost:8080/etapi/notes`

3. **Note Not Found**
   - Verify the note ID exists
   - Check you have permission to access the note
   - Note might be in a protected subtree

4. **Validation Errors**
   - Check parameter types and lengths
   - Ensure required fields are provided
   - Verify note types are supported

### Debug Mode

Enable debug logging for detailed information:

```bash
LOG_LEVEL=debug npm start
```

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📚 Related Links

- [TriliumNext Documentation](https://github.com/TriliumNext/Notes)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Claude Desktop MCP Guide](https://docs.anthropic.com/claude/docs/model-context-protocol)