# PiHoleVault

A modern web-based Pi-hole backup manager with automated scheduling, Discord notifications, and support for Docker-based Pi-hole installations.

<div align="center">
  <img src="https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/frontend/public/logo.png" alt="PiHoleVault Logo" width="200"/>
</div>

![PiHoleVault Dashboard](https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/frontend/public/dashboard-preview.png)

## 🚀 Key Features

- **🌐 Web-Only Mode**: No SSH required - perfect for Docker Pi-hole installations
- **🎨 Modern UI**: Responsive React interface with Material-UI components
- **⏰ Automated Backups**: Configurable cron-based scheduling with timezone support
- **📊 Dashboard**: Real-time backup statistics and job history
- **🔔 Discord Notifications**: Rich webhook notifications for backup events
- **🔧 Easy Setup**: Step-by-step configuration wizard
- **🐳 Docker Ready**: Single-container deployment with nginx + Node.js

## 📦 Quick Start

### Using Docker (Recommended)

```bash
# Using Docker Compose
curl -o docker-compose.yml https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/docker-compose.yml
docker-compose up -d

# Access at http://localhost:3000
```

### Environment Variables

Create a `.env` file for optional configuration:

```bash
# Discord notifications (optional)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-url

# Debug mode (optional)
DEBUG_MODE=true
LOG_LEVEL=debug
```

## 🔧 Configuration

1. **Open** http://localhost:3000
2. **Follow** the setup wizard to configure:
   - Pi-hole connection (Web-only, SSH, or Hybrid)
   - Backup settings and retention
   - Schedule configuration
   - Discord notifications (optional)

### Connection Methods

- **Web-Only**: `https://your-pihole/admin/` - No SSH needed (recommended for Docker)
- **SSH**: Traditional method requiring SSH access
- **Hybrid**: Combines web API for monitoring with SSH for backups

## 📋 API Endpoints

- `GET /health` - Health check
- `POST /api/backup/run` - Manual backup
- `GET /api/backups/` - List backups
- `POST /api/pihole/test-connection` - Test Pi-hole connection

## 🛠️ Development

```bash
# Clone and build locally
git clone https://github.com/TheInfamousToTo/PiHoleVault.git
cd PiHoleVault
docker-compose -f docker-compose.local.yml up -d --build
```

## 🐛 Troubleshooting

**Debug mode**: Set `DEBUG_MODE=true` in `.env` and restart container

**View logs**: `docker-compose logs -f piholevault`

**Common issues**:

- **Web-only connection fails**: Ensure Pi-hole admin password is correct
- **SSH connection fails**: Verify SSH credentials and Pi-hole accessibility
- **Backup fails**: Check Pi-hole API endpoints and authentication

## 📄 License

MIT License - see [LICENSE](LICENSE) file

## ❤️ Support

- ⭐ Star this repository
- ☕ [Buy me a coffee](https://buymeacoffee.com/theinfamoustoto)
- 🐛 Report issues on [GitHub Issues](https://github.com/TheInfamousToTo/PiHoleVault/issues)

---

**Docker Hub**: [theinfamoustoto/piholevault](https://hub.docker.com/r/theinfamoustoto/piholevault)  
**Latest Release**: [GitHub Releases](https://github.com/TheInfamousToTo/PiHoleVault/releases)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=TheInfamousToTo/PiHoleVault&type=date&legend=bottom-right)](https://www.star-history.com/#TheInfamousToTo/PiHoleVault&type=date&legend=bottom-right)
