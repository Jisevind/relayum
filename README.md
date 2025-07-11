# Relayum

A secure, self-hosted file sharing platform built with Docker. Upload, organize, and share files with encrypted storage and virus scanning capabilities.

## Overview

Relayum is a modern file sharing application designed for individuals and teams who need secure file management and sharing. Built with React and Node.js, it provides a clean web interface for file operations with enterprise-grade security features.

**Key Features:**
- Secure file upload and storage with AES-256 encryption
- Public and private file sharing with expiration dates
- Folder organization with drag-and-drop interface
- Integrated virus scanning (ClamAV)
- User authentication and admin management
- Storage quotas and usage tracking
- Dark/light theme support

## Quick Start

1. **Download configuration:**
   ```bash
   wget https://raw.githubusercontent.com/relayum/relayum/main/.env.example
   wget https://raw.githubusercontent.com/relayum/relayum/main/docker-compose.yml
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings (see Security section below)
   ```

3. **Deploy:**
   ```bash
   docker-compose up -d
   ```

4. **Access:** Open `http://localhost:3020`

## Security Configuration

**IMPORTANT:** Change these required settings in your `.env` file:

```env
# Database password
DB_PASSWORD=your_secure_password

# JWT secrets (generate with: openssl rand -hex 32)
JWT_SECRET=your_32_character_jwt_secret_here
JWT_REFRESH_SECRET=your_32_character_refresh_secret_here

# Metadata encryption key (generate with: openssl rand -hex 32)
METADATA_ENCRYPTION_KEY=your_32_character_metadata_key_here

# Admin account
ADMIN_USERNAME=your_admin_username
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your_admin_password

# Domain (for production)
CORS_ALLOWED_ORIGINS=https://yourdomain.com
```

## Requirements

- Docker 20.10+
- Docker Compose 2.0+
- 2GB RAM (4GB recommended with virus scanning)
- 10GB+ disk space

## Architecture

- **Frontend:** React 18 with Material-UI
- **Backend:** Node.js with Express
- **Database:** PostgreSQL 15
- **Security:** AES-256 encryption, JWT authentication, rate limiting
- **Virus Scanner:** ClamAV (optional)

## Beta Software Notice

**WARNING: This software is in beta and under active development.**

- Not recommended for production use without thorough testing
- Database schema and API may change between versions
- Security features are implemented but not independently audited
- Use at your own risk and always maintain backups

**For production deployments:**
- Test thoroughly in a staging environment
- Implement proper backup strategies
- Monitor security advisories
- Consider professional security audit

## Documentation

- **Environment Variables:** [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md)
- **Deployment Guide:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Contributing

This project is in early development. Contributions, bug reports, and feature requests are welcome through GitHub Issues.

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- GitHub Issues: Report bugs and request features
- Security Issues: Report privately to maintain responsible disclosure

---

**Use at your own risk. Always maintain proper backups and test in non-production environments first.**