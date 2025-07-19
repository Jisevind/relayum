const db = require('../models/database');

async function addSampleThreats() {
  try {
    console.log('Adding sample threat data...');
    
    // Add sample scan history
    const scanHistory = [
      {
        file_name: 'suspicious-file.exe',
        file_size: 1024000,
        mime_type: 'application/octet-stream',
        scan_status: 'infected',
        threat_name: 'Trojan.Win32.Malware',
        scan_duration_ms: 1250,
        scanned_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
      },
      {
        file_name: 'virus-test.com',
        file_size: 68,
        mime_type: 'text/plain',
        scan_status: 'infected',
        threat_name: 'EICAR-Test-File',
        scan_duration_ms: 45,
        scanned_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
      },
      {
        file_name: 'clean-document.pdf',
        file_size: 2048000,
        mime_type: 'application/pdf',
        scan_status: 'clean',
        threat_name: null,
        scan_duration_ms: 2100,
        scanned_at: new Date(Date.now() - 3 * 60 * 60 * 1000) // 3 hours ago
      },
      {
        file_name: 'malicious-script.js',
        file_size: 15000,
        mime_type: 'application/javascript',
        scan_status: 'infected',
        threat_name: 'JS.Downloader',
        scan_duration_ms: 890,
        scanned_at: new Date(Date.now() - 1 * 60 * 60 * 1000) // 1 hour ago
      },
      {
        file_name: 'normal-image.jpg',
        file_size: 512000,
        mime_type: 'image/jpeg',
        scan_status: 'clean',
        threat_name: null,
        scan_duration_ms: 340,
        scanned_at: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
      }
    ];
    
    for (const scan of scanHistory) {
      await db.query(`
        INSERT INTO scan_history (file_name, file_size, mime_type, scan_status, threat_name, scan_duration_ms, scanned_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [scan.file_name, scan.file_size, scan.mime_type, scan.scan_status, scan.threat_name, scan.scan_duration_ms, scan.scanned_at]);
    }
    
    // Add sample quarantine files
    const quarantineFiles = [
      {
        original_filename: 'suspicious-file.exe',
        file_path: '/quarantine/suspicious-file.exe',
        file_size: 1024000,
        mime_type: 'application/octet-stream',
        threat_name: 'Trojan.Win32.Malware',
        status: 'quarantined',
        quarantined_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        file_hash: 'abc123def456'
      },
      {
        original_filename: 'virus-test.com',
        file_path: '/quarantine/virus-test.com',
        file_size: 68,
        mime_type: 'text/plain',
        threat_name: 'EICAR-Test-File',
        status: 'confirmed_threat',
        quarantined_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        reviewed_at: new Date(Date.now() - 12 * 60 * 60 * 1000),
        file_hash: 'def789ghi012'
      },
      {
        original_filename: 'malicious-script.js',
        file_path: '/quarantine/malicious-script.js',
        file_size: 15000,
        mime_type: 'application/javascript',
        threat_name: 'JS.Downloader',
        status: 'quarantined',
        quarantined_at: new Date(Date.now() - 1 * 60 * 60 * 1000),
        file_hash: 'ghi345jkl678'
      }
    ];
    
    for (const file of quarantineFiles) {
      await db.query(`
        INSERT INTO quarantine_files (original_filename, file_path, file_size, mime_type, threat_name, status, quarantined_at, reviewed_at, file_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [file.original_filename, file.file_path, file.file_size, file.mime_type, file.threat_name, file.status, file.quarantined_at, file.reviewed_at, file.file_hash]);
    }
    
    console.log('Sample threat data added successfully!');
    console.log('- Added 5 scan history entries');
    console.log('- Added 3 quarantine files');
  } catch (error) {
    console.error('Error adding sample threat data:', error);
  }
}

if (require.main === module) {
  addSampleThreats().then(() => {
    console.log('Done!');
    process.exit(0);
  }).catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
  });
}

module.exports = addSampleThreats;