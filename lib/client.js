const tls = require("tls");
const readline = require("readline");

const host = process.env.CHAT_SERVER_HOST;
const port = process.env.CHAT_SERVER_PORT;
const name = process.env.CHAT_USER_NAME;
const userId = process.env.CHAT_USER_ID;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> "
});

function startConnection() {
  const socket = tls.connect(
    { host, port: Number(port), rejectUnauthorized: false },
    () => {
      console.log("Connected to server");

      // Send JSON with name + userId
      socket.write(JSON.stringify({ name, userId }) + "\n");
      rl.prompt();
    }
  );

  let buffer = "";

  socket.on("data", data => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();

    lines.forEach(msg => {
      msg = msg.trim();
      if (!msg) return;

      if (msg === "__PING__") {
        socket.write("__PONG__\n");
        return;
      }

      process.stdout.clearLine();
      process.stdout.cursorTo(0);
      console.log(msg);
      rl.prompt(true);
    });
  });

  rl.on("line", line => {
    socket.write(line + "\n");
    rl.prompt();
  });

  socket.on("end", () => {
    console.log("Disconnected");
    process.exit(0);
  });

  socket.on("error", err => {
    console.error("Connection error:", err.message);
    process.exit(1);
  });
}

if (host && port && name && userId) {
  startConnection();
} else {
  console.log("Missing environment variables.");
  process.exit(1);
}