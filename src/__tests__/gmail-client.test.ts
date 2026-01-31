// src/__tests__/gmail-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GmailApiClient } from "../gmail-client.js";
import {
  mockMessageResponse,
  mockMultipartMessageResponse,
  mockHtmlOnlyMessageResponse,
  mockMessageListResponse,
  mockDraftCreateResponse,
  mockDraftListResponse,
  mockDraftGetResponse,
  mockLabelsListResponse,
  mockLabelGetResponse,
  mockLabelCreateResponse,
  mockFiltersListResponse,
  mockFilterCreateResponse,
  mockProfileResponse,
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

  describe("createDraft", () => {
    it("returns draft ID and web link", async () => {
      mockGmail.users.drafts.create.mockResolvedValue(mockDraftCreateResponse);

      const result = await client.createDraft({
        to: "recipient@example.com",
        subject: "Test Subject",
        body: "Test body",
      });

      expect(result.id).toBe("draft123");
      expect(result.webLink).toContain("mail.google.com");
      expect(result.webLink).toContain("draftmsg123");
    });

    it("encodes message as base64url", async () => {
      mockGmail.users.drafts.create.mockResolvedValue(mockDraftCreateResponse);

      await client.createDraft({
        to: "recipient@example.com",
        subject: "Test",
        body: "Body",
      });

      const call = mockGmail.users.drafts.create.mock.calls[0][0];
      expect(call.requestBody.message.raw).toBeDefined();
      // Verify it's valid base64url (no +, /, or = padding issues)
      expect(call.requestBody.message.raw).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("includes threadId for replies", async () => {
      mockGmail.users.drafts.create.mockResolvedValue(mockDraftCreateResponse);

      await client.createDraft({
        to: "recipient@example.com",
        subject: "Re: Test",
        body: "Reply body",
        threadId: "thread123",
        inReplyTo: "original-msg-id",
      });

      const call = mockGmail.users.drafts.create.mock.calls[0][0];
      expect(call.requestBody.message.threadId).toBe("thread123");
    });
  });

  describe("listDrafts", () => {
    it("returns formatted draft list", async () => {
      mockGmail.users.drafts.list.mockResolvedValue(mockDraftListResponse);
      mockGmail.users.drafts.get.mockResolvedValue(mockDraftGetResponse);

      const results = await client.listDrafts(10);

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe("draft123");
      expect(results[0].message.to).toBe("recipient@example.com");
      expect(results[0].message.subject).toBe("Draft Subject");
    });
  });

  describe("listLabels", () => {
    it("returns labels with message counts", async () => {
      mockGmail.users.labels.list.mockResolvedValue(mockLabelsListResponse);
      mockGmail.users.labels.get
        .mockResolvedValueOnce(mockLabelGetResponse("INBOX", "INBOX", "system"))
        .mockResolvedValueOnce(mockLabelGetResponse("UNREAD", "UNREAD", "system"))
        .mockResolvedValueOnce(mockLabelGetResponse("Label_1", "Work", "user"));

      const results = await client.listLabels();

      expect(results).toHaveLength(3);
      const workLabel = results.find((l) => l.name === "Work");
      expect(workLabel).toBeDefined();
      expect(workLabel!.type).toBe("user");
      expect(workLabel!.messagesTotal).toBe(42);
    });
  });

  describe("createLabel", () => {
    it("creates label and returns result", async () => {
      mockGmail.users.labels.create.mockResolvedValue(mockLabelCreateResponse);

      const result = await client.createLabel("New Label");

      expect(result.id).toBe("Label_new");
      expect(result.name).toBe("New Label");
      expect(mockGmail.users.labels.create).toHaveBeenCalledWith({
        userId: "me",
        requestBody: expect.objectContaining({ name: "New Label" }),
      });
    });
  });

  describe("modifyMessageLabels", () => {
    it("adds and removes specified labels", async () => {
      mockGmail.users.messages.modify.mockResolvedValue({});

      await client.modifyMessageLabels("msg123", ["Label_1"], ["UNREAD"]);

      expect(mockGmail.users.messages.modify).toHaveBeenCalledWith({
        userId: "me",
        id: "msg123",
        requestBody: {
          addLabelIds: ["Label_1"],
          removeLabelIds: ["UNREAD"],
        },
      });
    });
  });

  describe("listFilters", () => {
    it("returns parsed filters", async () => {
      mockGmail.users.settings.filters.list.mockResolvedValue(mockFiltersListResponse);

      const results = await client.listFilters();

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("filter123");
      expect(results[0].criteria.from).toBe("newsletter@example.com");
      expect(results[0].action.addLabelIds).toContain("Label_1");
    });
  });

  describe("createFilter", () => {
    it("creates filter with criteria and action", async () => {
      mockGmail.users.settings.filters.create.mockResolvedValue(mockFilterCreateResponse);

      const result = await client.createFilter({
        criteria: { from: "test@example.com" },
        action: { addLabelIds: ["Label_1"] },
      });

      expect(result.id).toBe("filter_new");
      expect(mockGmail.users.settings.filters.create).toHaveBeenCalledWith({
        userId: "me",
        requestBody: {
          criteria: { from: "test@example.com" },
          action: { addLabelIds: ["Label_1"] },
        },
      });
    });
  });

  describe("deleteFilter", () => {
    it("calls delete API", async () => {
      mockGmail.users.settings.filters.delete.mockResolvedValue({});

      await client.deleteFilter("filter123");

      expect(mockGmail.users.settings.filters.delete).toHaveBeenCalledWith({
        userId: "me",
        id: "filter123",
      });
    });
  });

  describe("markAsRead", () => {
    it("removes UNREAD label", async () => {
      mockGmail.users.messages.modify.mockResolvedValue({});

      await client.markAsRead("msg123");

      expect(mockGmail.users.messages.modify).toHaveBeenCalledWith({
        userId: "me",
        id: "msg123",
        requestBody: {
          addLabelIds: [],
          removeLabelIds: ["UNREAD"],
        },
      });
    });
  });

  describe("markAsUnread", () => {
    it("adds UNREAD label", async () => {
      mockGmail.users.messages.modify.mockResolvedValue({});

      await client.markAsUnread("msg123");

      expect(mockGmail.users.messages.modify).toHaveBeenCalledWith({
        userId: "me",
        id: "msg123",
        requestBody: {
          addLabelIds: ["UNREAD"],
          removeLabelIds: [],
        },
      });
    });
  });

  describe("getProfile", () => {
    it("returns email and message count", async () => {
      mockGmail.users.getProfile.mockResolvedValue(mockProfileResponse);

      const result = await client.getProfile();

      expect(result.email).toBe("user@example.com");
      expect(result.messagesTotal).toBe(1234);
    });
  });
});
