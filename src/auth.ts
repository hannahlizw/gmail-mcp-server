// src/auth.ts
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import * as fs from "fs/promises";
import * as path from "path";

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
