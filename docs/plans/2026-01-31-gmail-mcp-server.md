# Gmail MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local Gmail MCP server that provides email management tools for reading, searching, drafting, filtering, and summarizing emails.

**Architecture:** TypeScript-based stdio MCP server using `@modelcontextprotocol/sdk` with Gmail API via `googleapis`. OAuth2 credentials stored locally. Safety-first design with drafts over direct sends.

**Tech Stack:** TypeScript, Node.js, @modelcontextprotocol/sdk, googleapis, zod, OAuth2

---

## Phase 1: Project Foundation

### Task 1: Initialize Project Structure

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts` (placeholder)
- Create: `.gitignore`

**Step 1: Initialize npm project**

Run: `npm init -y`

**Step 2: Update package.json with required configuration**

```json
{
  "name": "gmail-mcp-server",
  "version": "1.0.0",
  "description": "Gmail MCP server for Claude Code",
  "type": "module",
  "main": "build/index.js",
  "bin": {
    "gmail-mcp": "./build/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node build/index.js",
    "dev": "tsc --watch"
  },
  "keywords": ["mcp", "gmail", "claude"],
  "license": "MIT"
}
```

**Step 3: Install dependencies**

Run: `npm install @modelcontextprotocol/sdk googleapis zod`
Run: `npm install -D @types/node typescript`

**Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "build"]
}
```

**Step 5: Create .gitignore**

```
node_modules/
build/
credentials.json
token.json
.env
*.log
```

**Step 6: Create src directory and placeholder index.ts**

```typescript
#!/usr/bin/env node
// Gmail MCP Server - Entry Point
console.error("Gmail MCP Server starting...");
```

**Step 7: Verify build works**

Run: `npm run build`
Expected: No errors, `build/index.js` created

**Step 8: Commit**

```bash
git init
git add package.json tsconfig.json .gitignore src/index.ts
git commit -m "chore: initialize gmail-mcp-server project structure

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 2: Create Gmail Authentication Module

**Files:**
- Create: `src/auth.ts`
- Create: `src/types.ts`

**Step 1: Create types.ts with shared types**

```typescript
// src/types.ts
import { gmail_v1 } from "googleapis";

export type GmailClient = gmail_v1.Gmail;

export interface TokenInfo {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  body?: string;
  labels: string[];
  isUnread: boolean;
}

export interface EmailDraft {
  id: string;
  message: {
    to: string;
    subject: string;
    body: string;
  };
}

export interface GmailLabel {
  id: string;
  name: string;
  type: "system" | "user";
  messagesTotal?: number;
  messagesUnread?: number;
}

export interface GmailFilter {
  id?: string;
  criteria: {
    from?: string;
    to?: string;
    subject?: string;
    query?: string;
  };
  action: {
    addLabelIds?: string[];
    removeLabelIds?: string[];
    forward?: string;
  };
}
```

**Step 2: Create auth.ts with OAuth2 authentication**

```typescript
// src/auth.ts
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import * as fs from "fs/promises";
import * as path from "path";
import * as http from "http";
import { URL } from "url";

// Gmail API scopes needed for our operations
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",      // Read emails
  "https://www.googleapis.com/auth/gmail.compose",       // Create drafts
  "https://www.googleapis.com/auth/gmail.modify",        // Modify labels
  "https://www.googleapis.com/auth/gmail.settings.basic" // Read/create filters
];

const TOKEN_PATH = path.join(process.env.HOME || "~", ".gmail-mcp", "token.json");
const CREDENTIALS_PATH = path.join(process.env.HOME || "~", ".gmail-mcp", "credentials.json");

export async function ensureConfigDir(): Promise<void> {
  const configDir = path.dirname(TOKEN_PATH);
  try {
    await fs.mkdir(configDir, { recursive: true });
  } catch (err) {
    // Directory exists
  }
}

export async function loadCredentials(): Promise<{
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
} | null> {
  try {
    const content = await fs.readFile(CREDENTIALS_PATH, "utf-8");
    const credentials = JSON.parse(content);
    return credentials.installed || credentials.web;
  } catch (err) {
    return null;
  }
}

export async function loadToken(): Promise<{
  access_token: string;
  refresh_token: string;
  expiry_date: number;
} | null> {
  try {
    const content = await fs.readFile(TOKEN_PATH, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

export async function saveToken(token: object): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(TOKEN_PATH, JSON.stringify(token, null, 2));
}

export async function getAuthenticatedClient(): Promise<OAuth2Client | null> {
  const credentials = await loadCredentials();
  if (!credentials) {
    console.error("No credentials.json found at:", CREDENTIALS_PATH);
    console.error("Please download OAuth credentials from Google Cloud Console");
    console.error("and save them to:", CREDENTIALS_PATH);
    return null;
  }

  const { client_id, client_secret, redirect_uris } = credentials;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0] || "http://localhost:3000/oauth2callback"
  );

  const token = await loadToken();
  if (token) {
    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  return null;
}

export async function initiateOAuthFlow(): Promise<string> {
  const credentials = await loadCredentials();
  if (!credentials) {
    throw new Error(`No credentials.json found at ${CREDENTIALS_PATH}`);
  }

  const { client_id, client_secret } = credentials;
  const redirectUri = "http://localhost:3000/oauth2callback";

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirectUri
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent"
  });

  return authUrl;
}

export async function completeOAuthFlow(code: string): Promise<OAuth2Client> {
  const credentials = await loadCredentials();
  if (!credentials) {
    throw new Error(`No credentials.json found at ${CREDENTIALS_PATH}`);
  }

  const { client_id, client_secret } = credentials;
  const redirectUri = "http://localhost:3000/oauth2callback";

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirectUri
  );

  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  await saveToken(tokens);

  return oAuth2Client;
}

export function getCredentialsPath(): string {
  return CREDENTIALS_PATH;
}

export function getTokenPath(): string {
  return TOKEN_PATH;
}
```

**Step 3: Verify types compile**

Run: `npm run build`
Expected: No errors

**Step 4: Commit**

```bash
git add src/types.ts src/auth.ts
git commit -m "feat: add Gmail authentication module with OAuth2 support

- Define shared types for emails, drafts, labels, filters
- Implement OAuth2 flow with token persistence
- Store credentials in ~/.gmail-mcp/

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 3: Create Gmail API Client Module

**Files:**
- Create: `src/gmail-client.ts`

**Step 1: Create gmail-client.ts with API wrapper functions**

```typescript
// src/gmail-client.ts
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { EmailMessage, EmailDraft, GmailLabel, GmailFilter } from "./types.js";

export class GmailApiClient {
  private gmail;

  constructor(auth: OAuth2Client) {
    this.gmail = google.gmail({ version: "v1", auth });
  }

  // === EMAIL READING ===

  async listMessages(options: {
    maxResults?: number;
    query?: string;
    labelIds?: string[];
  } = {}): Promise<EmailMessage[]> {
    const { maxResults = 20, query, labelIds } = options;

    const response = await this.gmail.users.messages.list({
      userId: "me",
      maxResults,
      q: query,
      labelIds
    });

    const messages = response.data.messages || [];
    const detailed = await Promise.all(
      messages.map(msg => this.getMessage(msg.id!))
    );

    return detailed.filter((m): m is EmailMessage => m !== null);
  }

  async getMessage(messageId: string): Promise<EmailMessage | null> {
    try {
      const response = await this.gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full"
      });

      const msg = response.data;
      const headers = msg.payload?.headers || [];

      const getHeader = (name: string): string => {
        const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
        return header?.value || "";
      };

      const body = this.extractBody(msg.payload);

      return {
        id: msg.id || "",
        threadId: msg.threadId || "",
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        snippet: msg.snippet || "",
        body,
        labels: msg.labelIds || [],
        isUnread: (msg.labelIds || []).includes("UNREAD")
      };
    } catch (err) {
      console.error(`Failed to get message ${messageId}:`, err);
      return null;
    }
  }

  private extractBody(payload: any): string {
    if (!payload) return "";

    // Check for plain text body
    if (payload.mimeType === "text/plain" && payload.body?.data) {
      return Buffer.from(payload.body.data, "base64").toString("utf-8");
    }

    // Check for HTML body (fallback)
    if (payload.mimeType === "text/html" && payload.body?.data) {
      const html = Buffer.from(payload.body.data, "base64").toString("utf-8");
      // Simple HTML stripping
      return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    }

    // Check parts for multipart messages
    if (payload.parts) {
      for (const part of payload.parts) {
        const body = this.extractBody(part);
        if (body) return body;
      }
    }

    return "";
  }

  async searchMessages(query: string, maxResults = 20): Promise<EmailMessage[]> {
    return this.listMessages({ query, maxResults });
  }

  // === DRAFT MANAGEMENT ===

  async createDraft(options: {
    to: string;
    subject: string;
    body: string;
    inReplyTo?: string;
    threadId?: string;
  }): Promise<{ id: string; webLink: string }> {
    const { to, subject, body, inReplyTo, threadId } = options;

    const headers = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8"
    ];

    if (inReplyTo) {
      headers.push(`In-Reply-To: ${inReplyTo}`);
      headers.push(`References: ${inReplyTo}`);
    }

    const message = [...headers, "", body].join("\r\n");
    const encodedMessage = Buffer.from(message).toString("base64url");

    const response = await this.gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw: encodedMessage,
          threadId
        }
      }
    });

    const draftId = response.data.id || "";
    const messageId = response.data.message?.id || "";

    return {
      id: draftId,
      webLink: `https://mail.google.com/mail/u/0/#drafts?compose=${messageId}`
    };
  }

  async listDrafts(maxResults = 10): Promise<EmailDraft[]> {
    const response = await this.gmail.users.drafts.list({
      userId: "me",
      maxResults
    });

    const drafts: EmailDraft[] = [];
    for (const draft of response.data.drafts || []) {
      if (draft.id) {
        const detail = await this.gmail.users.drafts.get({
          userId: "me",
          id: draft.id,
          format: "full"
        });

        const headers = detail.data.message?.payload?.headers || [];
        const getHeader = (name: string): string => {
          const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
          return header?.value || "";
        };

        drafts.push({
          id: draft.id,
          message: {
            to: getHeader("To"),
            subject: getHeader("Subject"),
            body: this.extractBody(detail.data.message?.payload)
          }
        });
      }
    }

    return drafts;
  }

  // === LABEL MANAGEMENT ===

  async listLabels(): Promise<GmailLabel[]> {
    const response = await this.gmail.users.labels.list({ userId: "me" });

    const labels: GmailLabel[] = [];
    for (const label of response.data.labels || []) {
      const detail = await this.gmail.users.labels.get({
        userId: "me",
        id: label.id!
      });

      labels.push({
        id: label.id || "",
        name: label.name || "",
        type: label.type === "system" ? "system" : "user",
        messagesTotal: detail.data.messagesTotal,
        messagesUnread: detail.data.messagesUnread
      });
    }

    return labels;
  }

  async createLabel(name: string): Promise<GmailLabel> {
    const response = await this.gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show"
      }
    });

    return {
      id: response.data.id || "",
      name: response.data.name || "",
      type: "user"
    };
  }

  async modifyMessageLabels(
    messageId: string,
    addLabelIds: string[],
    removeLabelIds: string[]
  ): Promise<void> {
    await this.gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        addLabelIds,
        removeLabelIds
      }
    });
  }

  // === FILTER MANAGEMENT ===

  async listFilters(): Promise<GmailFilter[]> {
    const response = await this.gmail.users.settings.filters.list({ userId: "me" });

    return (response.data.filter || []).map(f => ({
      id: f.id,
      criteria: {
        from: f.criteria?.from,
        to: f.criteria?.to,
        subject: f.criteria?.subject,
        query: f.criteria?.query
      },
      action: {
        addLabelIds: f.action?.addLabelIds,
        removeLabelIds: f.action?.removeLabelIds,
        forward: f.action?.forward
      }
    }));
  }

  async createFilter(filter: GmailFilter): Promise<GmailFilter> {
    const response = await this.gmail.users.settings.filters.create({
      userId: "me",
      requestBody: {
        criteria: filter.criteria,
        action: filter.action
      }
    });

    return {
      id: response.data.id,
      criteria: filter.criteria,
      action: filter.action
    };
  }

  async deleteFilter(filterId: string): Promise<void> {
    await this.gmail.users.settings.filters.delete({
      userId: "me",
      id: filterId
    });
  }

  // === UTILITY METHODS ===

  async getProfile(): Promise<{ email: string; messagesTotal: number }> {
    const response = await this.gmail.users.getProfile({ userId: "me" });
    return {
      email: response.data.emailAddress || "",
      messagesTotal: response.data.messagesTotal || 0
    };
  }

  async markAsRead(messageId: string): Promise<void> {
    await this.modifyMessageLabels(messageId, [], ["UNREAD"]);
  }

  async markAsUnread(messageId: string): Promise<void> {
    await this.modifyMessageLabels(messageId, ["UNREAD"], []);
  }
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: No errors

**Step 3: Commit**

```bash
git add src/gmail-client.ts
git commit -m "feat: add Gmail API client with full email operations

- List, search, and read messages
- Create and list drafts
- Label management (list, create, modify)
- Filter management (list, create, delete)
- Utility methods for marking read/unread

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 2: MCP Server Implementation

### Task 4: Create MCP Server Core

**Files:**
- Modify: `src/index.ts`

**Step 1: Implement the MCP server with stdio transport**

```typescript
#!/usr/bin/env node
// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getAuthenticatedClient, initiateOAuthFlow, completeOAuthFlow, getCredentialsPath, getTokenPath } from "./auth.js";
import { GmailApiClient } from "./gmail-client.js";

let gmailClient: GmailApiClient | null = null;

const server = new McpServer({
  name: "gmail",
  version: "1.0.0"
});

// === AUTHENTICATION TOOLS ===

server.registerTool(
  "gmail_auth_status",
  {
    description: "Check Gmail authentication status and get setup instructions if needed",
    inputSchema: {}
  },
  async () => {
    const auth = await getAuthenticatedClient();
    if (auth) {
      gmailClient = new GmailApiClient(auth);
      const profile = await gmailClient.getProfile();
      return {
        content: [{
          type: "text",
          text: `Authenticated as: ${profile.email}\nTotal messages: ${profile.messagesTotal}`
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: `Not authenticated. To set up Gmail access:

1. Go to Google Cloud Console: https://console.cloud.google.com/
2. Create a new project or select existing
3. Enable the Gmail API
4. Configure OAuth consent screen (External, add your email as test user)
5. Create OAuth 2.0 Client ID (Desktop application)
6. Download the JSON and save to: ${getCredentialsPath()}
7. Use the gmail_authenticate tool to complete setup`
      }]
    };
  }
);

server.registerTool(
  "gmail_authenticate",
  {
    description: "Start OAuth authentication flow. Returns a URL to visit for authorization.",
    inputSchema: {}
  },
  async () => {
    try {
      const authUrl = await initiateOAuthFlow();
      return {
        content: [{
          type: "text",
          text: `Please visit this URL to authorize Gmail access:\n\n${authUrl}\n\nAfter authorizing, you'll be redirected to a page with a code. Use gmail_complete_auth with that code.`
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Failed to start authentication: ${err instanceof Error ? err.message : String(err)}`
        }]
      };
    }
  }
);

server.registerTool(
  "gmail_complete_auth",
  {
    description: "Complete OAuth flow with the authorization code from Google",
    inputSchema: {
      code: z.string().describe("The authorization code from Google's OAuth redirect")
    }
  },
  async ({ code }) => {
    try {
      const auth = await completeOAuthFlow(code);
      gmailClient = new GmailApiClient(auth);
      const profile = await gmailClient.getProfile();
      return {
        content: [{
          type: "text",
          text: `Successfully authenticated as: ${profile.email}\nToken saved to: ${getTokenPath()}`
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Failed to complete authentication: ${err instanceof Error ? err.message : String(err)}`
        }]
      };
    }
  }
);

// === EMAIL READING TOOLS ===

server.registerTool(
  "gmail_list_emails",
  {
    description: "List recent emails. Use query for Gmail search syntax (e.g., 'is:unread', 'from:someone@example.com', 'label:important').",
    inputSchema: {
      query: z.string().optional().describe("Gmail search query"),
      maxResults: z.number().min(1).max(50).default(20).describe("Maximum number of emails to return")
    }
  },
  async ({ query, maxResults }) => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    try {
      const messages = await gmailClient.listMessages({ query, maxResults });

      if (messages.length === 0) {
        return { content: [{ type: "text", text: "No emails found matching your criteria." }] };
      }

      const summary = messages.map(m =>
        `ID: ${m.id}\nFrom: ${m.from}\nSubject: ${m.subject}\nDate: ${m.date}\nUnread: ${m.isUnread}\nSnippet: ${m.snippet}\n---`
      ).join("\n");

      return { content: [{ type: "text", text: summary }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed to list emails: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "gmail_get_email",
  {
    description: "Get full content of a specific email by ID",
    inputSchema: {
      messageId: z.string().describe("The email message ID")
    }
  },
  async ({ messageId }) => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    try {
      const message = await gmailClient.getMessage(messageId);
      if (!message) {
        return { content: [{ type: "text", text: "Email not found." }] };
      }

      const content = `From: ${message.from}
To: ${message.to}
Subject: ${message.subject}
Date: ${message.date}
Labels: ${message.labels.join(", ")}
Unread: ${message.isUnread}

--- Body ---
${message.body || "(No body content)"}`;

      return { content: [{ type: "text", text: content }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed to get email: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "gmail_search",
  {
    description: "Search emails using Gmail's powerful search syntax. Examples: 'from:newsletter', 'is:unread is:important', 'subject:invoice older_than:7d'",
    inputSchema: {
      query: z.string().describe("Gmail search query"),
      maxResults: z.number().min(1).max(50).default(20).describe("Maximum results")
    }
  },
  async ({ query, maxResults }) => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    try {
      const messages = await gmailClient.searchMessages(query, maxResults);

      if (messages.length === 0) {
        return { content: [{ type: "text", text: `No emails found for: ${query}` }] };
      }

      const summary = messages.map(m =>
        `ID: ${m.id} | From: ${m.from} | Subject: ${m.subject} | Date: ${m.date}`
      ).join("\n");

      return { content: [{ type: "text", text: `Found ${messages.length} emails:\n\n${summary}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Search failed: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

// === DRAFT TOOLS ===

server.registerTool(
  "gmail_create_draft",
  {
    description: "Create an email draft. Returns a link to open the draft in Gmail for editing and sending.",
    inputSchema: {
      to: z.string().describe("Recipient email address"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body (plain text)"),
      replyToMessageId: z.string().optional().describe("Message ID to reply to (for threading)")
    }
  },
  async ({ to, subject, body, replyToMessageId }) => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    try {
      let threadId: string | undefined;
      let inReplyTo: string | undefined;

      if (replyToMessageId) {
        const original = await gmailClient.getMessage(replyToMessageId);
        if (original) {
          threadId = original.threadId;
          inReplyTo = replyToMessageId;
        }
      }

      const draft = await gmailClient.createDraft({ to, subject, body, threadId, inReplyTo });

      return {
        content: [{
          type: "text",
          text: `Draft created successfully!\n\nDraft ID: ${draft.id}\n\nOpen in Gmail to edit and send:\n${draft.webLink}`
        }]
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed to create draft: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "gmail_list_drafts",
  {
    description: "List current email drafts",
    inputSchema: {
      maxResults: z.number().min(1).max(20).default(10).describe("Maximum drafts to return")
    }
  },
  async ({ maxResults }) => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    try {
      const drafts = await gmailClient.listDrafts(maxResults);

      if (drafts.length === 0) {
        return { content: [{ type: "text", text: "No drafts found." }] };
      }

      const summary = drafts.map(d =>
        `ID: ${d.id}\nTo: ${d.message.to}\nSubject: ${d.message.subject}\n---`
      ).join("\n");

      return { content: [{ type: "text", text: `${drafts.length} drafts:\n\n${summary}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed to list drafts: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

// === LABEL TOOLS ===

server.registerTool(
  "gmail_list_labels",
  {
    description: "List all Gmail labels with message counts",
    inputSchema: {}
  },
  async () => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    try {
      const labels = await gmailClient.listLabels();

      const userLabels = labels.filter(l => l.type === "user");
      const systemLabels = labels.filter(l => l.type === "system");

      let output = "=== System Labels ===\n";
      output += systemLabels.map(l =>
        `${l.name}: ${l.messagesTotal || 0} total, ${l.messagesUnread || 0} unread`
      ).join("\n");

      output += "\n\n=== User Labels ===\n";
      output += userLabels.length > 0
        ? userLabels.map(l => `${l.name} (ID: ${l.id}): ${l.messagesTotal || 0} total`).join("\n")
        : "(No user labels)";

      return { content: [{ type: "text", text: output }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed to list labels: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "gmail_create_label",
  {
    description: "Create a new Gmail label",
    inputSchema: {
      name: z.string().describe("Label name")
    }
  },
  async ({ name }) => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    try {
      const label = await gmailClient.createLabel(name);
      return { content: [{ type: "text", text: `Label created: "${label.name}" (ID: ${label.id})` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed to create label: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "gmail_modify_labels",
  {
    description: "Add or remove labels from an email",
    inputSchema: {
      messageId: z.string().describe("Email message ID"),
      addLabels: z.array(z.string()).optional().describe("Label IDs to add"),
      removeLabels: z.array(z.string()).optional().describe("Label IDs to remove")
    }
  },
  async ({ messageId, addLabels, removeLabels }) => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    try {
      await gmailClient.modifyMessageLabels(messageId, addLabels || [], removeLabels || []);
      return { content: [{ type: "text", text: "Labels updated successfully." }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed to modify labels: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

// === FILTER TOOLS ===

server.registerTool(
  "gmail_list_filters",
  {
    description: "List all Gmail filters",
    inputSchema: {}
  },
  async () => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    try {
      const filters = await gmailClient.listFilters();

      if (filters.length === 0) {
        return { content: [{ type: "text", text: "No filters configured." }] };
      }

      const summary = filters.map(f => {
        const criteria = Object.entries(f.criteria)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        const actions = Object.entries(f.action)
          .filter(([, v]) => v && (Array.isArray(v) ? v.length > 0 : true))
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join(", ");
        return `ID: ${f.id}\nCriteria: ${criteria}\nActions: ${actions}\n---`;
      }).join("\n");

      return { content: [{ type: "text", text: `${filters.length} filters:\n\n${summary}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed to list filters: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "gmail_create_filter",
  {
    description: "Create a Gmail filter to automatically process incoming emails",
    inputSchema: {
      from: z.string().optional().describe("Filter emails from this sender"),
      to: z.string().optional().describe("Filter emails to this recipient"),
      subject: z.string().optional().describe("Filter emails with this subject"),
      query: z.string().optional().describe("Gmail search query for matching"),
      addLabelIds: z.array(z.string()).optional().describe("Label IDs to add to matching emails"),
      removeLabelIds: z.array(z.string()).optional().describe("Label IDs to remove (e.g., UNREAD to mark as read)")
    }
  },
  async ({ from, to, subject, query, addLabelIds, removeLabelIds }) => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    if (!from && !to && !subject && !query) {
      return { content: [{ type: "text", text: "At least one filter criteria is required (from, to, subject, or query)." }] };
    }

    try {
      const filter = await gmailClient.createFilter({
        criteria: { from, to, subject, query },
        action: { addLabelIds, removeLabelIds }
      });
      return { content: [{ type: "text", text: `Filter created successfully! ID: ${filter.id}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed to create filter: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "gmail_delete_filter",
  {
    description: "Delete a Gmail filter by ID",
    inputSchema: {
      filterId: z.string().describe("Filter ID to delete")
    }
  },
  async ({ filterId }) => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    try {
      await gmailClient.deleteFilter(filterId);
      return { content: [{ type: "text", text: `Filter ${filterId} deleted.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed to delete filter: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

// === UTILITY TOOLS ===

server.registerTool(
  "gmail_mark_read",
  {
    description: "Mark an email as read",
    inputSchema: {
      messageId: z.string().describe("Email message ID")
    }
  },
  async ({ messageId }) => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    try {
      await gmailClient.markAsRead(messageId);
      return { content: [{ type: "text", text: "Email marked as read." }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "gmail_mark_unread",
  {
    description: "Mark an email as unread",
    inputSchema: {
      messageId: z.string().describe("Email message ID")
    }
  },
  async ({ messageId }) => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    try {
      await gmailClient.markAsUnread(messageId);
      return { content: [{ type: "text", text: "Email marked as unread." }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

// === HIGH-LEVEL WORKFLOW TOOLS ===

server.registerTool(
  "gmail_get_priority_emails",
  {
    description: "Get high-priority emails that likely need a response. Searches for unread emails from real people (not newsletters/automated).",
    inputSchema: {
      maxResults: z.number().min(1).max(30).default(15).describe("Maximum emails to return")
    }
  },
  async ({ maxResults }) => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    try {
      // Search for unread emails that aren't in promotions/social/updates categories
      const query = "is:unread -category:promotions -category:social -category:updates -category:forums";
      const messages = await gmailClient.searchMessages(query, maxResults);

      if (messages.length === 0) {
        return { content: [{ type: "text", text: "No priority emails found! Inbox zero achieved." }] };
      }

      const summary = messages.map(m =>
        `ID: ${m.id}\nFrom: ${m.from}\nSubject: ${m.subject}\nDate: ${m.date}\nSnippet: ${m.snippet}\n---`
      ).join("\n");

      return { content: [{ type: "text", text: `${messages.length} priority emails:\n\n${summary}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "gmail_find_newsletters",
  {
    description: "Find potential newsletter emails for review. Helps identify subscriptions for filtering or unsubscribing.",
    inputSchema: {
      maxResults: z.number().min(1).max(50).default(30).describe("Maximum emails to scan")
    }
  },
  async ({ maxResults }) => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    try {
      // Search for emails with common newsletter patterns
      const query = "(unsubscribe OR newsletter OR \"email preferences\" OR \"manage subscriptions\") -is:sent";
      const messages = await gmailClient.searchMessages(query, maxResults);

      if (messages.length === 0) {
        return { content: [{ type: "text", text: "No obvious newsletter emails found." }] };
      }

      // Group by sender
      const bySender = new Map<string, number>();
      for (const msg of messages) {
        const from = msg.from.replace(/<.*>/, "").trim();
        bySender.set(from, (bySender.get(from) || 0) + 1);
      }

      const sorted = Array.from(bySender.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([sender, count]) => `${sender}: ${count} emails`)
        .join("\n");

      return {
        content: [{
          type: "text",
          text: `Found ${messages.length} potential newsletter emails from ${bySender.size} senders:\n\n${sorted}\n\nUse gmail_search with "from:sender@example.com" to review specific senders.`
        }]
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "gmail_find_unsubscribe_candidates",
  {
    description: "Find emails with unsubscribe links - candidates for cleaning up inbox",
    inputSchema: {
      maxResults: z.number().min(1).max(50).default(30).describe("Maximum emails to scan")
    }
  },
  async ({ maxResults }) => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    try {
      const query = "unsubscribe -is:sent";
      const messages = await gmailClient.searchMessages(query, maxResults);

      if (messages.length === 0) {
        return { content: [{ type: "text", text: "No emails with unsubscribe links found." }] };
      }

      // Group by sender and provide links
      const bySender = new Map<string, { count: number; latestId: string; subject: string }>();
      for (const msg of messages) {
        const from = msg.from;
        const existing = bySender.get(from);
        if (!existing || existing.count < msg.id.localeCompare(existing.latestId)) {
          bySender.set(from, { count: (existing?.count || 0) + 1, latestId: msg.id, subject: msg.subject });
        } else {
          bySender.set(from, { ...existing, count: existing.count + 1 });
        }
      }

      const sorted = Array.from(bySender.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 20)
        .map(([sender, info]) =>
          `From: ${sender}\nCount: ${info.count}\nLatest: ${info.subject}\nOpen to unsubscribe: https://mail.google.com/mail/u/0/#inbox/${info.latestId}\n---`
        )
        .join("\n");

      return {
        content: [{
          type: "text",
          text: `Top ${Math.min(20, bySender.size)} senders with unsubscribe options:\n\n${sorted}`
        }]
      };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

server.registerTool(
  "gmail_daily_summary",
  {
    description: "Get a daily summary of inbox: priority emails and newsletter highlights",
    inputSchema: {}
  },
  async () => {
    if (!gmailClient) {
      return { content: [{ type: "text", text: "Not authenticated. Use gmail_auth_status first." }] };
    }

    try {
      // Get unread count
      const labels = await gmailClient.listLabels();
      const inbox = labels.find(l => l.name === "INBOX");
      const unread = labels.find(l => l.name === "UNREAD");

      // Get priority emails (last 24 hours, unread, not promotional)
      const priorityQuery = "is:unread -category:promotions -category:social -category:updates newer_than:1d";
      const priorityEmails = await gmailClient.searchMessages(priorityQuery, 10);

      // Get newsletter/promotional count
      const promoQuery = "is:unread (category:promotions OR category:updates) newer_than:1d";
      const promoEmails = await gmailClient.searchMessages(promoQuery, 50);

      let summary = "=== DAILY EMAIL SUMMARY ===\n\n";
      summary += `Inbox: ${inbox?.messagesTotal || 0} total, ${unread?.messagesTotal || 0} unread\n\n`;

      summary += "--- Priority Emails ---\n";
      if (priorityEmails.length === 0) {
        summary += "No priority emails in the last 24 hours!\n\n";
      } else {
        summary += priorityEmails.map(m =>
          `• ${m.from.replace(/<.*>/, "").trim()}: ${m.subject}`
        ).join("\n") + "\n\n";
      }

      summary += "--- Newsletters & Promotions ---\n";
      summary += `${promoEmails.length} promotional/newsletter emails in the last 24 hours\n`;

      if (promoEmails.length > 0) {
        const bySender = new Map<string, number>();
        for (const msg of promoEmails) {
          const from = msg.from.replace(/<.*>/, "").trim();
          bySender.set(from, (bySender.get(from) || 0) + 1);
        }
        const top = Array.from(bySender.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([sender, count]) => `• ${sender}: ${count}`)
          .join("\n");
        summary += "Top senders:\n" + top;
      }

      return { content: [{ type: "text", text: summary }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Failed: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  }
);

// === START SERVER ===

async function main() {
  // Try to authenticate on startup
  const auth = await getAuthenticatedClient();
  if (auth) {
    gmailClient = new GmailApiClient(auth);
    console.error("Gmail MCP Server: Authenticated with stored token");
  } else {
    console.error("Gmail MCP Server: Not authenticated - use gmail_auth_status to set up");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gmail MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

**Step 2: Verify build**

Run: `npm run build`
Expected: No errors, `build/index.js` created

**Step 3: Add shebang to built file**

Run: `chmod +x build/index.js`

**Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: implement full MCP server with Gmail tools

Tools implemented:
- Authentication: auth_status, authenticate, complete_auth
- Reading: list_emails, get_email, search
- Drafts: create_draft, list_drafts
- Labels: list_labels, create_label, modify_labels
- Filters: list_filters, create_filter, delete_filter
- Utility: mark_read, mark_unread
- Workflows: get_priority_emails, find_newsletters,
  find_unsubscribe_candidates, daily_summary

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 3: Setup & Documentation

### Task 5: Create Setup Script

**Files:**
- Create: `scripts/setup.ts`
- Modify: `package.json`

**Step 1: Create interactive setup script**

```typescript
#!/usr/bin/env node
// scripts/setup.ts
import * as fs from "fs/promises";
import * as path from "path";
import * as http from "http";
import { URL } from "url";

const CONFIG_DIR = path.join(process.env.HOME || "~", ".gmail-mcp");
const CREDENTIALS_PATH = path.join(CONFIG_DIR, "credentials.json");
const TOKEN_PATH = path.join(CONFIG_DIR, "token.json");

async function main() {
  console.log("=== Gmail MCP Server Setup ===\n");

  // Check for credentials
  try {
    await fs.access(CREDENTIALS_PATH);
    console.log(`✓ Found credentials at: ${CREDENTIALS_PATH}\n`);
  } catch {
    console.log("No credentials found.\n");
    console.log("To set up Gmail API access:\n");
    console.log("1. Go to: https://console.cloud.google.com/");
    console.log("2. Create a new project (or select existing)");
    console.log("3. Enable the Gmail API:");
    console.log("   - Search for 'Gmail API' in the search bar");
    console.log("   - Click 'Enable'");
    console.log("4. Configure OAuth consent screen:");
    console.log("   - Go to 'OAuth consent screen'");
    console.log("   - Choose 'External' user type");
    console.log("   - Fill in app name and email");
    console.log("   - Add your email as a test user");
    console.log("5. Create credentials:");
    console.log("   - Go to 'Credentials'");
    console.log("   - Click 'Create Credentials' > 'OAuth 2.0 Client ID'");
    console.log("   - Choose 'Desktop application'");
    console.log("   - Download the JSON file");
    console.log(`6. Save the downloaded file as:\n   ${CREDENTIALS_PATH}\n`);

    await fs.mkdir(CONFIG_DIR, { recursive: true });
    console.log(`Created config directory: ${CONFIG_DIR}`);
    return;
  }

  // Check for existing token
  try {
    await fs.access(TOKEN_PATH);
    console.log(`✓ Found existing token at: ${TOKEN_PATH}`);
    console.log("\nYou're already authenticated! Run the server to use it.");
    return;
  } catch {
    console.log("No token found. Starting OAuth flow...\n");
  }

  // Load credentials and start OAuth
  const credContent = await fs.readFile(CREDENTIALS_PATH, "utf-8");
  const credentials = JSON.parse(credContent);
  const { client_id, client_secret } = credentials.installed || credentials.web;

  const { google } = await import("googleapis");
  const redirectUri = "http://localhost:3000/oauth2callback";

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  const SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.settings.basic"
  ];

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent"
  });

  console.log("Please visit this URL to authorize:\n");
  console.log(authUrl);
  console.log("\nWaiting for authorization...");

  // Start local server to receive callback
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "", `http://localhost:3000`);

    if (url.pathname === "/oauth2callback") {
      const code = url.searchParams.get("code");

      if (code) {
        try {
          const { tokens } = await oAuth2Client.getToken(code);
          await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<h1>Authorization successful!</h1><p>You can close this window.</p>");

          console.log("\n✓ Authorization successful!");
          console.log(`Token saved to: ${TOKEN_PATH}`);

          server.close();
          process.exit(0);
        } catch (err) {
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(`<h1>Error</h1><p>${err}</p>`);
          console.error("Token exchange failed:", err);
        }
      } else {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>No code received</h1>");
      }
    }
  });

  server.listen(3000, () => {
    console.log("Listening on http://localhost:3000 for OAuth callback...");
  });
}

main().catch(console.error);
```

**Step 2: Update package.json with setup script**

Add to scripts section:
```json
"setup": "npx tsx scripts/setup.ts"
```

**Step 3: Install tsx for running TypeScript scripts**

Run: `npm install -D tsx`

**Step 4: Test setup script runs**

Run: `npm run setup`
Expected: Shows setup instructions (will fail without credentials, that's OK)

**Step 5: Commit**

```bash
git add scripts/setup.ts package.json
git commit -m "feat: add interactive setup script for OAuth configuration

- Guides user through Google Cloud Console setup
- Handles local OAuth callback server
- Saves tokens to ~/.gmail-mcp/

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

### Task 6: Create README and Installation Instructions

**Files:**
- Create: `README.md`

**Step 1: Create comprehensive README**

```markdown
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
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add comprehensive README with setup and usage instructions

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Phase 4: Testing & Polish

### Task 7: Test Server Integration

**Files:**
- None (testing only)

**Step 1: Build the server**

Run: `npm run build`

**Step 2: Test server starts without errors**

Run: `node build/index.js`
Expected: "Gmail MCP Server: Not authenticated" (or authenticated if setup), then waits for input
Press Ctrl+C to exit

**Step 3: Add to Claude Code for testing**

Run: `claude mcp add --transport stdio gmail -- node $(pwd)/build/index.js`

**Step 4: In Claude Code, test auth status**

Run `/mcp` to verify gmail server appears

**Step 5: Document any issues found**

(Note issues for fixing)

---

### Task 8: Final Cleanup and Commit

**Files:**
- Review all files for cleanup

**Step 1: Run final build**

Run: `npm run build`
Expected: No errors or warnings

**Step 2: Review .gitignore is complete**

Verify node_modules, build, credentials.json, token.json are ignored

**Step 3: Final commit with all changes**

```bash
git add -A
git commit -m "chore: final cleanup and polish

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

**Step 4: Show completion summary**

```
Gmail MCP Server ready!

To use:
1. npm run setup (follow OAuth instructions)
2. claude mcp add --transport stdio gmail -- node $(pwd)/build/index.js
3. In Claude Code: "Show me my priority emails"
```

---

## Summary

This plan creates a fully functional Gmail MCP server with:

**18 Tools Total:**
- 3 Authentication tools
- 3 Email reading tools
- 2 Draft tools
- 3 Label tools
- 3 Filter tools
- 2 Mark read/unread utilities
- 4 High-level workflow tools

**Key Design Decisions:**
- Safety-first: Creates drafts, never auto-sends
- OAuth2 with local token storage in `~/.gmail-mcp/`
- Stdio transport for Claude Code integration
- Full Gmail search syntax support
- Smart workflow tools for common use cases

**Files Created:**
- `src/index.ts` - MCP server with all tools
- `src/auth.ts` - OAuth2 authentication
- `src/gmail-client.ts` - Gmail API wrapper
- `src/types.ts` - Shared TypeScript types
- `scripts/setup.ts` - Interactive setup wizard
- `README.md` - Documentation
