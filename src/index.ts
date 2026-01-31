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

server.tool(
  "gmail_auth_status",
  "Check Gmail authentication status and get setup instructions if needed",
  {},
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

server.tool(
  "gmail_authenticate",
  "Start OAuth authentication flow. Returns a URL to visit for authorization.",
  {},
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

server.tool(
  "gmail_complete_auth",
  "Complete OAuth flow with the authorization code from Google",
  {
    code: z.string().describe("The authorization code from Google's OAuth redirect")
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

server.tool(
  "gmail_list_emails",
  "List recent emails. Use query for Gmail search syntax (e.g., 'is:unread', 'from:someone@example.com', 'label:important').",
  {
    query: z.string().optional().describe("Gmail search query"),
    maxResults: z.number().min(1).max(50).default(20).describe("Maximum number of emails to return")
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

server.tool(
  "gmail_get_email",
  "Get full content of a specific email by ID",
  {
    messageId: z.string().describe("The email message ID")
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

server.tool(
  "gmail_search",
  "Search emails using Gmail's powerful search syntax. Examples: 'from:newsletter', 'is:unread is:important', 'subject:invoice older_than:7d'",
  {
    query: z.string().describe("Gmail search query"),
    maxResults: z.number().min(1).max(50).default(20).describe("Maximum results")
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

server.tool(
  "gmail_create_draft",
  "Create an email draft. Returns a link to open the draft in Gmail for editing and sending.",
  {
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject"),
    body: z.string().describe("Email body (plain text)"),
    replyToMessageId: z.string().optional().describe("Message ID to reply to (for threading)")
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

server.tool(
  "gmail_list_drafts",
  "List current email drafts",
  {
    maxResults: z.number().min(1).max(20).default(10).describe("Maximum drafts to return")
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

server.tool(
  "gmail_list_labels",
  "List all Gmail labels with message counts",
  {},
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

server.tool(
  "gmail_create_label",
  "Create a new Gmail label",
  {
    name: z.string().describe("Label name")
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

server.tool(
  "gmail_modify_labels",
  "Add or remove labels from an email",
  {
    messageId: z.string().describe("Email message ID"),
    addLabels: z.array(z.string()).optional().describe("Label IDs to add"),
    removeLabels: z.array(z.string()).optional().describe("Label IDs to remove")
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

server.tool(
  "gmail_list_filters",
  "List all Gmail filters",
  {},
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

server.tool(
  "gmail_create_filter",
  "Create a Gmail filter to automatically process incoming emails",
  {
    from: z.string().optional().describe("Filter emails from this sender"),
    to: z.string().optional().describe("Filter emails to this recipient"),
    subject: z.string().optional().describe("Filter emails with this subject"),
    query: z.string().optional().describe("Gmail search query for matching"),
    addLabelIds: z.array(z.string()).optional().describe("Label IDs to add to matching emails"),
    removeLabelIds: z.array(z.string()).optional().describe("Label IDs to remove (e.g., UNREAD to mark as read)")
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

server.tool(
  "gmail_delete_filter",
  "Delete a Gmail filter by ID",
  {
    filterId: z.string().describe("Filter ID to delete")
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

server.tool(
  "gmail_mark_read",
  "Mark an email as read",
  {
    messageId: z.string().describe("Email message ID")
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

server.tool(
  "gmail_mark_unread",
  "Mark an email as unread",
  {
    messageId: z.string().describe("Email message ID")
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

server.tool(
  "gmail_get_priority_emails",
  "Get high-priority emails that likely need a response. Searches for unread emails from real people (not newsletters/automated).",
  {
    maxResults: z.number().min(1).max(30).default(15).describe("Maximum emails to return")
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

server.tool(
  "gmail_find_newsletters",
  "Find potential newsletter emails for review. Helps identify subscriptions for filtering or unsubscribing.",
  {
    maxResults: z.number().min(1).max(50).default(30).describe("Maximum emails to scan")
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

server.tool(
  "gmail_find_unsubscribe_candidates",
  "Find emails with unsubscribe links - candidates for cleaning up inbox",
  {
    maxResults: z.number().min(1).max(50).default(30).describe("Maximum emails to scan")
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

server.tool(
  "gmail_daily_summary",
  "Get a daily summary of inbox: priority emails and newsletter highlights",
  {},
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
