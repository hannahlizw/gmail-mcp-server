# Gmail MCP Server

A local MCP server that connects Claude Code to your Gmail account for reading, searching, drafting, and managing emails.

## Features

- **Read & Search**: List emails, search with Gmail's powerful query syntax
- **Draft Responses**: Create drafts that open directly in Gmail for editing/sending
- **Label Management**: List, create, and apply labels to messages
- **Filter Management**: Create filters to automatically organize incoming mail
- **Smart Workflows**: Find priority emails, identify newsletters, daily summaries

## Installation

### 1. Clone and Build

```bash
cd ~/Projects/emailbot  # or wherever you cloned this
npm install
npm run build
```

### 2. Set Up Google Cloud Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable the **Gmail API**:
   - Search for "Gmail API" and click Enable
4. Configure **OAuth consent screen**:
   - Choose "External" user type
   - Fill in app name (e.g., "Gmail MCP") and your email
   - Add your email as a test user
5. Create **OAuth 2.0 credentials**:
   - Go to Credentials → Create Credentials → OAuth 2.0 Client ID
   - Choose "Desktop application"
   - Download the JSON file
6. Save as `~/.gmail-mcp/credentials.json`

Or run the setup wizard:
```bash
npm run setup
```

### 3. Add to Claude Code

Add to your Claude Code MCP configuration:

```bash
claude mcp add --transport stdio gmail -- node /path/to/emailbot/build/index.js
```

Or add manually to `~/.claude/settings.local.json`:

```json
{
  "mcpServers": {
    "gmail": {
      "command": "node",
      "args": ["/absolute/path/to/emailbot/build/index.js"]
    }
  }
}
```

### 4. Authenticate

In Claude Code, run:
```
Use gmail_auth_status to check authentication
```

Follow the prompts to complete OAuth.

## Available Tools

### Authentication
- `gmail_auth_status` - Check auth status, get setup instructions
- `gmail_authenticate` - Start OAuth flow
- `gmail_complete_auth` - Complete OAuth with code

### Email Reading
- `gmail_list_emails` - List recent emails with optional query
- `gmail_get_email` - Get full email content by ID
- `gmail_search` - Search with Gmail query syntax

### Drafts
- `gmail_create_draft` - Create draft (returns Gmail link)
- `gmail_list_drafts` - List current drafts

### Labels
- `gmail_list_labels` - List all labels with counts
- `gmail_create_label` - Create new label
- `gmail_modify_labels` - Add/remove labels from emails

### Filters
- `gmail_list_filters` - List all filters
- `gmail_create_filter` - Create auto-filter
- `gmail_delete_filter` - Delete filter

### Utilities
- `gmail_mark_read` - Mark email as read
- `gmail_mark_unread` - Mark email as unread

### Smart Workflows
- `gmail_get_priority_emails` - Get emails needing response
- `gmail_find_newsletters` - Find newsletter senders
- `gmail_find_unsubscribe_candidates` - Find unsubscribe opportunities
- `gmail_daily_summary` - Daily inbox summary

## Example Workflows

### Get Priority Emails to Respond To
```
Show me priority emails I need to respond to
```

### Draft a Response
```
Read email ID abc123 and draft a response accepting their meeting request
```

### Set Up Newsletter Filter
```
Find newsletters in my inbox, then create a filter for [sender]
that adds the "Newsletter" label and marks as read
```

### Daily Summary
```
Give me my daily email summary
```

## Gmail Search Syntax

The server supports Gmail's full search syntax:
- `is:unread` - Unread emails
- `from:sender@example.com` - From specific sender
- `to:me` - Sent directly to you
- `subject:keyword` - Subject contains keyword
- `has:attachment` - Has attachments
- `older_than:7d` - Older than 7 days
- `newer_than:1d` - From last 24 hours
- `-category:promotions` - Exclude promotions

## Security Notes

- Credentials stored in `~/.gmail-mcp/credentials.json`
- OAuth tokens stored in `~/.gmail-mcp/token.json`
- **Never commit these files to git**
- Server only creates drafts, never sends automatically
- All sends require manual action in Gmail UI

## Troubleshooting

### "Not authenticated" errors
Run `gmail_auth_status` and follow setup instructions.

### OAuth callback fails
Make sure no other process is using port 3000.

### Token expired
Delete `~/.gmail-mcp/token.json` and re-authenticate.

## License

MIT
