const tls = require("tls");
const fs = require("fs");
const crypto = require("crypto");

/* ==============================
   Global crash protection
================================ */
process.on("uncaughtException", err => { console.error("Uncaught Exception:", err.message); });
process.on("unhandledRejection", err => { console.error("Unhandled Rejection:", err); });

/* ==============================
   Server configuration
================================ */
const port = process.argv[2] ? parseInt(process.argv[2], 10) : 1599;
const options = {
  key: fs.readFileSync("server.key"),
  cert: fs.readFileSync("server.crt")
};

/* ==============================
   Server state
================================ */
let clients = [];
let bannedIds = new Set();
const ADMIN_PASSWORD_HASH = crypto.createHash("sha256").update("admin123").digest("hex");

/* ==============================
   Safe socket write
================================ */
function safeWrite(socket, message) {
  try {
    if (socket && !socket.destroyed) {
      socket.write(message);
    }
  } catch (err) {
    console.error("Socket write error:", err.message);
  }
}

/* ==============================
   Broadcast message
================================ */
function broadcast(message, exceptSocket = null) {
  clients.forEach(c => {
    if (c.socket !== exceptSocket) {
      safeWrite(c.socket, message);
    }
  });
}

/* ==============================
   Find client by ID
================================ */
function getClientById(id) {
  return clients.find(c => c.id === id);
}

/* ==============================
   Generate unique ID (2 letters + 2 digits)
================================ */
function generateUniqueId(existingIds = new Set()) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let id;
  do {
    const letterPart = letters[Math.floor(Math.random()*26)] + letters[Math.floor(Math.random()*26)];
    const numberPart = String(Math.floor(Math.random()*100)).padStart(2, '0');
    id = letterPart + numberPart;
  } while (existingIds.has(id));
  return id;
}

/* ==============================
   Command handler
================================ */
function handleCommand(cmd, client) {
  const parts = cmd.split(" ");
  const command = parts[0].toLowerCase();

  switch (command) {

    case "/help":
      safeWrite(client.socket, `Commands:
/help           - Show this help message
/users          - List online users
/pm <ID> <msg>  - Send private message
/admin          - Become admin (password required)
/ban <ID>       - Ban user by ID (admin only)
/ping           - Check connection
/exit | /quit   - Leave the chat
`);
      break;

    case "/ping":
      safeWrite(client.socket, "Still connected\n");
      break;

    case "/users":
      safeWrite(client.socket, `Online users (${clients.length}):\n` +
        clients.map(c => `- [${c.id}] ${c.name}${c.role==='admin'?' (admin)':''}`).join("\n") + "\n");
      break;

    case "/pm":
      if (parts.length < 3) {
        safeWrite(client.socket, "Usage: /pm <ID> <message>\n");
        return;
      }
      const targetId = parts[1];
      const target = getClientById(targetId);
      if (!target) {
        safeWrite(client.socket, "User ID not found\n");
        return;
      }
      const message = parts.slice(2).join(" ");
      target.socket.write(`[PRIVATE] From ${client.name}: ${message}\n`);
      safeWrite(client.socket, `[PRIVATE] To ${target.name}: ${message}\n`);
      break;

    case "/admin":
      if (client.role === "admin") {
        safeWrite(client.socket, "You are already admin\n");
        return;
      }
      client.waitingForAdminPassword = true;
      safeWrite(client.socket, "Enter admin password: ");
      break;

    case "/ban":
      if (client.role !== "admin") {
        safeWrite(client.socket, "Permission denied\n");
        return;
      }
      const banId = parts[1];
      const targetBan = getClientById(banId);
      if (!targetBan) {
        safeWrite(client.socket, "User ID not found\n");
        return;
      }
      if (targetBan.role === "admin") {
        safeWrite(client.socket, "Cannot ban admin\n");
        return;
      }
      bannedIds.add(targetBan.id);
      safeWrite(targetBan.socket, "You have been banned by admin\n");
      targetBan.socket.destroy();
      clients = clients.filter(c => c !== targetBan);
      broadcast(`<announce> User ${targetBan.name} was banned by admin\n`);
      break;

    case "/exit":
    case "/quit":
      safeWrite(client.socket, "You have left the chat\n");
      client.socket.end();
      break;

    default:
      safeWrite(client.socket, "Unknown command. Try /help\n");
  }
}

/* ==============================
   TLS server
================================ */
const server = tls.createServer(options, socket => {
  socket.setKeepAlive(true);
  socket.setTimeout(0);

  let client = null;

  socket.on("data", data => {
    let msg;
    try { msg = data.toString().trim(); } catch { return; }

    // Ignore keep-alive pong
    if (msg === "__PONG__") return;

    // Admin password input
    if (client && client.waitingForAdminPassword) {
      client.waitingForAdminPassword = false;
      const hash = crypto.createHash("sha256").update(msg).digest("hex");
      if (hash === ADMIN_PASSWORD_HASH) {
        client.role = "admin";
        safeWrite(socket, "You are now admin\n");
      } else {
        safeWrite(socket, "Wrong admin password\n");
      }
      return;
    }

    // First message = username
    if (!client) {
      if ([...bannedIds].includes(msg)) {
        safeWrite(socket, "You are banned from this server\n");
        socket.destroy();
        return;
      }

      const existingIds = new Set(clients.map(c => c.id));
      const id = process.env.CHAT_USER_ID || generateUniqueId(existingIds);

      client = {
        id: id,
        socket: socket,
        name: msg,
        role: "user",
        waitingForAdminPassword: false
      };

      clients.push(client);
      broadcast(`<announce> [${client.id}] ${client.name} joined the chat\n`, socket);
      safeWrite(socket, `Welcome ${client.name}! Your ID is [${client.id}]\n`);
      return;
    }

    // Commands
    if (msg.startsWith("/")) {
      handleCommand(msg, client);
      return;
    }

    // Regular chat message
    broadcast(`<${client.name}> ${msg}\n`, socket);
  });

  // Handle disconnect safely
  socket.on("close", () => {
    if (!client) return;
    clients = clients.filter(c => c !== client);
    broadcast(`<announce> [${client.id}] ${client.name} left the chat\n`);
  });

  socket.on("error", err => {
    console.error("Socket error:", err.message);
  });

  // Keep-alive ping
  const pingInterval = setInterval(() => {
    if (socket.destroyed) {
      clearInterval(pingInterval);
      return;
    }
    safeWrite(socket, "__PING__\n");
  }, 30000);
});

/* ==============================
   Start server safely
================================ */
server.on("error", err => {
  console.error("Server error:", err.message);
});
server.listen(port, () => {
  console.log(`🔐 Secure chat server running on port ${port}`);
});