const fs = require('fs');
const path = require('path');
const { getQuarantineService } = require('./services/quarantineService');

async function testQuarantine() {
  console.log('🧪 Testing quarantine functionality...');
  
  try {
    // Create a test infected file
    const testFile = path.join(__dirname, 'test-infected.txt');
    fs.writeFileSync(testFile, 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
    
    console.log('✅ Test file created');
    
    // Initialize quarantine service
    const quarantineService = getQuarantineService();
    await quarantineService.initialize();
    
    console.log('✅ Quarantine service initialized');
    
    // Test quarantine functionality
    const quarantineResult = await quarantineService.quarantineFile(testFile, {
      originalFilename: 'test-infected.txt',
      fileSize: fs.statSync(testFile).size,
      mimeType: 'text/plain',
      threat: 'EICAR-Test-File',
      uploaderId: 1, // Assuming admin user ID
      scanResult: {
        status: 'infected',
        clean: false,
        threat: 'EICAR-Test-File',
        scanTime: 100,
        engine: 'test'
      }
    });
    
    console.log('✅ File quarantined successfully:', quarantineResult);
    
    // Check if file was moved to quarantine
    const quarantinePath = quarantineResult.quarantinePath;
    if (fs.existsSync(quarantinePath)) {
      console.log('✅ File exists in quarantine:', quarantinePath);
    } else {
      console.log('❌ File not found in quarantine');
    }
    
    // Test getting quarantine info
    const info = await quarantineService.getQuarantineFileInfo(quarantineResult.quarantineId);
    console.log('✅ Quarantine info retrieved:', {
      id: info.id,
      filename: info.original_filename,
      threat: info.threat_name,
      status: info.status
    });
    
    // Test quarantine stats
    const stats = await quarantineService.getQuarantineStats();
    console.log('✅ Quarantine stats:', stats);
    
    console.log('🎉 All quarantine tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testQuarantine().then(() => {
  console.log('Test completed');
  process.exit(0);
}).catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});