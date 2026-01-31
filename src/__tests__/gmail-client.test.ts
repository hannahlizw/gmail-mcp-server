// src/__tests__/gmail-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GmailApiClient } from "../gmail-client.js";
import {
  mockMessageResponse,
  mockMultipartMessageResponse,
  mockHtmlOnlyMessageResponse,
  mockMessageListResponse,
  createMockGmailApi,
} from "./mocks/gmail-api.js";

// Mock googleapis at module level
const mockGmail = createMockGmailApi();
vi.mock("googleapis", () => ({
  google: {
    gmail: vi.fn(() => mockGmail),
    auth: {
      OAuth2: vi.fn(),
    },
  },
}));

describe("GmailApiClient", () => {
  let client: GmailApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations
    Object.values(mockGmail.users.messages).forEach((fn) => {
      if (typeof fn === "function" && "mockReset" in fn) {
        (fn as any).mockReset();
      }
    });
    client = new GmailApiClient({} as any);
  });

  describe("getMessage", () => {
    it("extracts headers correctly", async () => {
      mockGmail.users.messages.get.mockResolvedValue(mockMessageResponse);

      const result = await client.getMessage("msg123");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("msg123");
      expect(result!.threadId).toBe("thread456");
      expect(result!.from).toBe("Alice Smith <alice@example.com>");
      expect(result!.to).toBe("bob@example.com");
      expect(result!.subject).toBe("Quick question");
      expect(result!.date).toBe("Fri, 31 Jan 2025 10:00:00 -0500");
    });

    it("decodes base64 body content", async () => {
      mockGmail.users.messages.get.mockResolvedValue(mockMessageResponse);

      const result = await client.getMessage("msg123");

      expect(result!.body).toBe("Hello World");
    });

    it("handles multipart messages by finding plain text part", async () => {
      mockGmail.users.messages.get.mockResolvedValue(mockMultipartMessageResponse);

      const result = await client.getMessage("msg789");

      expect(result!.body).toBe("Hello World");
    });

    it("strips HTML when only HTML body available", async () => {
      mockGmail.users.messages.get.mockResolvedValue(mockHtmlOnlyMessageResponse);

      const result = await client.getMessage("msg_html");

      expect(result!.body).toBe("Hello World");
    });

    it("identifies unread messages", async () => {
      mockGmail.users.messages.get.mockResolvedValue(mockMessageResponse);

      const result = await client.getMessage("msg123");

      expect(result!.isUnread).toBe(true);
      expect(result!.labels).toContain("UNREAD");
    });

    it("returns null on API error", async () => {
      mockGmail.users.messages.get.mockRejectedValue(new Error("API Error"));

      const result = await client.getMessage("msg123");

      expect(result).toBeNull();
    });
  });

  describe("listMessages", () => {
    it("returns array of parsed messages", async () => {
      mockGmail.users.messages.list.mockResolvedValue(mockMessageListResponse);
      mockGmail.users.messages.get.mockResolvedValue(mockMessageResponse);

      const results = await client.listMessages({ maxResults: 10 });

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("msg123");
      expect(mockGmail.users.messages.list).toHaveBeenCalledWith({
        userId: "me",
        maxResults: 10,
        q: undefined,
        labelIds: undefined,
      });
    });

    it("passes query to API", async () => {
      mockGmail.users.messages.list.mockResolvedValue({ data: { messages: [] } });

      await client.listMessages({ query: "is:unread" });

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({ q: "is:unread" })
      );
    });

    it("returns empty array when no messages", async () => {
      mockGmail.users.messages.list.mockResolvedValue({ data: { messages: undefined } });

      const results = await client.listMessages();

      expect(results).toEqual([]);
    });
  });

  describe("searchMessages", () => {
    it("passes query to listMessages", async () => {
      mockGmail.users.messages.list.mockResolvedValue({ data: { messages: [] } });

      await client.searchMessages("from:test@example.com", 5);

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: "from:test@example.com",
          maxResults: 5,
        })
      );
    });
  });
});
