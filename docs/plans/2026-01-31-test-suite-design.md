# Gmail MCP Server Test Suite Design

**Date:** 2026-01-31
**Approach:** Unit tests with mocks
**Framework:** Vitest
**Scope:** Gmail client methods + MCP tool handlers

---

## Structure

```
src/
  __tests__/
    gmail-client.test.ts   # GmailApiClient tests
    tools.test.ts          # MCP tool handler tests
    mocks/
      gmail-api.ts         # Mock Gmail API responses
```

## Dependencies

- `vitest` - Test runner
- `@vitest/coverage-v8` - Coverage reporting (optional)

## Configuration

**`vitest.config.ts`:**
- ESM mode to match project
- TypeScript support via esbuild
- Test files: `src/**/*.test.ts`

**Package.json scripts:**
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

## Mock Strategy

- Mock `googleapis` module at module level with `vi.mock()`
- Factory functions return mock Gmail API responses
- Tests customize responses via `mockResolvedValueOnce()`

---

## Gmail Client Tests (`gmail-client.test.ts`)

### Message Parsing
- `getMessage()` - Extracts headers (from, to, subject, date) correctly
- `getMessage()` - Decodes base64 body content
- `getMessage()` - Handles multipart messages (finds plain text part)
- `getMessage()` - Strips HTML when only HTML body available
- `listMessages()` - Returns array of parsed messages
- `searchMessages()` - Passes query to API correctly

### Draft Creation
- `createDraft()` - Encodes message as base64url
- `createDraft()` - Includes proper headers (To, Subject, Content-Type)
- `createDraft()` - Adds In-Reply-To/References for replies
- `createDraft()` - Returns draft ID and web link

### Label/Filter Management
- `listLabels()` - Separates system vs user labels
- `createLabel()` - Sends correct request body
- `modifyMessageLabels()` - Adds and removes specified labels
- `listFilters()` - Parses criteria and actions
- `createFilter()` - Sends criteria/action to API

### Utilities
- `markAsRead()` - Removes UNREAD label
- `markAsUnread()` - Adds UNREAD label
- `getProfile()` - Returns email and message count

---

## MCP Tool Handler Tests (`tools.test.ts`)

### Authentication Tools
- `gmail_auth_status` - Returns setup instructions when not authenticated
- `gmail_auth_status` - Returns profile info when authenticated
- `gmail_authenticate` - Returns auth URL
- `gmail_complete_auth` - Saves token and returns success

### Email Reading Tools
- `gmail_list_emails` - Returns formatted email summaries
- `gmail_list_emails` - Handles empty results gracefully
- `gmail_get_email` - Returns full email content with body
- `gmail_search` - Passes query through, formats results

### Draft Tools
- `gmail_create_draft` - Returns draft ID and Gmail link
- `gmail_create_draft` - Handles reply threading
- `gmail_list_drafts` - Returns formatted draft list

### Workflow Tools
- `gmail_get_priority_emails` - Uses correct exclusion query
- `gmail_find_newsletters` - Groups results by sender
- `gmail_daily_summary` - Combines label counts and email lists

### Error Handling
- All tools return "Not authenticated" when client is null
- All tools catch and format API errors gracefully

---

## Mock Data Examples

```typescript
// Sample email message from API
export const mockMessage = {
  id: "msg123",
  threadId: "thread456",
  labelIds: ["INBOX", "UNREAD"],
  snippet: "Hey, just wanted to follow up...",
  payload: {
    headers: [
      { name: "From", value: "alice@example.com" },
      { name: "To", value: "bob@example.com" },
      { name: "Subject", value: "Quick question" },
      { name: "Date", value: "Fri, 31 Jan 2025 10:00:00 -0500" }
    ],
    mimeType: "text/plain",
    body: { data: "SGVsbG8gV29ybGQ=" } // "Hello World" base64
  }
};

export const mockLabel = {
  id: "Label_1",
  name: "Work",
  type: "user",
  messagesTotal: 42,
  messagesUnread: 5
};

export const mockDraft = {
  id: "draft789",
  message: { id: "msg789" }
};

export const mockFilter = {
  id: "filter123",
  criteria: { from: "newsletter@example.com" },
  action: { addLabelIds: ["Label_1"], removeLabelIds: ["UNREAD"] }
};
```

---

## Expected Coverage

- ~25-30 tests total
- Gmail client: ~15 tests
- MCP tools: ~12 tests
- Focus on business logic, not Google API internals
