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
