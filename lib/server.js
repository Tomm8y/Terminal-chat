const tls = require("tls");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/* ==============================
   Global crash protection
================================ */
process.on("uncaughtException", err => console.error("Uncaught Exception:", err.message));
process.on("unhandledRejection", err => console.error("Unhandled Rejection:", err));

/* ==============================
   Server configuration
================================ */
const port = process.argv[2] ? parseInt(process.argv[2], 10) : 1599;

const options = {
  key: fs.readFileSync(path.join(__dirname, "server.key")),
  cert: fs.readFileSync(path.join(__dirname, "server.crt"))
};

const ADMIN_PASSWORD_HASH = crypto
  .createHash("sha256")
  .update(process.env.ADMIN_PASSWORD || "change_me")
  .digest("hex");

/* ==============================
   Server state
================================ */
let clients = [];
let bannedIds = new Set();

/* ==============================
   Utilities
================================ */
function safeWrite(socket, message) {
  if (socket && !socket.destroyed) {
    try { socket.write(message); } catch {}
  }
}

function broadcast(message, exceptSocket = null) {
  clients.forEach(c => {
    if (c.socket !== exceptSocket) safeWrite(c.socket, message);
  });
}

function getClientById(id) {
  return clients.find(c => c.id === id);
}

/* ==============================
   Command handler
================================ */
function handleCommand(msg, client) {
  const parts = msg.split(" ");
  const command = parts[0].toLowerCase();

  switch (command) {
    case "/help":
      safeWrite(client.socket, `Commands:
/help
/users
/pm <ID> <msg>
/admin
/ban <ID>
/ping
/exit | /quit
`);
      break;

    case "/ping":
      safeWrite(client.socket, "Still connected\n");
      break;

    case "/users":
      safeWrite(
        client.socket,
        `Online users (${clients.length}):\n` +
        clients.map(c =>
          `- [${c.id}] ${c.name}${c.role === "admin" ? " (admin)" : ""}`
        ).join("\n") + "\n"
      );
      break;

    case "/pm":
      if (parts.length < 3) {
        safeWrite(client.socket, "Usage: /pm <ID> <message>\n");
        return;
      }
      const target = getClientById(parts[1]);
      if (!target) {
        safeWrite(client.socket, "User ID not found\n");
        return;
      }
      const privateMsg = parts.slice(2).join(" ");
      safeWrite(target.socket, `[PRIVATE] From ${client.name}: ${privateMsg}\n`);
      safeWrite(client.socket, `[PRIVATE] To ${target.name}: ${privateMsg}\n`);
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
      const banTarget = getClientById(parts[1]);
      if (!banTarget) {
        safeWrite(client.socket, "User ID not found\n");
        return;
      }
      if (banTarget.role === "admin") {
        safeWrite(client.socket, "Cannot ban admin\n");
        return;
      }
      bannedIds.add(banTarget.id);
      safeWrite(banTarget.socket, "You have been banned\n");
      banTarget.socket.destroy();
      break;

    case "/exit":
    case "/quit":
      safeWrite(client.socket, "You have left the chat\n");
      client.socket.end();
      break;

    default:
      safeWrite(client.socket, "Unknown command\n");
  }
}

/* ==============================
   TLS Server
================================ */
const server = tls.createServer(options, socket => {
  socket.setKeepAlive(true);

  let client = null;
  let buffer = "";

  const pingInterval = setInterval(() => {
    if (!socket.destroyed) safeWrite(socket, "__PING__\n");
  }, 30000);

  socket.on("data", data => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();

    lines.forEach(raw => {
      const msg = raw.trim();
      if (!msg || msg === "__PONG__") return;

      // First message must be JSON { name, userId }
      if (!client) {
        let parsed;
        try {
          parsed = JSON.parse(msg);
        } catch {
          socket.destroy();
          return;
        }

        const { name, userId } = parsed;
        if (!name || !userId) {
          socket.destroy();
          return;
        }

        if (bannedIds.has(userId)) {
          safeWrite(socket, "You are banned\n");
          socket.destroy();
          return;
        }

        client = {
          id: userId,
          name,
          socket,
          role: "user",
          waitingForAdminPassword: false
        };

        clients.push(client);
        broadcast(`<announce> [${client.id}] ${client.name} joined\n`, socket);
        safeWrite(socket, `Welcome ${client.name}! Your ID: [${client.id}]\n`);
        return;
      }

      if (client.waitingForAdminPassword) {
        client.waitingForAdminPassword = false;
        const hash = crypto.createHash("sha256").update(msg).digest("hex");
        if (hash === ADMIN_PASSWORD_HASH) {
          client.role = "admin";
          safeWrite(socket, "You are now admin\n");
        } else {
          safeWrite(socket, "Wrong password\n");
        }
        return;
      }

      if (msg.startsWith("/")) {
        handleCommand(msg, client);
      } else {
        broadcast(`<${client.name}> ${msg}\n`, socket);
      }
    });
  });

  socket.on("close", () => {
    clearInterval(pingInterval);
    if (!client) return;
    clients = clients.filter(c => c !== client);
    broadcast(`<announce> [${client.id}] ${client.name} left\n`);
  });

  socket.on("error", () => {});
});

server.listen(port, () => {
  console.log(`🔐 Secure chat server running on port ${port}`);
});