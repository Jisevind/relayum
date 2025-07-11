# Relayum - Claude Code Documentation

## Project Overview

A modern, secure file sharing application built with React, Node.js, Express, and PostgreSQL. Features include file/folder management, drag-and-drop functionality, user authentication, and both public and private secure sharing with notification system.

## Architecture

### Backend (Node.js/Express)
- **Framework**: Express.js with security middleware (Helmet, CORS, rate limiting)
- **Database**: PostgreSQL with connection pooling
- **Authentication**: JWT-based authentication with bcrypt password hashing
- **File Storage**: Local filesystem with configurable upload path
- **API Design**: RESTful endpoints with proper error handling

### Frontend (React)
- **Framework**: React 18 with React Router v6
- **UI Library**: Material-UI (MUI) v5 with custom theming
- **State Management**: React Query for server state, React Context for global state
- **Styling**: CSS-in-JS with MUI's styled components and theme system
- **Features**: Drag-and-drop, dark/light theme, responsive design

### Infrastructure
- **Containerization**: Docker with multi-stage builds
- **Database**: PostgreSQL 15 Alpine
- **Development**: Docker Compose for local development
- **Production**: Optimized production builds with security best practices

## Recent Major Features (Latest Implementation)

### Secure User-Specific Sharing System
- **Private Tokens**: Each user share gets a unique secure token
- **Authentication Required**: Private shares require user login to access
- **Secure URLs**: `/private/:token` endpoints for authenticated access
- **Database Schema**: Added `private_token`, `is_viewed`, `viewed_at` columns

### Notification System
- **Unviewed Tracking**: Automatic tracking of when shares are viewed
- **Notification Badges**: Red badges on "Received Shares" tab showing unviewed count
- **Visual Indicators**: "NEW" chips on individual unviewed shares
- **Auto-Mark Viewed**: Shares marked as viewed when user visits received shares tab

### Enhanced UI/UX
- **Color-Coded Links**: 
  - Green link icons for public shares
  - Blue link icons for private shares
- **Modal Improvements**: Cancel button becomes "Close" after successful share creation
- **PrivateShare Component**: Dedicated component for accessing private shares

## Database Schema

### Core Tables
```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(10) CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Files table  
CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  filepath VARCHAR(500) NOT NULL,
  size BIGINT NOT NULL,
  mime_type VARCHAR(100),
  uploader_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Folders table
CREATE TABLE folders (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  parent_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Shares table (Enhanced with notifications)
CREATE TABLE shares (
  id SERIAL PRIMARY KEY,
  file_id INTEGER REFERENCES files(id) ON DELETE CASCADE,
  folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
  shared_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  shared_with INTEGER REFERENCES users(id) ON DELETE CASCADE,
  public_token VARCHAR(64),        -- For public shares
  private_token VARCHAR(64) UNIQUE, -- For user-specific shares
  is_viewed BOOLEAN DEFAULT FALSE,  -- Notification tracking
  viewed_at TIMESTAMP,             -- When share was viewed
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_file_or_folder CHECK ((file_id IS NOT NULL AND folder_id IS NULL) OR (file_id IS NULL AND folder_id IS NOT NULL))
);
```

### Key Indexes
- `idx_shares_public_token` on `shares(public_token)`
- `idx_shares_private_token` on `shares(private_token)`
- `idx_shares_shared_with` on `shares(shared_with)`
- `idx_shares_is_viewed` on `shares(is_viewed)`
- `idx_folders_parent` on `folders(parent_id)`
- `idx_folders_owner` on `folders(owner_id)`
- `idx_files_folder` on `files(folder_id)`

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration  
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - User logout
- `GET /api/auth/check-username/:username` - Check username availability

### Files & Folders
- `GET /api/files` - List files (with optional folder filter)
- `POST /api/files/upload` - Upload files with drag-and-drop support
- `DELETE /api/files/:id` - Delete file
- `PUT /api/files/:id/move` - Move file to different folder
- `GET /api/folders` - List folders
- `POST /api/folders` - Create folder
- `DELETE /api/folders/:id` - Delete folder
- `GET /api/folders/:id/breadcrumb` - Get folder breadcrumb trail
- `GET /api/folders/tree` - Get complete folder tree

### Sharing (Enhanced)
- `POST /api/shares` - Create share (public or private with secure tokens)
- `GET /api/shares/sent` - Get shares created by user
- `GET /api/shares/received` - Get shares received by user (marks as viewed)
- `GET /api/shares/received/unviewed-count` - Get notification count only
- `GET /api/shares/public/:token` - Access public share
- `GET /api/shares/private/:token` - Access private share (auth required)
- `DELETE /api/shares/:id` - Delete share
- `DELETE /api/shares/received/:id` - Remove received share

### Downloads
- `GET /api/download/file/:id` - Download file
- `GET /api/download/folder/:id` - Download folder as ZIP
- `GET /api/download/public/:token` - Download public share
- `GET /api/download/public/:token/file/:fileId` - Download specific file from public share

## Component Architecture

### Core Components
- **App.js**: Main application with routing and providers
- **Dashboard.js**: Main dashboard with tab navigation and notification badges (3 tabs: My Files, Sent Shares, Received Shares, plus admin tabs)
- **ShareModal.js**: Enhanced modal for creating shares with private links
- **SharesList.js**: List of shares with notification indicators and color-coded icons
- **PrivateShare.js**: Component for accessing private shares
- **PublicShare.js**: Component for accessing public shares
- **Landing.js**: Landing page with anonymous upload functionality (no account required)

### Context Providers
- **AuthContext**: User authentication state
- **ThemeContext**: Dark/light theme management
- **DragContext**: Drag-and-drop state management

### Utility Hooks
- **useFiles**: File management operations
- **useFolders**: Folder management operations

## Security Features

### Backend Security
- JWT authentication with secure token validation
- bcrypt password hashing with salt rounds
- Rate limiting on API endpoints
- CORS configuration for cross-origin requests
- Helmet for security headers
- Input validation and sanitization
- File type restrictions and size limits
- Path traversal protection

### Sharing Security
- **Public Shares**: Secure random tokens (64 characters hex)
- **Private Shares**: Secure random tokens requiring authentication
- **Access Control**: Private shares only accessible by intended recipients
- **Expiration**: Optional share expiration dates
- **Rate Limiting**: Protection against token enumeration attacks

### Database Security
- Parameterized queries to prevent SQL injection
- Foreign key constraints for referential integrity
- Check constraints for data validation
- Unique constraints on sensitive fields
- Proper indexing for performance

## Development Commands

### Database Operations
```bash
# Initialize database
node scripts/init-db.js

# Add folder support (migration)
node scripts/add-folders.js

# Add private tokens and notifications (migration)
node scripts/add-private-tokens.js

# Initialize test database
node scripts/init-test-db.js
```

### Docker Operations
```bash
# Start development environment
docker-compose up -d

# Rebuild and start
docker-compose up --build

# View logs
docker logs filesharing-app-1
docker logs filesharing-postgres-1

# Database access
docker exec filesharing-postgres-1 psql -U filesharing_user -d filesharing
```

### Testing
```bash
# Run backend tests
npm test

# Run specific test file
npm test -- tests/shares.test.js

# Run frontend tests
cd client && npm test
```

## Configuration

### Environment Variables
```env
# Server
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=filesharing
DB_USER=filesharing_user
DB_PASSWORD=filesharing_password

# JWT
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production

# File Storage
UPLOAD_PATH=./uploads
MAX_FILE_SIZE=1GB                    # Supports human-readable: 50MB, 2GB, 1.5TB
ANONYMOUS_MAX_FILE_SIZE=512MB        # Separate limit for anonymous uploads
DEFAULT_DISK_QUOTA=10GB              # Default user storage quota

# UI Settings
ENABLE_LANDING_PAGE=true             # Enable landing page with anonymous upload

# Admin User (created on first run)
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@localhost
ADMIN_PASSWORD=admin123
```

#### File Size Format
File size environment variables support both numeric bytes and human-readable formats:
- **Numeric**: `1073741824` (bytes)
- **Human-readable**: `50MB`, `2GB`, `1.5TB`, `512kb` (case-insensitive)
- **Supported units**: B, KB, MB, GB, TB (binary: 1KB = 1024 bytes)
- **Examples**: `MAX_FILE_SIZE=2GB`, `ANONYMOUS_MAX_FILE_SIZE=512MB`

#### Landing Page Configuration
The application supports two UI modes controlled by `ENABLE_LANDING_PAGE`:

**Landing Page Enabled** (`ENABLE_LANDING_PAGE=true`):
- Root URL (`/`) shows landing page with anonymous upload, login, and register tabs
- Theme toggle available on landing page
- Logout redirects to landing page (`/`)
- Suitable for public-facing deployments

**Direct Login Mode** (`ENABLE_LANDING_PAGE=false`):
- Root URL (`/`) redirects to `/login`
- Login page includes theme toggle in top-right corner
- Logout redirects to login page (`/login`)
- Suitable for internal/corporate deployments

**Registration Control**: The `/register` route is only available when `ALLOW_REGISTRATION=true`

### Docker Configuration
- **Application Port**: 3010 (external) → 3000 (internal)
- **Database Port**: 5432 (exposed for development)
- **Volumes**: Persistent storage for database and uploads
- **Networks**: Internal Docker network for service communication

## Testing Strategy

### Backend Tests
- **Authentication**: Login/register/JWT validation
- **File Operations**: Upload, download, move, delete
- **Folder Operations**: Create, delete, move, tree operations
- **Sharing**: Create shares, access controls, notifications
- **Database**: Schema validation, constraints, migrations

### Frontend Tests
- **Component Testing**: Individual component behavior
- **Integration Testing**: User flows and API interactions
- **E2E Testing**: Complete user scenarios

## Known Issues & Technical Debt

### From Previous Analysis
1. **Testing Coverage**: Limited test coverage, especially integration tests
2. **Component Complexity**: Some components handle multiple responsibilities
3. **State Management**: Some workarounds with refresh patterns
4. **Database Queries**: Raw SQL in route handlers (partially addressed)

### Recent Improvements ✅
1. **Secure Sharing**: Implemented private tokens for user-specific shares
2. **Notifications**: Added comprehensive notification system
3. **UI/UX**: Enhanced user interface with better visual indicators
4. **Database Schema**: Extended schema for new features
5. **Error Handling**: Improved modal and component error states
6. **UI Cleanup**: Removed confusing "Anonymous Shares" tab from Dashboard - anonymous uploads still work via Landing page

## Future Enhancements

### Short Term
1. **Testing**: Expand test coverage for new sharing features
2. **Performance**: Add pagination for large folder listings
3. **Accessibility**: Improve ARIA labels and keyboard navigation
4. **Logging**: Enhanced server-side logging for debugging

### Medium Term
1. **Real-time Updates**: WebSocket notifications for new shares
2. **File Previews**: In-browser preview for common file types
3. **Bulk Operations**: Select multiple files/folders for operations
4. **Advanced Permissions**: Fine-grained sharing permissions

### Long Term
1. **Microservices**: Split into dedicated services for files, auth, sharing
2. **Cloud Storage**: Support for S3, Google Cloud Storage backends
3. **Mobile App**: Native mobile applications
4. **Enterprise Features**: SSO, audit logs, compliance features

## Deployment Notes

### Production Checklist
- [ ] Change default JWT secret
- [ ] Update admin credentials
- [ ] Configure HTTPS/SSL
- [ ] Set up database backups
- [ ] Configure log aggregation
- [ ] Set up monitoring/alerts
- [ ] Review file size limits
- [ ] Configure CDN for static files

### Performance Considerations
- Database connection pooling configured
- File uploads streamed to disk
- ZIP compression for folder downloads
- Efficient SQL queries with proper indexes
- Material-UI component lazy loading
- React Query for request caching

## Troubleshooting

### Common Issues
1. **Database Connection**: Check Docker containers and environment variables
2. **File Uploads**: Verify upload path permissions and disk space
3. **Share Access**: Ensure tokens are valid and not expired
4. **Authentication**: Check JWT secret and token expiration

### Debug Commands
```bash
# Check container status
docker ps

# View application logs
docker logs filesharing-app-1 --tail 50

# Check database
docker exec filesharing-postgres-1 psql -U filesharing_user -d filesharing -c "SELECT COUNT(*) FROM users;"

# Test API endpoints
curl -X GET http://localhost:3010/api/auth/me
```

This documentation reflects the current state of the application with all recent enhancements including secure user-specific sharing and the notification system.