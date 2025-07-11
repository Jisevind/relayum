#!/bin/bash

# Relayum Portable Deployment Script
# This script deploys Relayum from GitHub Container Registry images

set -e

echo "Relayum Portable Deployment Script"
echo "======================================"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create deployment directory
DEPLOY_DIR="relayum-deployment"
mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

echo "Created deployment directory: $DEPLOY_DIR"

# Download docker-compose file
echo "Downloading configuration..."
curl -fsSL https://raw.githubusercontent.com/relayum/relayum/main/docker-compose.yml > docker-compose.yml

# Create environment file template
echo "Creating environment configuration..."
cat > .env.example << 'EOF'
# Relayum Production Configuration
# Copy this to .env and customize for your deployment

# Core Application
NODE_ENV=production
PORT=3000
TZ=UTC

# Database Configuration - CHANGE THESE
DB_HOST=postgres
DB_PORT=5432
DB_NAME=relayum_prod
DB_USER=relayum_user
DB_PASSWORD=your_secure_database_password_here

# Security & Authentication - CHANGE THESE IMMEDIATELY
JWT_SECRET=your_super_secure_jwt_secret_key_at_least_32_characters_long
JWT_REFRESH_SECRET=your_super_secure_jwt_refresh_secret_key_at_least_32_characters_long

# Admin User Configuration - CHANGE THESE
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=your_secure_admin_password_here

# File Storage & Limits
MAX_FILE_SIZE=2GB
MAX_DOWNLOAD_SIZE=10GB
DEFAULT_DISK_QUOTA=50GB

# Security Settings
ALLOW_REGISTRATION=false
ALLOW_ANONYMOUS_SHARING=false

# CORS Configuration - Update with your domain
CORS_ALLOWED_ORIGINS=https://yourdomain.com,http://localhost:3020
REACT_APP_API_URL=https://yourdomain.com/api

# Virus Scanning (optional but recommended)
ENABLE_VIRUS_SCANNING=true
CLAMAV_REQUIRED=false
EOF

# Check if .env exists
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo " Please edit .env file with your configuration before starting!"
    echo "   Required changes:"
    echo "     - DB_PASSWORD: Set a secure database password"
    echo "     - JWT_SECRET: Set a secure JWT secret (32+ characters)"
    echo "     - JWT_REFRESH_SECRET: Set a secure JWT refresh secret (32+ characters)"
    echo "     - ADMIN_USERNAME: Set admin username"
    echo "     - ADMIN_EMAIL: Set admin email"
    echo "     - ADMIN_PASSWORD: Set admin password"
    echo "     - CORS_ALLOWED_ORIGINS: Set your domain"
    echo ""
    echo "Run 'nano .env' to edit the configuration"
    echo ""
    read -p "Press Enter to continue after editing .env file..."
fi

# Deploy with or without virus scanning
echo "Choose deployment mode:"
echo "1) With virus scanning (recommended for production)"
echo "2) Without virus scanning (faster startup)"
read -p "Enter your choice (1 or 2): " choice

case $choice in
    1)
        echo "Starting Relayum with virus scanning..."
        docker-compose --profile clamav up -d
        ;;
    2)
        echo "Starting Relayum without virus scanning..."
        docker-compose up -d
        ;;
    *)
        echo "Invalid choice. Exiting."
        exit 1
        ;;
esac

echo ""
echo "Relayum deployment started!"
echo ""
echo "Access your application at: http://localhost:3020"
echo "Check status: docker-compose ps"
echo "View logs: docker-compose logs -f"
echo "Stop: docker-compose down"
echo ""
echo "Important: Change default passwords and secrets in .env file!"
echo ""