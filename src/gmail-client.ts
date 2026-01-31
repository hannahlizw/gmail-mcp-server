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
        messagesTotal: detail.data.messagesTotal ?? undefined,
        messagesUnread: detail.data.messagesUnread ?? undefined
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
      id: f.id ?? undefined,
      criteria: {
        from: f.criteria?.from ?? undefined,
        to: f.criteria?.to ?? undefined,
        subject: f.criteria?.subject ?? undefined,
        query: f.criteria?.query ?? undefined
      },
      action: {
        addLabelIds: f.action?.addLabelIds ?? undefined,
        removeLabelIds: f.action?.removeLabelIds ?? undefined,
        forward: f.action?.forward ?? undefined
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
      id: response.data.id ?? undefined,
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
