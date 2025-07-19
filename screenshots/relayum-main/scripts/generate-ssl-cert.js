const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const certDir = path.join(__dirname, '..', 'ssl');

// Create ssl directory if it doesn't exist
if (!fs.existsSync(certDir)) {
  fs.mkdirSync(certDir, { recursive: true });
}

const keyPath = path.join(certDir, 'server.key');
const certPath = path.join(certDir, 'server.crt');

// Generate self-signed certificate
try {
  console.log('Generating self-signed SSL certificate...');
  
  execSync(`openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/C=SE/ST=Stockholm/L=Stockholm/O=Relayum/CN=localhost" -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:192.168.1.220"`, {
    stdio: 'inherit'
  });
  
  console.log('SSL certificate generated successfully!');
  console.log(`Key: ${keyPath}`);
  console.log(`Certificate: ${certPath}`);
  
} catch (error) {
  console.error('Error generating SSL certificate:', error.message);
  process.exit(1);
}