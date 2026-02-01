const tls = require('tls');
const readline = require('readline');
const crypto = require('crypto');

// ==============================
// Read connection info from environment variables
// ==============================
const host = process.env.CHAT_HOST;
const port = process.env.CHAT_PORT;
const name = process.env.CHAT_NAME;
const userId = process.env.CHAT_ID;

if (!host || !port || !name || !userId) {
  console.error('Error: Missing connection info. Please run via terminal-chat.');
  process.exit(1);
}

// ==============================
// Readline interface for terminal input/output
// ==============================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

// ==============================
// Generate E2E key for private messages
// ==============================
const secretKey = crypto.randomBytes(32);

// ==============================
// Map of other users' keys (for simplicity we exchange raw keys via server, in prod use proper key exchange)
// ==============================
const userKeys = {};

// ==============================
// Encrypt / decrypt helper functions
// ==============================
function encrypt(msg, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(msg, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex')
  });
}

function decrypt(encryptedStr, key) {
  try {
    const obj = JSON.parse(encryptedStr);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(obj.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(obj.tag, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(obj.data, 'hex')),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  } catch {
    return '[Could not decrypt]';
  }
}

// ==============================
// Connect to TLS server
// ==============================
const socket = tls.connect({ host, port: Number(port), rejectUnauthorized: false }, () => {
  console.log('Connected to server');
  // Send name + userId + secretKey to server
  const initObj = {
    name,
    id: userId,
    key: secretKey.toString('hex')
  };
  socket.write(JSON.stringify(initObj) + '\n');
  rl.prompt();
});

// ==============================
// Handle incoming messages
// ==============================
socket.on('data', data => {
  const message = data.toString().trim();
  if (message === '__PING__') { socket.write('__PONG__\n'); return; }

  // Try to parse as object for private message
  try {
    const obj = JSON.parse(message);
    if (obj.type === 'pm') {
      // store sender key if not exists
      if (!userKeys[obj.from]) userKeys[obj.from] = Buffer.from(obj.key, 'hex');
      const decrypted = decrypt(obj.msg, userKeys[obj.from]);
      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      console.log(`[PRIVATE] From ${obj.name}: ${decrypted}`);
      rl.prompt(true);
      return;
    }
  } catch {}

  // Otherwise, print as public message
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  console.log(message);
  rl.prompt(true);
});

// ==============================
// Send user input
// ==============================
rl.on('line', line => {
  line = line.trim();
  if (!line) return rl.prompt();

  if (line.startsWith('/pm')) {
    const parts = line.split(' ');
    if (parts.length < 3) { console.log('Usage: /pm <ID> <message>'); return rl.prompt(); }
    const targetId = parts[1];
    const msg = parts.slice(2).join(' ');

    // Encrypt using target's key if exists, otherwise send raw
    const key = userKeys[targetId] || secretKey;
    const payload = JSON.stringify({
      type: 'pm',
      from: userId,
      name,
      to: targetId,
      key: secretKey.toString('hex'), // send sender key
      msg: encrypt(msg, key)
    });
    socket.write(payload + '\n');
    console.log(`[PRIVATE] To ${targetId}: ${msg}`);
    rl.prompt();
    return;
  }

  socket.write(line + '\n');
  rl.prompt();
});

// ==============================
// Keep-alive ping
// ==============================
setInterval(() => { if (!socket.destroyed) socket.write('__PONG__\n'); }, 30000);

// ==============================
// Handle disconnection
// ==============================
socket.on('end', () => { console.log('Disconnected from server'); process.exit(0); });
socket.on('error', err => { console.error('Connection error:', err.message); process.exit(1); });