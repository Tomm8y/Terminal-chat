#!/usr/bin/env node

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Paths to server and client scripts
const serverPath = path.join(__dirname, "../lib/server.js");
const clientPath = path.join(__dirname, "../lib/client.js");

// Parse CLI arguments
const args = process.argv.slice(2);
const cmd = args[0];
const stopFlag = args.includes("-s") || args.includes("--stop");

// Default port if none provided
let portIndex = args.findIndex(a => a === "--port");
let port = 1599; // default port
if (portIndex !== -1 && args[portIndex + 1]) {
  port = parseInt(args[portIndex + 1], 10);
}

// ------------------------------
// PID folder in user home directory
// ------------------------------
const pidDir = path.join(os.homedir(), ".terminal-chat", "pids");

// Ensure the folder exists
if (!fs.existsSync(pidDir)) {
  fs.mkdirSync(pidDir, { recursive: true });
}

// PID file for this port
const pidFile = path.join(pidDir, `server-${port}.pid`);

// Validate command
if (!cmd || !["server", "client"].includes(cmd)) {
  console.log("Usage: terminal-chat <server|client> [-s|--stop] [--port <port>]");
  process.exit(1);
}

// ------------------------------
// SERVER LOGIC
// ------------------------------
if (cmd === "server") {

  // Stop the server if -s or --stop flag is provided
  if (stopFlag) {
    if (!fs.existsSync(pidFile)) {
      console.log(`No running server found on port ${port}.`);
      process.exit(0);
    }
    const pid = parseInt(fs.readFileSync(pidFile, "utf-8"));
    try {
      process.kill(pid);       // Kill the server process
      fs.unlinkSync(pidFile);  // Remove PID file
      console.log(`Server on port ${port} (PID ${pid}) stopped.`);
    } catch (err) {
      console.error("Error stopping server:", err.message);
    }
    process.exit(0);
  }

  // ------------------------------
  // Ensure TLS certificate exists
  // ------------------------------
  const keyPath = path.join(__dirname, "../lib/server.key");
  const crtPath = path.join(__dirname, "../lib/server.crt");

  if (!fs.existsSync(keyPath) || !fs.existsSync(crtPath)) {
    console.log("🔐 TLS certificate not found. Generating...");
    const opensslCmd = `openssl req -newkey rsa:2048 -nodes -keyout "${keyPath}" -x509 -days 365 -out "${crtPath}" -subj "/CN=localhost"`;
    const result = spawnSync(opensslCmd, { shell: true, stdio: "inherit" });
    if (result.error) {
      console.error("Error generating TLS certificate:", result.error);
      process.exit(1);
    }
  }

  // ------------------------------
  // Spawn server in background with the given port
  // ------------------------------
  const child = spawn(process.execPath, [serverPath, port], {
    detached: true,       // Run independently of parent terminal
    stdio: "ignore",      // Ignore standard input/output
  });

  // Save server PID to file for later stopping
  fs.writeFileSync(pidFile, child.pid.toString(), "utf-8");

  // Allow parent process to exit while server continues running
  child.unref();

  console.log(`Server started in background on port ${port} (PID ${child.pid}).`);
  process.exit(0);
}

// ------------------------------
// CLIENT LOGIC
// ------------------------------
// Require and run client script directly
require(clientPath);