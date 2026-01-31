#!/usr/bin/env node

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

// Paths to server and client scripts
const serverPath = path.join(__dirname, "../lib/server.js");
const clientPath = path.join(__dirname, "../lib/client.js");

// PID folder in user home directory
const pidDir = path.join(os.homedir(), ".terminal-chat", "pids");
if (!fs.existsSync(pidDir)) fs.mkdirSync(pidDir, { recursive: true });

/* ==============================
   Generate unique user ID (2 letters + 2 digits)
================================ */
function generateUserId(existingIds = new Set()) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let id;
  do {
    const letterPart = letters[Math.floor(Math.random() * 26)] + letters[Math.floor(Math.random() * 26)];
    const numberPart = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    id = letterPart + numberPart;
  } while (existingIds.has(id));
  return id;
}

/* ==============================
   Display logo (Owl)
================================ */
console.log(`
   ,_,        TERMINAL CHAT 🔐
  (O,O)  
  (   )  
   " "  
`);

/* ==============================
   Interactive menu
================================ */
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

console.log("Select what you want:");
console.log("[1] Create chat server");
console.log("[2] Connect to chat");

rl.question('> ', choice => {
  choice = choice.trim();

  if (choice === '1') {
    // Create server
    rl.question('Enter port to run chat server (default 1599): ', portInput => {
      const port = parseInt(portInput) || 1599;
      const pidFile = path.join(pidDir, `server-${port}.pid`);

      // Spawn server in background
      const child = spawn(process.execPath, [serverPath, port], {
        detached: true,
        stdio: 'ignore'
      });
      fs.writeFileSync(pidFile, child.pid.toString(), 'utf-8');
      child.unref();
      console.log(`Server started in background on port ${port} (PID ${child.pid}).`);
      rl.close();
    });

  } else if (choice === '2') {
    // Connect client
    rl.question('Enter server IP: ', host => {
      rl.question('Enter server port: ', port => {
        rl.question('Enter your name: ', name => {
          // Generate unique ID for user and display
          const existingIds = new Set();
          const userId = process.env.CHAT_USER_ID || generateUserId(existingIds);
          console.log(`\nYour user ID: ${userId}`);

          // Spawn client script with env variables for compatibility with server
          const env = { ...process.env, CHAT_USER_NAME: name, CHAT_USER_ID: userId, CHAT_SERVER_HOST: host, CHAT_SERVER_PORT: port };
          spawn(process.execPath, [clientPath], { stdio: 'inherit', env });
          rl.close();
        });
      });
    });

  } else {
    console.log("Invalid choice. Exiting.");
    rl.close();
  }
});