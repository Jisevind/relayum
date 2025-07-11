# Relayum Portable Deployment Guide

This guide explains how to deploy Relayum on any Docker-compatible system using pre-built images from GitHub Container Registry.

## 🚀 Quick Start

### Option 1: One-Line Deployment (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/relayum/relayum/main/deploy.sh | bash
```

### Option 2: Manual Deployment

1. **Download configuration files:**
   ```bash
   mkdir relayum-deployment && cd relayum-deployment
   wget https://raw.githubusercontent.com/relayum/relayum/main/docker-compose.yml
   ```

2. **Create environment configuration:**
   ```bash
   wget https://raw.githubusercontent.com/relayum/relayum/main/.env.example
   cp .env.example .env
   nano .env  # Edit with your configuration
   ```

3. **Deploy with virus scanning:**
   ```bash
   docker-compose --profile clamav up -d
   ```

   **Or without virus scanning:**
   ```bash
   docker-compose up -d
   ```

## 📋 Prerequisites

- Docker 20.10+ with Docker Compose
- 2GB+ RAM (4GB+ recommended with virus scanning)
- 10GB+ disk space
- Internet connection for initial image download

## 🔧 Configuration

### Required Environment Variables

Edit `.env` file with these **required** changes:

```env
# Database Security
DB_PASSWORD=your_secure_database_password_here

# JWT Security (32+ characters each)
JWT_SECRET=your_super_secure_jwt_secret_key_at_least_32_characters_long
JWT_REFRESH_SECRET=your_super_secure_jwt_refresh_secret_key_at_least_32_characters_long

# Admin Account
ADMIN_USERNAME=your_admin_username
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your_secure_admin_password

# Domain Configuration
CORS_ALLOWED_ORIGINS=https://yourdomain.com,http://localhost:3020
```

### Optional Configuration

```env
# File Upload Limits
MAX_FILE_SIZE=2GB
DEFAULT_DISK_QUOTA=50GB

# Security Settings
ALLOW_REGISTRATION=false
ALLOW_ANONYMOUS_SHARING=false

# Virus Scanning
ENABLE_VIRUS_SCANNING=true
CLAMAV_REQUIRED=false
```

## 🌐 Access

- **Web Interface:** `http://localhost:3020`
- **Admin Panel:** Login with configured admin credentials
- **API Endpoints:** `http://localhost:3020/api/*`

## 📊 Management Commands

```bash
# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Update to latest version
docker-compose pull
docker-compose up -d

# Backup data
docker run --rm -v relayum_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/relayum-backup.tar.gz /data
```

## 🛡️ Security Considerations

### Production Security Checklist

- [ ] Change all default passwords and secrets
- [ ] Use strong JWT secrets (32+ characters)
- [ ] Configure CORS for your domain only
- [ ] Enable virus scanning for file uploads
- [ ] Set up HTTPS with reverse proxy (nginx/traefik)
- [ ] Bind database to localhost only
- [ ] Disable anonymous sharing if not needed
- [ ] Regular security updates
- [ ] Monitor logs for suspicious activity

### Reverse Proxy Configuration

For production use, set up a reverse proxy:

**Nginx Example:**
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3020;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🔄 Updates and Maintenance

### Updating Relayum

```bash
# Pull latest images
docker-compose pull

# Recreate containers with new images
docker-compose up -d

# Clean up old images
docker image prune -f
```

### Backup and Restore

**Backup:**
```bash
# Create backup directory
mkdir -p backups

# Backup database
docker exec relayum-postgres pg_dump -U relayum_user relayum > backups/database.sql

# Backup uploads
docker run --rm -v relayum_uploads:/data -v $(pwd)/backups:/backup alpine tar czf /backup/uploads.tar.gz /data
```

**Restore:**
```bash
# Restore database
docker exec -i relayum-postgres psql -U relayum_user relayum < backups/database.sql

# Restore uploads
docker run --rm -v relayum_uploads:/data -v $(pwd)/backups:/backup alpine tar xzf /backup/uploads.tar.gz -C /
```

## 🐛 Troubleshooting

### Common Issues

**Container won't start:**
```bash
# Check logs
docker-compose logs app

# Check environment variables
docker-compose config
```

**Database connection failed:**
```bash
# Check database health
docker-compose exec postgres pg_isready -U relayum_user -d relayum

# Reset database
docker-compose down
docker volume rm relayum_postgres_data
docker-compose up -d
```

**Application shows 500 error:**
```bash
# Check application logs
docker-compose logs app

# Verify environment variables are set
docker-compose exec app env | grep -E "(JWT_SECRET|DB_PASSWORD|ADMIN_)"
```

### Health Checks

```bash
# Application health
curl -f http://localhost:3020/api/auth/me

# Database health
docker-compose exec postgres pg_isready

# ClamAV health (if enabled)
docker-compose exec clamav clamdcheck
```

## 📚 Additional Resources

- [GitHub Repository](https://github.com/relayum/relayum)
- [Docker Images](https://github.com/relayum/relayum/pkgs/container/relayum)
- [Issue Tracker](https://github.com/relayum/relayum/issues)
- [Documentation](https://github.com/relayum/relayum/wiki)

## 🤝 Support

If you encounter issues:

1. Check the [troubleshooting section](#troubleshooting)
2. Review application logs
3. Search [existing issues](https://github.com/relayum/relayum/issues)
4. Create a new issue with logs and configuration (remove sensitive data)

---

**Happy sharing! 🎉**