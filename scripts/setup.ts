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
