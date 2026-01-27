const tls = require('tls');
const readline = require('readline');

// ------------------------------
// Create readline interface for terminal input/output
// ------------------------------
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

// ------------------------------
// Ask user for server IP
// ------------------------------
rl.question('Enter server IP: ', host => {

  // ------------------------------
  // Ask user for server port
  // ------------------------------
  rl.question('Enter server port: ', port => {

    // ------------------------------
    // Connect to TLS server
    // ------------------------------
    const socket = tls.connect(
      { host, port: Number(port), rejectUnauthorized: false },
      () => {
        console.log('Connected to server');

        // ------------------------------
        // Ask user for username
        // ------------------------------
        rl.question('Enter your name: ', name => {
          socket.write(name + '\n');  // Send username to server
          rl.prompt();                // Show prompt
        });
      }
    );

    // ------------------------------
    // Handle incoming messages from server
    // ------------------------------
    socket.on('data', data => {
      const message = data.toString().trim();

      // Respond to server ping automatically
      if (message === '__PING__') {
        socket.write('__PONG__\n');
        return;
      }

      // Print server message before prompt
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

  });

});