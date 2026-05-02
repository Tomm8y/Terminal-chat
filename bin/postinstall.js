#!/usr/bin/env node

/**
 * postinstall.js
 * -------------
 * Runs automatically after `npm install` via the "postinstall" script in package.json.
 * Generates a self-signed TLS certificate (key + cert) using OpenSSL if they don't
 * already exist. This certificate is used by the chat server to encrypt all traffic.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Resolve absolute paths for the TLS private key and self-signed certificate
const keyPath = path.join(__dirname, "../lib/server.key");
const crtPath = path.join(__dirname, "../lib/server.crt");

// Only generate a new certificate if either file is missing,
// so repeated `npm install` calls don't overwrite an existing certificate.
if (!fs.existsSync(keyPath) || !fs.existsSync(crtPath)) {
  console.log("🔐 Generating TLS certificate...");

  // Build the OpenSSL command:
  //   -newkey rsa:2048   → create a new 2048-bit RSA key pair
  //   -nodes             → do NOT encrypt the private key with a passphrase
  //   -keyout            → write the private key to keyPath
  //   -x509              → output a self-signed certificate instead of a CSR
  //   -days 365          → certificate is valid for one year
  //   -out               → write the certificate to crtPath
  //   -subj "/CN=localhost" → set the Common Name to "localhost"
  const opensslCmd = `openssl req -newkey rsa:2048 -nodes -keyout "${keyPath}" -x509 -days 365 -out "${crtPath}" -subj "/CN=localhost"`;

  // Run OpenSSL synchronously so the install step doesn't finish before the
  // files are written. `shell: true` lets the command run through the OS shell.
  const result = spawnSync(opensslCmd, { shell: true, stdio: "inherit" });

  // If OpenSSL itself failed to start (e.g., not installed), abort with an error.
  if (result.error) {
    console.error("Failed to generate TLS certificate:", result.error);
    process.exit(1);
  }
}
