#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Paths to server TLS key and certificate
const keyPath = path.join(__dirname, "../lib/server.key");
const crtPath = path.join(__dirname, "../lib/server.crt");

// Only generate TLS certificate if it does not exist
if (!fs.existsSync(keyPath) || !fs.existsSync(crtPath)) {
  console.log("🔐 Generating TLS certificate...");
  const opensslCmd = `openssl req -newkey rsa:2048 -nodes -keyout "${keyPath}" -x509 -days 365 -out "${crtPath}" -subj "/CN=localhost"`;
  const result = spawnSync(opensslCmd, { shell: true, stdio: "inherit" });
  if (result.error) {
    console.error("Failed to generate TLS certificate:", result.error);
    process.exit(1);
  }
}