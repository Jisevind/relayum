# Relayum - Secure File Sharing Platform

A modern, secure file sharing application with virus scanning, user authentication, and both public and private sharing capabilities.

## Features

- 🔐 **Secure Authentication** - JWT-based user management
- 📁 **File & Folder Management** - Drag-and-drop uploads with folder organization
- 🔗 **Flexible Sharing** - Public and private sharing with expiration dates
- 🦠 **Virus Scanning** - Integrated ClamAV scanning for uploaded files
- 📱 **Responsive Design** - Material-UI interface that works on all devices
- 🛡️ **Security First** - Rate limiting, encryption, and comprehensive security headers
- 🔔 **Notifications** - Real-time notifications for shares and activities
- 👥 **Admin Panel** - Complete administration interface
- 🌐 **Anonymous Sharing** - Optional anonymous file sharing
- 📊 **Usage Analytics** - Storage quotas and usage tracking

## Quick Start

### One-Line Deployment

```bash
curl -fsSL https://raw.githubusercontent.com/relayum/relayum/main/deploy.sh | bash
```

### Manual Deployment

1. **Download configuration:**
   ```bash
   mkdir relayum && cd relayum
   wget https://raw.githubusercontent.com/relayum/relayum/main/docker-compose.yml
   wget https://raw.githubusercontent.com/relayum/relayum/main/.env.example
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   nano .env  # Edit with your settings
   ```

3. **Deploy:**
   ```bash
   # With virus scanning (recommended)
   docker-compose --profile clamav up -d
   
   # Without virus scanning
   docker-compose up -d
   ```

4. **Access:** Open `http://localhost:3020`

## Requirements

- Docker 20.10+
- Docker Compose 2.0+
- 2GB+ RAM (4GB+ with virus scanning)
- 10GB+ disk space

## Configuration

### Required Settings

Edit `.env` file with these **required** changes:

```env
# Database password
DB_PASSWORD=your_secure_password

# JWT secrets (32+ characters each)
JWT_SECRET=your_jwt_secret_key_at_least_32_characters_long
JWT_REFRESH_SECRET=your_jwt_refresh_secret_key_at_least_32_characters_long

# Admin account
ADMIN_USERNAME=your_admin_username
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your_admin_password

# Domain configuration
CORS_ALLOWED_ORIGINS=https://yourdomain.com
```

## Security Features

- **Multi-layer Security:** Helmet.js, CORS, rate limiting, input validation
- **Encrypted Storage:** File encryption with secure key management
- **Virus Scanning:** Real-time ClamAV integration
- **Access Control:** Role-based permissions and share controls
- **Audit Logging:** Comprehensive activity logging
- **Secure Headers:** CSP, HSTS, and other security headers

## Architecture

- **Frontend:** React 18 with Material-UI
- **Backend:** Node.js with Express
- **Database:** PostgreSQL 15
- **Virus Scanner:** ClamAV (optional)
- **Container:** Docker with multi-stage builds

## Management

```bash
# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Update to latest version
docker-compose pull
docker-compose up -d

# Stop services
docker-compose down
```


## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues:** [GitHub Issues](https://github.com/relayum/relayum/issues)
- **Documentation:** [Wiki](https://github.com/relayum/relayum/wiki)
- **Security:** Report security issues privately

---

**Made with ❤️ for secure file sharing**