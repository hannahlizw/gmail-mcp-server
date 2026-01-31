// src/__tests__/mocks/gmail-api.ts
import { vi } from "vitest";

// Base64 encoded "Hello World"
export const HELLO_WORLD_BASE64 = "SGVsbG8gV29ybGQ=";

// Base64 encoded "<p>Hello <b>World</b></p>"
export const HTML_BODY_BASE64 = "PHA+SGVsbG8gPGI+V29ybGQ8L2I+PC9wPg==";

export const mockMessageResponse = {
  data: {
    id: "msg123",
    threadId: "thread456",
    labelIds: ["INBOX", "UNREAD"],
    snippet: "Hey, just wanted to follow up...",
    payload: {
      headers: [
        { name: "From", value: "Alice Smith <alice@example.com>" },
        { name: "To", value: "bob@example.com" },
        { name: "Subject", value: "Quick question" },
        { name: "Date", value: "Fri, 31 Jan 2025 10:00:00 -0500" },
      ],
      mimeType: "text/plain",
      body: { data: HELLO_WORLD_BASE64 },
    },
  },
};

export const mockMessageListResponse = {
  data: {
    messages: [{ id: "msg123" }, { id: "msg456" }],
  },
};

export const mockMultipartMessageResponse = {
  data: {
    id: "msg789",
    threadId: "thread789",
    labelIds: ["INBOX"],
    snippet: "Multipart message...",
    payload: {
      headers: [
        { name: "From", value: "sender@example.com" },
        { name: "To", value: "recipient@example.com" },
        { name: "Subject", value: "Multipart Test" },
        { name: "Date", value: "Fri, 31 Jan 2025 12:00:00 -0500" },
      ],
      mimeType: "multipart/alternative",
      parts: [
        {
          mimeType: "text/plain",
          body: { data: HELLO_WORLD_BASE64 },
        },
        {
          mimeType: "text/html",
          body: { data: HTML_BODY_BASE64 },
        },
      ],
    },
  },
};

export const mockHtmlOnlyMessageResponse = {
  data: {
    id: "msg_html",
    threadId: "thread_html",
    labelIds: ["INBOX"],
    snippet: "HTML only...",
    payload: {
      headers: [
        { name: "From", value: "html@example.com" },
        { name: "To", value: "recipient@example.com" },
        { name: "Subject", value: "HTML Only" },
        { name: "Date", value: "Fri, 31 Jan 2025 14:00:00 -0500" },
      ],
      mimeType: "text/html",
      body: { data: HTML_BODY_BASE64 },
    },
  },
};

export const mockDraftCreateResponse = {
  data: {
    id: "draft123",
    message: { id: "draftmsg123" },
  },
};

export const mockDraftListResponse = {
  data: {
    drafts: [{ id: "draft123" }, { id: "draft456" }],
  },
};

export const mockDraftGetResponse = {
  data: {
    id: "draft123",
    message: {
      payload: {
        headers: [
          { name: "To", value: "recipient@example.com" },
          { name: "Subject", value: "Draft Subject" },
        ],
        mimeType: "text/plain",
        body: { data: HELLO_WORLD_BASE64 },
      },
    },
  },
};

export const mockLabelsListResponse = {
  data: {
    labels: [
      { id: "INBOX", name: "INBOX", type: "system" },
      { id: "UNREAD", name: "UNREAD", type: "system" },
      { id: "Label_1", name: "Work", type: "user" },
    ],
  },
};

export const mockLabelGetResponse = (id: string, name: string, type: string) => ({
  data: {
    id,
    name,
    type,
    messagesTotal: 42,
    messagesUnread: 5,
  },
});

export const mockLabelCreateResponse = {
  data: {
    id: "Label_new",
    name: "New Label",
    type: "user",
  },
};

export const mockFiltersListResponse = {
  data: {
    filter: [
      {
        id: "filter123",
        criteria: { from: "newsletter@example.com" },
        action: { addLabelIds: ["Label_1"], removeLabelIds: ["UNREAD"] },
      },
    ],
  },
};

export const mockFilterCreateResponse = {
  data: {
    id: "filter_new",
    criteria: { from: "test@example.com" },
    action: { addLabelIds: ["Label_1"] },
  },
};

export const mockProfileResponse = {
  data: {
    emailAddress: "user@example.com",
    messagesTotal: 1234,
  },
};

export function createMockGmailApi() {
  return {
    users: {
      messages: {
        list: vi.fn(),
        get: vi.fn(),
        modify: vi.fn().mockResolvedValue({}),
      },
      drafts: {
        create: vi.fn(),
        list: vi.fn(),
        get: vi.fn(),
      },
      labels: {
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
      },
      settings: {
        filters: {
          list: vi.fn(),
          create: vi.fn(),
          delete: vi.fn().mockResolvedValue({}),
        },
      },
      getProfile: vi.fn(),
    },
  };
}
