# HoleSafe v1.1.0

A comprehensive web-based solution for managing Pi-hole backups with automated scheduling, SSH key management, and a modern React frontend.

<div align="center">
  <img src="https://raw.githubusercontent.com/TheInfamousToTo/HoleSafe/main/frontend/public/logo.png" alt="HoleSafe Logo" width="200"/>
</div>

![HoleSafe Dashboard](https://raw.githubusercontent.com/TheInfamousToTo/HoleSafe/main/frontend/public/dashboard-preview.png)

## 📦 Quick Links & Support

- **GitHub Repository**: [TheInfamousToTo/HoleSafe](https://github.com/TheInfamousToTo/HoleSafe)
- **Docker Hub**: [theinfamoustoto/holesafe](https://hub.docker.com/r/theinfamoustoto/holesafe)
- **Latest Release**: [v1.1.0](https://github.com/TheInfamousToTo/HoleSafe/releases/tag/v1.1.0)

### ❤️ Support the Project

If you find HoleSafe useful, consider supporting its development:

- ⭐ **Star this repository** on GitHub
- ☕ **Buy me a coffee** on [Buy Me a Coffee](https://buymeacoffee.com/theinfamoustoto)
- � **Support on Ko-fi** at [Ko-fi](https://ko-fi.com/theinfamoustoto)
- �🚀 **Become a sponsor** on [GitHub Sponsors](https://github.com/sponsors/TheInfamousToTo)

## 🚀 Features

- **Modern Web Interface**: Clean, responsive React frontend with Material-UI components
- **Integrated Branding**: HoleSafe logo integration throughout the interface
- **Enhanced Navigation**: Streamlined AppBar with all essential functions and support links
- **Setup Wizard**: Step-by-step configuration with logo display and improved UX
- **SSH Key Management**: Automatic generation and deployment with manual deployment option
- **Timezone Support**: GMT-based timezone selection with proper POSIX conversion
- **Backup Scheduling**: Configurable cron-based scheduling with timezone validation
- **Backup Management**: Download, delete, and view backup files through the web interface
- **Job History**: Track backup job status and history with real-time updates
- **Docker Deployment**: Single-container solution with nginx and Node.js
- **Health Monitoring**: Built-in health checks and status monitoring
- **Reconfigure Option**: Easy access to setup wizard for configuration changes
- **Production Ready**: Optimized for production deployment with proper error handling
- **Multi-Platform**: Docker images available for AMD64 and ARM64 architectures

## 🎯 Version 1.1.0 Release - Enhanced UI & User Experience

This release focuses on major UI improvements and user experience enhancements:

### ✨ New Features

- **🎨 Logo Integration**: HoleSafe logo displayed prominently in both Dashboard and Setup Wizard
- **🚀 Enhanced AppBar**: All support and sponsorship links moved to the main navigation bar
- **⚙️ Reconfigure Access**: Easy access to setup wizard from the dashboard
- **🌍 GMT Timezone Support**: Complete GMT-12 to GMT+12 timezone selection with proper POSIX conversion
- **🔑 Manual SSH Deployment**: Option to manually deploy SSH keys when automatic deployment fails
- **📱 Responsive Design**: Improved mobile and desktop experience
- **🎛️ Streamlined Interface**: Removed redundant sponsorship bars, consolidated into main navigation

### 🔧 Improvements

- **Alpine Linux Compatibility**: Fixed nginx configuration for Alpine Linux containers
- **POSIX Timezone Handling**: Proper timezone conversion for cron scheduling (GMT+3 → Etc/GMT-3)
- **SSH Authentication**: Enhanced SSH key deployment with fallback options
- **Container Architecture**: Single-port deployment with nginx reverse proxy
- **Error Handling**: Improved error messages and user feedback

### 🐛 Bug Fixes

- Fixed nginx configuration path conflicts in Alpine Linux
- Corrected SSH API endpoints (`/ssh/setup-key` instead of `/ssh/setup`)
- Resolved timezone conversion issues for proper cron scheduling
- Fixed container startup sequence and health checks

## 🎨 User Interface

### Enhanced Navigation Bar

HoleSafe v1.1.0 features a completely redesigned navigation experience:

- **🏠 HoleSafe Logo**: Prominently displayed logo for brand recognition
- **🔄 Refresh Button**: Quick access to reload dashboard data
- **🐙 GitHub Link**: Direct access to the project repository
- **⭐ Star Project**: Easy way to star the repository on GitHub
- **☕ Buy Me Coffee**: Support the developer directly from the interface
- **💖 Ko-fi Support**: Alternative donation platform integration
- **🚀 GitHub Sponsors**: Become a sponsor for ongoing development
- **▶️ Run Backup**: One-click backup execution
- **⚙️ Settings**: Access configuration options
- **🔧 Reconfigure**: Return to setup wizard for changes

### Setup Wizard Improvements

- **Logo Integration**: HoleSafe logo displayed throughout the setup process
- **GMT Timezone Support**: Complete GMT-12 to GMT+12 timezone selection
- **Manual SSH Deployment**: Fallback option when automatic deployment fails
- **Improved Validation**: Better error handling and user feedback
- **Responsive Design**: Optimized for both desktop and mobile devices

### Dashboard Enhancements

- **Consolidated Interface**: All essential functions in the main navigation
- **Real-time Status**: Live updates for backup operations and system status
- **Professional Branding**: Consistent HoleSafe theming throughout
- **Support Integration**: Direct access to project support and sponsorship options

## 📁 Project Structure

```
├── docker-compose.yml          # Docker Compose configuration
├── frontend/                   # React frontend application
│   ├── src/
│   │   ├── components/
│   │   │   ├── SetupWizard.js # Initial setup wizard
│   │   │   └── Dashboard.js   # Main dashboard
│   │   ├── services/
│   │   │   └── api.js         # API client
│   │   └── App.js             # Main application
│   ├── package.json
│   └── Dockerfile
├── backend/                    # Node.js backend API
│   ├── routes/                 # Express route handlers
│   ├── services/               # Business logic services
│   ├── server.js              # Main server file
│   ├── package.json
│   └── Dockerfile
├── data/                      # Configuration and job data
├── backups/                   # Backup file storage
└── backup_pihole.sh          # Original backup script
```

## 🛠 Installation & Setup

### Prerequisites

- Docker and Docker Compose
- Pi-hole server with SSH access
- Network connectivity between the backup system and Pi-hole server

### Quick Start

#### Using Docker Hub Images (Recommended)

1. **Create a docker-compose.yml file**:

```yaml
version: '3.8'

services:
  holesafe:
    image: theinfamoustoto/holesafe:latest
    container_name: holesafe
    ports:
      - "3000:80"  # Single port for both frontend and backend
    volumes:
      - ./data:/app/data
      - ./backups:/app/backups
      - ssh_keys:/root/.ssh
    environment:
      - NODE_ENV=production
      - DATA_DIR=/app/data
      - BACKUP_DIR=/app/backups
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - holesafe-network

networks:
  holesafe-network:
    driver: bridge

volumes:
  ssh_keys:
    driver: local
```

2. **Start the container**:

```bash
mkdir -p data backups
docker-compose up -d
```

3. **Access the web interface** at <http://localhost:3000>

#### Build from Source (Development)

1. **Clone the repository**:

   ```bash
   git clone https://github.com/TheInfamousToTo/HoleSafe.git
   cd HoleSafe
   ```

2. **Build and run the combined container**:

   ```bash
   docker build -f Dockerfile.combined -t theinfamoustoto/holesafe-combined:latest .
   docker-compose up -d
   ```

### Manual Installation

If you prefer to run without Docker:

1. **Backend Setup**:

   ```bash
   cd backend
   npm install
   npm start
   ```

2. **Frontend Setup**:

   ```bash
   cd frontend
   npm install
   npm start
   ```

## 🔧 Configuration

### Initial Setup Wizard

The first time you access the application, you'll be guided through a setup wizard:

1. **Pi-hole Server Configuration**:
   - Server IP/hostname
   - SSH port (default: 22)
   - Username and password

2. **Backup Settings**:
   - Destination path for backups
   - Maximum number of backups to retain

3. **Schedule Configuration**:
   - Cron expression for automated backups
   - Timezone settings

4. **SSH Key Setup**:
   - Automatic generation and deployment of SSH keys
   - Passwordless authentication setup

### Manual Configuration

Configuration is stored in `/data/config.json`:

```json
{
  "pihole": {
    "host": "192.168.1.100",
    "username": "pi",
    "password": "your-password",
    "port": 22
  },
  "backup": {
    "destinationPath": "/app/backups",
    "maxBackups": 10
  },
  "schedule": {
    "enabled": true,
    "cronExpression": "0 3 * * *",
    "timezone": "UTC"
  },
  "sshKeyDeployed": true,
  "sshKeyPath": "/root/.ssh/id_rsa"
}
```

## 🎯 Features

### Web Dashboard

- **System Status**: View Pi-hole connection status and configuration
- **Quick Actions**: Run backups manually with one click
- **Backup Management**: Browse, download, and delete backup files
- **Job History**: Monitor backup job status and history
- **Configuration**: Edit settings through the web interface

### Automated Backups

- **Cron Scheduling**: Flexible scheduling using cron expressions
- **Automatic Cleanup**: Configurable retention policy for old backups
- **Error Handling**: Comprehensive error logging and recovery
- **SSH Key Authentication**: Secure, passwordless connections

### Security Features

- **SSH Key Management**: Automatic key generation and deployment
- **Secure Authentication**: No passwords stored after SSH key setup
- **Input Validation**: Protection against malicious inputs
- **File Security**: Secure file handling and path validation

## 🔍 API Endpoints

### Configuration

- `GET /api/config/status` - Check configuration status
- `GET /api/config` - Get current configuration
- `POST /api/config/save` - Save new configuration
- `PUT /api/config` - Update existing configuration

### Pi-hole Management

- `POST /api/pihole/test-connection` - Test Pi-hole connection
- `GET /api/pihole/status` - Get Pi-hole server status

### Backup Operations

- `POST /api/backup/run` - Run backup manually
- `GET /api/backup` - List backup files
- `GET /api/backup/:filename/download` - Download backup file
- `DELETE /api/backup/:filename` - Delete backup file

### SSH Management

- `POST /api/ssh/setup-key` - Setup SSH key authentication
- `POST /api/ssh/test-key` - Test SSH key authentication
- `GET /api/ssh/status` - Get SSH key status

### Scheduling

- `POST /api/schedule/validate` - Validate cron expression
- `GET /api/schedule/next-runs` - Get next scheduled runs
- `POST /api/schedule/toggle` - Enable/disable scheduling

### Job Management

- `GET /api/jobs` - Get job history
- `DELETE /api/jobs` - Clear job history
- `GET /api/jobs/stats` - Get job statistics

## 🔨 Development

### Environment Variables

Backend environment variables:

- `NODE_ENV` - Application environment (development/production)
- `PORT` - Server port (default: 3001)
- `DATA_DIR` - Data directory path (default: ./data)
- `BACKUP_DIR` - Backup directory path (default: ./backups)

Frontend environment variables:

- `REACT_APP_API_URL` - Backend API URL (default: <http://localhost:3001>)

### Building for Production

1. **Build frontend**:

   ```bash
   cd frontend
   npm run build
   ```

2. **Production deployment** (using pre-built images):

   ```bash
   docker-compose up -d
   ```

## 📋 Backup Process

1. **Connection**: Connect to Pi-hole server via SSH
2. **Generation**: Execute `pihole-FTL --teleporter` command
3. **Transfer**: Download backup file to local storage
4. **Cleanup**: Remove temporary files from Pi-hole server
5. **Retention**: Apply retention policy to old backups
6. **Logging**: Record job status and details

## 🚨 Troubleshooting

### Common Issues

1. **SSH Connection Failed**:
   - Verify Pi-hole server is accessible
   - Check SSH credentials and port
   - Ensure SSH service is running on Pi-hole

2. **Backup Command Failed**:
   - Verify Pi-hole is properly installed
   - Check user permissions for pihole-FTL command
   - Ensure sufficient disk space

3. **Docker Issues**:
   - Check Docker and Docker Compose versions
   - Verify port availability (3000, 3001)
   - Check container logs: `docker-compose logs`

### Logs

- **Application logs**: Available in the backend container
- **Job history**: Accessible through the web interface
- **Error logs**: Stored in `/data/error.log`

## 🔄 Migration from Original Script

To migrate from the original bash script:

1. **Backup existing data**: Copy any existing backup files
2. **Note configuration**: Record your current settings
3. **Deploy new system**: Follow installation instructions
4. **Configure through wizard**: Enter your existing settings
5. **Test thoroughly**: Verify backups work correctly

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 💝 Support

If you find this project helpful, please consider supporting the development:

- GitHub: [@TheInfamousToTo](https://github.com/TheInfamousToTo)
- Buy Me a Coffee: [theinfamoustoto](https://buymeacoffee.com/theinfamoustoto)
- Ko-fi: [theinfamoustoto](https://ko-fi.com/theinfamoustoto)
- PayPal: [Direct Link](https://paypal.me/alsatrawi)

## 🔮 Future Enhancements

- Multiple Pi-hole server support
- Backup encryption
- Cloud storage integration
- Mobile responsive improvements
- Backup verification and testing
- Integration with monitoring systems
- Custom notification systems

---

## Original Script Details (Legacy)

The original backup script is still available as `backup_pihole.sh` for users who prefer the command-line approach.
