# MCP Server Data Formatting Best Practices - Research Summary

## Research Overview
Research conducted to understand best practices for MCP server data formatting, specifically addressing concerns about information loss when transforming raw API responses into markdown format.

## Key Findings from Industry Sources

### 1. Data Transformation Philosophy (Towards Data Science)

**Key Insight**: Simply dumping raw, complex API data directly into MCP tools is **ineffective**.

**Problems with Raw Data Approach**:
- Overwhelming AI agents with unprocessed information
- Complex nested structures reduce comprehension
- Stack traces, error frames, and extensive metadata create noise
- Raw API responses often contain irrelevant implementation details

**Recommended Approach**: 
- **Curate and simplify data** to enhance agent comprehension
- Transform raw data to be more **digestible for AI agents**
- Create **focused, readable representations** that preserve essential context
- Balance detail with usability

### 2. Response Structure Standards (MCP Development Guide)

**Core Requirements**:
- All responses must follow **JSON-RPC 2.0** standard
- Maintain clear, consistent message structures
- Include meaningful error details and metadata
- Use predictable, informative response patterns

**Structure Example**:
```json
{
  "jsonrpc": "2.0",
  "id": 123,
  "result": { 
    "output": "Processed successfully",
    "metadata": { "timestamp": "2024-05-15" }
  }
}
```

### 3. Performance and Context Optimization

**Critical Performance Issues**:
- Verbose tool definitions add **hundreds of tokens** to model context
- Increases latency and reduces model performance
- Many servers return **entire data objects** when only few fields are relevant
- Bloated responses create decision paralysis for AI models

**Optimization Strategies**:
- Use `allowed_tools` parameter to limit exposed endpoints
- Return only **relevant fields** for the specific use case
- Implement **focused response handlers** that adapt to different scenarios
- Reduce token overhead through selective data exposure

## Analysis of Current Implementation Issues

### Current TriliumNext MCP Server Problems

1. **Information Loss Through Markdown Transformation**:
   - Converting structured API responses to markdown removes machine-readable structure
   - Nested data becomes flattened text
   - Original field types and relationships are lost
   - Difficult for other tools to process formatted responses

2. **Overly Verbose Formatting**:
   - Excessive emoji usage (🔍, ✅, ❌, 📄, etc.)
   - Lengthy descriptive text that inflates token count
   - Human-readable format optimized for display, not AI consumption
   - Information that's useful for debugging mixed with user-facing content

3. **Loss of Structured Data**:
   - API returns structured JSON with specific fields
   - Markdown conversion loses data types, arrays, nested objects
   - Makes it impossible to chain tool outputs effectively
   - Reduces composability with other MCP tools

## Recommended Best Practices for TriliumNext MCP Server

### 1. Preserve Structured Data
```json
// GOOD: Preserve structure for further processing
{
  "content": [
    {
      "type": "text", 
      "text": "Found 3 notes matching your query"
    },
    {
      "type": "application/json",
      "data": {
        "query": "javascript programming",
        "results": [
          {
            "noteId": "abc123",
            "title": "JavaScript Programming",
            "type": "text",
            "dateModified": "2024-01-15T14:30:00.000Z"
          }
        ],
        "count": 3,
        "hasMore": false
      }
    }
  ]
}
```

### 2. Hybrid Approach - Human + Machine Readable
```json
// BETTER: Provide both human summary and structured data
{
  "content": [
    {
      "type": "text",
      "text": "Found 3 notes matching 'javascript programming'"
    },
    {
      "type": "application/json", 
      "text": JSON.stringify({
        "summary": {
          "query": "javascript programming",
          "totalResults": 3,
          "hasMore": false
        },
        "notes": [
          {
            "noteId": "abc123",
            "title": "JavaScript Programming", 
            "type": "text",
            "excerpt": "Introduction to JS concepts...",
            "lastModified": "2024-01-15T14:30:00.000Z",
            "url": "trilium://note/abc123"
          }
        ]
      }, null, 2)
    }
  ]
}
```

### 3. Minimize Visual Noise
```json
// AVOID: Excessive formatting
"✅ **Note created successfully!**\n\n**Note ID:** abc123\n**Title:** My Note\n..."

// PREFER: Clean, structured information
"Note created: 'My Note' (ID: abc123)"
```

## Implementation Recommendations

### 1. Multi-Format Response Strategy
- **Summary**: Brief human-readable status
- **Structured Data**: Full API response preserved as JSON
- **Metadata**: Query parameters, execution time, pagination info

### 2. Content Type Standards
- Use `application/json` type for structured data
- Use `text/plain` for simple status messages  
- Use `text/markdown` only when rich formatting adds value

### 3. Error Handling Best Practices
```json
{
  "content": [
    {
      "type": "text",
      "text": "Search failed: Authentication error"
    },
    {
      "type": "application/json",
      "text": JSON.stringify({
        "error": {
          "type": "AuthenticationError",
          "status": 401,
          "message": "Invalid auth token",
          "retryable": true
        },
        "context": {
          "query": "javascript",
          "timestamp": "2024-01-15T14:30:00.000Z"
        }
      }, null, 2)
    }
  ],
  "isError": true
}
```

## Conclusion

The research clearly indicates that **raw data preservation with intelligent curation** is the optimal approach for MCP servers. The current markdown-heavy formatting:

1. **Loses critical structural information** that could be used by other tools
2. **Inflates token usage** with unnecessary formatting
3. **Reduces composability** with other MCP servers
4. **Optimizes for human reading** rather than AI agent consumption

**Recommendation**: Redesign the TriliumNext MCP server to return both human-readable summaries AND preserved structured data, allowing for better tool chaining and information preservation while maintaining usability.