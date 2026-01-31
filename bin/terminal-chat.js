#!/usr/bin/env node

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Paths to server and client scripts
const serverPath = path.join(__dirname, '../lib/server.js');
const clientPath = path.join(__dirname, '../lib/client.js');

// PID folder in user home directory
const pidDir = path.join(os.homedir(), '.terminal-chat', 'pids');
if (!fs.existsSync(pidDir)) fs.mkdirSync(pidDir, { recursive: true });

// TLS certificate paths
const keyPath = path.join(__dirname, '../lib/server.key');
const crtPath = path.join(__dirname, '../lib/server.crt');

// =====================
// Terminal UI
// =====================
console.log(`   ,_,        TERMINAL CHAT 🔐\n  (O,O)  \n  (   )  \n   " "  \n`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });

console.log('Select what you want:');
console.log('[1] Create chat server');
console.log('[2] Connect to chat');
rl.question('> ', choice => {
  choice = choice.trim();

  if (choice === '1') {
    rl.question('Enter port to run chat server (default 1599): ', portInput => {
      const port = portInput.trim() ? parseInt(portInput.trim(), 10) : 1599;
      const pidFile = path.join(pidDir, `server-${port}.pid`);

      // Ensure TLS certificate exists
      if (!fs.existsSync(keyPath) || !fs.existsSync(crtPath)) {
        console.log('🔐 TLS certificate not found. Generating...');
        const opensslCmd = `openssl req -newkey rsa:2048 -nodes -keyout "${keyPath}" -x509 -days 365 -out "${crtPath}" -subj "/CN=localhost"`;
        const result = spawnSync(opensslCmd, { shell: true, stdio: 'inherit' });
        if (result.error) { console.error('Error generating TLS certificate:', result.error); process.exit(1); }
      }

      // Spawn server in background
      const child = spawn(process.execPath, [serverPath, port], { detached: true, stdio: 'ignore' });
      fs.writeFileSync(pidFile, child.pid.toString(), 'utf-8');
      child.unref();
      console.log(`Server started in background on port ${port} (PID ${child.pid}).`);
      rl.close();
    });
  } else if (choice === '2') {
    rl.question('Enter server IP: ', host => {
      rl.question('Enter server port: ', port => {
        rl.question('Enter your name: ', name => {
          // Generate unique user ID
          const userId = `${String.fromCharCode(65 + Math.floor(Math.random()*26))}${String.fromCharCode(65 + Math.floor(Math.random()*26))}${Math.floor(Math.random()*10)}${Math.floor(Math.random()*10)}`;

          // Spawn client process and pass host, port, name, userId as env variables
          const clientProcess = spawn(process.execPath, [clientPath], {
            stdio: 'inherit',
            env: { ...process.env, CHAT_HOST: host, CHAT_PORT: port, CHAT_NAME: name, CHAT_ID: userId }
          });
          rl.close();
        });
      });
    });
  } else {
    console.log('Invalid choice. Exiting.');
    rl.close();
  }
});