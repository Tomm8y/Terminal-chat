const tls = require('tls');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ==============================
// TLS server options
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
let bannedIds = new Set();
const ADMIN_PASSWORD_HASH = crypto.createHash('sha256').update('admin123').digest('hex');

// ==============================
// Helper functions
// ==============================
function safeWrite(socket, message) { try { if (socket && !socket.destroyed) socket.write(message); } catch {} }
function broadcast(message, exceptSocket = null) { clients.forEach(c => { if (c.socket !== exceptSocket) safeWrite(c.socket, message); }); }
function getClientById(id) { return clients.find(c => c.id === id); }

// ==============================
// Command handler
// ==============================
function handleCommand(cmd, client) {
  const parts = cmd.split(' ');
  const command = parts[0].toLowerCase();

  switch (command) {
    case '/help':
      safeWrite(client.socket, `Commands:\n/help\n/users\n/pm <ID> <msg>\n/admin\n/ban <ID>\n/ping\n/exit | /quit\n`);
      break;
    case '/ping':
      safeWrite(client.socket, 'Still connected\n');
      break;
    case '/users':
      safeWrite(client.socket, `Online users (${clients.length}):\n` +
        clients.map(c => `- [${c.id}] ${c.name}${c.role==='admin'?' (admin)':''}`).join('\n') + '\n');
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
      bannedIds.add(targetBan.id);
      safeWrite(targetBan.socket, 'You have been banned by admin\n');
      targetBan.socket.destroy();
      clients = clients.filter(c => c !== targetBan);
      broadcast(`<announce> User ${targetBan.name} was banned\n`);
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

    // Initial handshake with name, id, key
    if (!client) {
      try {
        const obj = JSON.parse(msg);
        if ([...bannedIds].includes(obj.id)) { safeWrite(socket, 'You are banned\n'); socket.destroy(); return; }
        client = { ...obj, socket, role: 'user', waitingForAdminPassword: false };
        clients.push(client);
        broadcast(`<announce> [${client.id}] ${client.name} joined\n`, socket);
        safeWrite(socket, `Welcome ${client.name}! Your ID is [${client.id}]\n`);
      } catch {
        safeWrite(socket, 'Invalid handshake\n'); socket.destroy();
      }
      return;
    }

    // Handle commands
    if (msg.startsWith('/')) { handleCommand(msg, client); return; }

    // Otherwise, broadcast as public message
    try {
      const obj = JSON.parse(msg);
      if (obj.type === 'pm') {
        // Forward encrypted PM without decrypting
        const target = getClientById(obj.to);
        if (!target) { safeWrite(client.socket, 'User ID not found\n'); return; }
        safeWrite(target.socket, msg + '\n');
      }
    } catch {
      broadcast(`<${client.name}> ${msg}\n`, socket);
    }
  });

  socket.on('close', () => {
    if (!client) return;
    clients = clients.filter(c => c !== client);
    broadcast(`<announce> [${client.id}] ${client.name} left\n`);
  });

  socket.on('error', err => { console.error('Socket error:', err.message); });

  const pingInterval = setInterval(() => { if (socket.destroyed) clearInterval(pingInterval); else safeWrite(socket, '__PING__\n'); }, 30000);
});

server.on('error', err => { console.error('Server error:', err.message); });
server.listen(port, () => { console.log(`🔐 Secure chat server running on port ${port}`); });