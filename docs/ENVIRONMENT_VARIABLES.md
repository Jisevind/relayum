# Relayum Environment Variables Guide

This document explains all the environment variables available in the Relayum Docker Compose configuration.

## 🔧 Core Application Settings

### Basic Configuration
- **`NODE_ENV`** - Application environment (`production`, `development`)
- **`PORT`** - Internal container port (default: `3000`)
- **`TZ`** - Timezone setting (default: `UTC`)

## 🗄️ Database Configuration

- **`DB_HOST`** - Database hostname (default: `postgres`)
- **`DB_PORT`** - Database port (default: `5432`)
- **`DB_NAME`** - Database name (default: `relayum`)
- **`DB_USER`** - Database username (default: `relayum_user`)
- **`DB_PASSWORD`** - Database password (**REQUIRED** - change from default)

## 🔐 Security & Authentication

### JWT Configuration
- **`JWT_SECRET`** - Secret key for JWT tokens (**REQUIRED** - 32+ characters)
- **`JWT_REFRESH_SECRET`** - Secret key for refresh tokens (**REQUIRED** - 32+ characters)

### Admin Account
- **`ADMIN_USERNAME`** - Initial admin username (**REQUIRED**)
- **`ADMIN_EMAIL`** - Initial admin email (**REQUIRED**)
- **`ADMIN_PASSWORD`** - Initial admin password (**REQUIRED**)
- **`ADMIN_OVERRIDE_ENABLED`** - Allow admin to override user limits (default: `true`)

### Access Control
- **`ALLOW_REGISTRATION`** - Allow new user registration (default: `false`)
- **`LOGIN_ATTEMPT_LIMIT`** - Max failed login attempts before lockout (default: `5`)
- **`LOGIN_BLOCK_DURATION`** - Lockout duration in milliseconds (default: `900000` = 15 min)

## 📁 File Storage & Limits

### File Size Limits
- **`MAX_FILE_SIZE`** - Maximum individual file size (default: `2GB`)
- **`MAX_DOWNLOAD_SIZE`** - Maximum download package size (default: `10GB`)
- **`DEFAULT_DISK_QUOTA`** - Default user storage quota (default: `50GB`)

### File Security
- **`FILE_BLACKLIST`** - Blocked file extensions (default: `.bat,.sh,.cmd,.scr,.vbs,.jar,.com,.pif,.exe,.msi`)
- **`DEFAULT_FILE_EXPIRATION_DAYS`** - Default file retention period (default: `90` days)

### Storage Configuration
- **`UPLOAD_PATH`** - File storage directory inside container (default: `./uploads`)

## 🌐 Network & CORS

- **`CORS_ALLOWED_ORIGINS`** - Comma-separated list of allowed origins for CORS
- **`HTTPS`** - Enable HTTPS mode features (default: `true`)

## 🚀 Performance & Streaming

- **`STREAM_CHUNK_SIZE`** - File streaming chunk size in bytes (default: `65536`)
- **`STREAM_BUFFER_SIZE`** - File streaming buffer size in bytes (default: `131072`)

## 🔄 Rate Limiting

### General Rate Limits
- **`RATE_LIMIT_WINDOW_MS`** - Rate limit time window (default: `900000` = 15 min)
- **`RATE_LIMIT_RETRY_AFTER`** - Retry-after header value in seconds (default: `900`)

### Specific Rate Limits (requests per window)
- **`AUTH_RATE_LIMIT_MAX`** - Authentication endpoints (default: `5`)
- **`UPLOAD_RATE_LIMIT_MAX_PROD`** - File uploads in production (default: `20`)
- **`PUBLIC_SHARE_RATE_LIMIT_MAX`** - Public share access (default: `50`)
- **`GENERAL_RATE_LIMIT_MAX_PROD`** - General API endpoints (default: `500`)

## 🔗 Anonymous Sharing

- **`ALLOW_ANONYMOUS_SHARING`** - Enable anonymous file sharing (default: `false`)
- **`ANONYMOUS_SHARE_EXPIRATION_DAYS`** - Anonymous share retention (default: `7` days)
- **`ANONYMOUS_SHARE_MAX_ACCESS`** - Max accesses per anonymous share (default: `50`)
- **`ANONYMOUS_MAX_FILE_SIZE`** - Max file size for anonymous uploads (default: `100MB`)

## 🦠 Virus Scanning (ClamAV)

### Basic Configuration
- **`ENABLE_VIRUS_SCANNING`** - Enable virus scanning feature (default: `true`)
- **`CLAMAV_HOST`** - ClamAV service hostname (default: `clamav`)
- **`CLAMAV_PORT`** - ClamAV service port (default: `3310`)
- **`CLAMAV_TIMEOUT`** - ClamAV connection timeout in ms (default: `60000`)
- **`CLAMAV_REQUIRED`** - Block uploads if ClamAV unavailable (default: `true`)

### Scanning Configuration
- **`VIRUS_SCAN_MODE`** - Scanning mode: `sync` or `async` (default: `async`)
- **`VIRUS_SCAN_MAX_FILE_SIZE`** - Max file size to scan (default: `1GB`)

### ClamAV Service Settings
- **`CLAMAV_STARTUP_TIMEOUT`** - ClamAV startup timeout in seconds (default: `90`)
- **`CLAMD_CONF_StreamMaxLength`** - Max stream length (default: `1G`)
- **`CLAMD_CONF_MaxFileSize`** - Max file size to scan (default: `1G`)
- **`CLAMD_CONF_MaxScanTime`** - Max scan time in ms (default: `60000`)

## 🎨 UI Configuration

- **`ENABLE_LANDING_PAGE`** - Show landing page instead of direct login (default: `false`)

## 📝 Logging

- **`LOG_DIRECTORY`** - Log file directory (default: `logs`)

## 🛡️ Security Headers

- **`DISABLE_SECURITY_HEADERS`** - Disable security headers (default: `false`)

## 📱 React App Settings

### API Configuration
- **`REACT_APP_API_TIMEOUT_MS`** - API request timeout (default: `30000`)

### Virus Scanner UI
- **`REACT_APP_VIRUS_SCANNER_POLL_INTERVAL`** - Status polling interval (default: `120000`)
- **`REACT_APP_VIRUS_SCANNER_STATS_INTERVAL`** - Stats update interval (default: `600000`)

---

## 💡 Quick Setup Tips

### Minimal Required Configuration
```env
# Security (REQUIRED)
DB_PASSWORD=your_secure_password
JWT_SECRET=your_32_char_jwt_secret_here
JWT_REFRESH_SECRET=your_32_char_refresh_secret_here

# Admin Account (REQUIRED)
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your_admin_password

# Network (for external access)
CORS_ALLOWED_ORIGINS=http://your-server-ip:3020
```

### For Local Development
```env
# Add these for local testing
CORS_ALLOWED_ORIGINS=http://localhost:3020,http://192.168.1.40:3020
ENABLE_VIRUS_SCANNING=false
CLAMAV_REQUIRED=false
DISABLE_SECURITY_HEADERS=true
HTTPS=false
```

### For Production
```env
# Production security
ALLOW_REGISTRATION=false
ALLOW_ANONYMOUS_SHARING=false
HTTPS=true
ENABLE_VIRUS_SCANNING=true
DISABLE_SECURITY_HEADERS=false
```

---

**Note**: Environment variables marked as **REQUIRED** must be changed from their defaults for security. Variables with defaults will work out-of-the-box but can be customized as needed.