const tls = require('tls');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ==============================
// Global crash protection
// ==============================
process.on('uncaughtException', err => { console.error('Uncaught Exception:', err.message); });
process.on('unhandledRejection', err => { console.error('Unhandled Rejection:', err); });

// ==============================
// Server configuration
// ==============================
const port = process.argv[2] ? parseInt(process.argv[2], 10) : 1599;
const options = {
  key: fs.readFileSync(path.join(__dirname, 'server.key')),
  cert: fs.readFileSync(path.join(__dirname, 'server.crt'))
};

// ==============================
// Server state
// ==============================
let clients = [];
let nextClientId = 1;
let bannedIds = new Set();
const ADMIN_PASSWORD_HASH = crypto.createHash('sha256').update('admin123').digest('hex');

// ==============================
// Safe socket write
// ==============================
function safeWrite(socket, message) {
  try {
    if (socket && !socket.destroyed) socket.write(message);
  } catch (err) {
    console.error('Socket write error:', err.message);
  }
}

// ==============================
// Broadcast message
// ==============================
function broadcast(message, exceptSocket = null) {
  clients.forEach(c => { if (c.socket !== exceptSocket) safeWrite(c.socket, message); });
}

// ==============================
// Find client by ID
// ==============================
function getClientById(id) { return clients.find(c => c.id === id); }

// ==============================
// Command handler
// ==============================
function handleCommand(cmd, client) {
  const parts = cmd.split(' ');
  const command = parts[0].toLowerCase();

  switch (command) {
    case '/help':
      safeWrite(client.socket, `Commands:\n/help - Show this help\n/users - List online users\n/pm <ID> <msg> - Private message\n/admin - Become admin\n/ban <ID> - Ban user\n/ping - Check connection\n/exit | /quit - Leave chat\n`);
      break;
    case '/ping':
      safeWrite(client.socket, 'Still connected\n');
      break;
    case '/users':
      safeWrite(client.socket, `Online users (${clients.length}):\n` + clients.map(c => `- [${c.id}] ${c.name}${c.role==='admin'?' (admin)':''}`).join('\n') + '\n');
      break;
    case '/pm':
      if (parts.length < 3) return safeWrite(client.socket, 'Usage: /pm <ID> <message>\n');
      const target = getClientById(parts[1]);
      if (!target) return safeWrite(client.socket, 'User ID not found\n');
      const message = parts.slice(2).join(' ');
      target.socket.write(`[PRIVATE] From ${client.name}: ${message}\n`);
      safeWrite(client.socket, `[PRIVATE] To ${target.name}: ${message}\n`);
      break;
    case '/admin':
      if (client.role === 'admin') return safeWrite(client.socket, 'Already admin\n');
      client.waitingForAdminPassword = true;
      safeWrite(client.socket, 'Enter admin password: ');
      break;
    case '/ban':
      if (client.role !== 'admin') return safeWrite(client.socket, 'Permission denied\n');
      const targetBan = getClientById(parts[1]);
      if (!targetBan) return safeWrite(client.socket, 'User ID not found\n');
      if (targetBan.role === 'admin') return safeWrite(client.socket, 'Cannot ban admin\n');
      bannedIds.add(targetBan.id);
      safeWrite(targetBan.socket, 'You have been banned by admin\n');
      targetBan.socket.destroy();
      clients = clients.filter(c => c !== targetBan);
      broadcast(`<announce> User ${targetBan.name} was banned by admin\n`);
      break;
    case '/exit':
    case '/quit':
      safeWrite(client.socket, 'You have left the chat\n');
      client.socket.end();
      break;
    default:
      safeWrite(client.socket, 'Unknown command. Try /help\n');
  }
}

// ==============================
// TLS server
// ==============================
const server = tls.createServer(options, socket => {
  socket.setKeepAlive(true);
  socket.setTimeout(0);
  let client = null;

  socket.on('data', data => {
    let msg;
    try { msg = data.toString().trim(); } catch { return; }
    if (msg === '__PONG__') return;

    if (client && client.waitingForAdminPassword) {
      client.waitingForAdminPassword = false;
      const hash = crypto.createHash('sha256').update(msg).digest('hex');
      if (hash === ADMIN_PASSWORD_HASH) {
        client.role = 'admin';
        safeWrite(socket, 'You are now admin\n');
      } else {
        safeWrite(socket, 'Wrong admin password\n');
      }
      return;
    }

    if (!client) {
      if ([...bannedIds].includes(msg)) { safeWrite(socket, 'You are banned\n'); socket.destroy(); return; }
      client = {
        id: `${String.fromCharCode(65 + Math.floor(Math.random()*26))}${String.fromCharCode(65 + Math.floor(Math.random()*26))}${Math.floor(Math.random()*10)}${Math.floor(Math.random()*10)}`,
        socket,
        name: msg,
        role: 'user',
        waitingForAdminPassword: false
      };
      clients.push(client);
      broadcast(`<announce> [${client.id}] ${client.name} joined\n`, socket);
      safeWrite(socket, `Welcome ${client.name}! Your ID is [${client.id}]\n`);
      return;
    }

    if (msg.startsWith('/')) { handleCommand(msg, client); return; }
    broadcast(`<${client.name}> ${msg}\n`, socket);
  });

  socket.on('close', () => {
    if (!client) return;
    clients = clients.filter(c => c !== client);
    broadcast(`<announce> [${client.id}] ${client.name} left\n`);
  });

  socket.on('error', err => { console.error('Socket error:', err.message); });

  const pingInterval = setInterval(() => {
    if (socket.destroyed) { clearInterval(pingInterval); return; }
    safeWrite(socket, '__PING__\n');
  }, 30000);
});

server.on('error', err => { console.error('Server error:', err.message); });
server.listen(port, () => { console.log(`🔐 Secure chat server running on port ${port}`); });