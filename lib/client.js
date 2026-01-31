const tls = require('tls');
const readline = require('readline');

// ------------------------------
// Read connection info from environment variables
// ------------------------------
const host = process.env.CHAT_HOST;
const port = process.env.CHAT_PORT;
const name = process.env.CHAT_NAME;
const userId = process.env.CHAT_ID;

if (!host || !port || !name || !userId) {
  console.error('Error: Missing connection info. Please run via terminal-chat.');
  process.exit(1);
}

// ------------------------------
// Create readline interface for terminal input/output
// ------------------------------
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

// ------------------------------
// Connect to TLS server
// ------------------------------
const socket = tls.connect(
  { host, port: Number(port), rejectUnauthorized: false },
  () => {
    console.log('Connected to server');
    socket.write(name + '\n');  // Send username to server
    rl.prompt();
  }
);

// ------------------------------
// Handle incoming messages from server
// ------------------------------
socket.on('data', data => {
  const message = data.toString().trim();
  if (message === '__PING__') { socket.write('__PONG__\n'); return; }
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  console.log(message);
  rl.prompt(true);
});

// ------------------------------
// Send user input lines to server
// ------------------------------
rl.on('line', line => {
  socket.write(line + '\n');
  rl.prompt();
});

// ------------------------------
// Keep-alive: send __PONG__ every 30 seconds
// ------------------------------
setInterval(() => {
  if (!socket.destroyed) socket.write('__PONG__\n');
}, 30000);

// ------------------------------
// Handle server disconnection
// ------------------------------
socket.on('end', () => {
  console.log('Disconnected from server');
  process.exit(0);
});

socket.on('error', err => {
  console.error('Connection error:', err.message);
  process.exit(1);
});