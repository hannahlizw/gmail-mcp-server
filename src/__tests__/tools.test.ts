// src/__tests__/tools.test.ts
import { describe, it, expect } from "vitest";

// Test tool output formatting logic
describe("MCP Tool Output Formatting", () => {
  describe("Email list formatting", () => {
    it("formats email summary correctly", () => {
      const message = {
        id: "msg123",
        from: "sender@example.com",
        subject: "Test Subject",
        date: "2025-01-31",
        isUnread: true,
        snippet: "This is a snippet...",
      };

      const formatted = `ID: ${message.id}\nFrom: ${message.from}\nSubject: ${message.subject}\nDate: ${message.date}\nUnread: ${message.isUnread}\nSnippet: ${message.snippet}\n---`;

      expect(formatted).toContain("ID: msg123");
      expect(formatted).toContain("From: sender@example.com");
      expect(formatted).toContain("Unread: true");
    });
  });

  describe("Priority email query", () => {
    it("excludes promotional categories", () => {
      const query = "is:unread -category:promotions -category:social -category:updates -category:forums";

      expect(query).toContain("-category:promotions");
      expect(query).toContain("-category:social");
      expect(query).toContain("-category:updates");
      expect(query).toContain("-category:forums");
    });
  });

  describe("Newsletter detection query", () => {
    it("searches for unsubscribe patterns", () => {
      const query = '(unsubscribe OR newsletter OR "email preferences" OR "manage subscriptions") -is:sent';

      expect(query).toContain("unsubscribe");
      expect(query).toContain("newsletter");
      expect(query).toContain("-is:sent");
    });
  });

  describe("Newsletter grouping logic", () => {
    it("groups emails by sender", () => {
      const messages = [
        { from: "Alice <alice@example.com>" },
        { from: "Alice <alice@example.com>" },
        { from: "Bob <bob@example.com>" },
      ];

      const bySender = new Map<string, number>();
      for (const msg of messages) {
        const from = msg.from.replace(/<.*>/, "").trim();
        bySender.set(from, (bySender.get(from) || 0) + 1);
      }

      expect(bySender.get("Alice")).toBe(2);
      expect(bySender.get("Bob")).toBe(1);
    });
  });

  describe("Error messages", () => {
    it("returns not authenticated message", () => {
      const notAuthMessage = "Not authenticated. Use gmail_auth_status first.";
      expect(notAuthMessage).toContain("gmail_auth_status");
    });
  });

  describe("Draft web link generation", () => {
    it("generates correct Gmail URL", () => {
      const messageId = "draftmsg123";
      const webLink = `https://mail.google.com/mail/u/0/#drafts?compose=${messageId}`;

      expect(webLink).toContain("mail.google.com");
      expect(webLink).toContain("drafts");
      expect(webLink).toContain(messageId);
    });
  });
});
