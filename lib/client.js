const tls = require('tls');
const readline = require('readline');

// ------------------------------
// Read environment variables if provided (from terminal-chat CLI)
// ------------------------------
const envHost = process.env.CHAT_SERVER_HOST;
const envPort = process.env.CHAT_SERVER_PORT;
const envName = process.env.CHAT_USER_NAME;
const envId = process.env.CHAT_USER_ID;

// ------------------------------
// Create readline interface for terminal input/output
// ------------------------------
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

// ------------------------------
// Function to start connection
// ------------------------------
function startConnection(host, port, name, userId) {
  const socket = tls.connect(
    { host, port: Number(port), rejectUnauthorized: false },
    () => {
      console.log('Connected to server');
      socket.write(name + '\n'); // Send username to server
      rl.prompt();
    }
  );

  // ------------------------------
  // Handle incoming messages from server
  // ------------------------------
  socket.on('data', data => {
    const message = data.toString().trim();
    if (message === '__PING__') {
      socket.write('__PONG__\n');
      return;
    }
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
}

// ------------------------------
// Decide whether to use environment variables or ask user input
// ------------------------------
if (envHost && envPort && envName && envId) {
  console.log(`\nYour user ID: ${envId}`);
  startConnection(envHost, envPort, envName, envId);
} else {
  // Ask user for server IP, port, and name
  rl.question('Enter server IP: ', host => {
    rl.question('Enter server port: ', port => {
      rl.question('Enter your name: ', name => {
        startConnection(host, port, name, null);
      });
    });
  });
}