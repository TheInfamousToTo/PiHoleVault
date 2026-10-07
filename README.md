# PiHoleVault

A modern web-based Pi-hole backup manager with automated scheduling, Discord notifications, and support for Docker-based Pi-hole installations.

<div align="center">
  <img src="https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/frontend/public/logo.png" alt="PiHoleVault Logo" width="200"/>
</div>

![PiHoleVault Dashboard](https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/frontend/public/dashboard-preview.png)

## 🚀 Key Features

- **🌐 Web / API Mode**: No SSH required — full Teleporter backups through Pi-hole v6's API
- **🎨 Considered interface**: a calm dark theme built on one accent colour, with
  addresses, ports, cron expressions and filenames set in a monospace face so
  they line up and read as machine values. Fonts ship with the app, so it looks
  the same on a network with no route to the internet.
- **⏰ Automated Backups**: Configurable cron-based scheduling with timezone support
- **📊 Dashboard**: Real-time backup statistics and job history
- **🔒 Secured by default where it matters**: SSH host keys are verified, Pi-hole
  TLS certificates are checked, secrets never leave the server in plaintext, and
  the API can require a token
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

### Securing the API

The API is unauthenticated by default, which means anyone who can reach port 3000
can read your configuration, download backups and open SSH connections to your
Pi-hole. Set `AUTH_TOKEN` to require a token on every `/api` request:

```bash
# Generate one with: openssl rand -hex 32
AUTH_TOKEN=your-long-random-token
```

The UI asks for the token on first load and stores it in the browser. Requests
send it as `Authorization: Bearer <token>`.

Two further settings control SSH:

| Variable | Default | Meaning |
| --- | --- | --- |
| `SSH_HOST_KEY_POLICY` | `tofu` | `tofu` pins a host's key on first connection and refuses it if it later changes; `strict` connects only to already-pinned hosts; `insecure` accepts any key. |
| `SSH_ALLOW_LEGACY_ALGORITHMS` | `false` | Set to `true` only for hardware that still needs `ssh-dss` or `hmac-sha1`. |

Pinned host keys are stored in `data/known_hosts.json`. If you rebuild your
Pi-hole and its host key changes, delete that host's entry to pin the new one.

## 🔧 Configuration

1. **Open** http://localhost:3000
2. **Follow** the setup wizard to configure:
   - Pi-hole connection (Web-only, SSH, or Hybrid)
   - Backup settings and retention
   - Schedule configuration
   - Discord notifications (optional)

### Compatibility

Built and tested against **Pi-hole v6** (tested on FTL v6.7.1, Web v6.6, Core
v6.4.3 — the current release). Pi-hole v5 is end-of-life and is not supported
by the web method; the SSH method may still work on it but is untested.

### Connection Methods

- **Web / API** (recommended): paste the admin page URL, e.g.
  `https://pi.hole/admin/`, and the web interface password. Backups are full
  Teleporter archives from Pi-hole's API — the same file Settings → Teleporter
  gives you. No SSH needed, so it suits Docker installs.
- **SSH**: runs `pihole-FTL --teleporter` on the Pi-hole. The SSH user must be
  `root`, be in the `pihole` group, or be allowed to run `sudo pihole-FTL`
  without a password, because Pi-hole's config is not world-readable.
- **Hybrid**: web API first, SSH automatically if the API is unavailable.

**Two-factor authentication**: if 2FA is on, create an *app password* in
Pi-hole (Settings → Web interface / API → Configure app password) and use it
instead of your login password.

**HTTPS**: Pi-hole v6 serves a self-signed certificate by default. Turn on
*Allow self-signed certificate* in the wizard or in Settings, or set
`ALLOW_INSECURE_TLS=true`.

## 📋 API Endpoints

- `GET /health` - Health check
- `POST /api/backup/run` - Manual backup
- `GET /api/backups/` - List backups
- `POST /api/pihole/test-connection` - Test Pi-hole connection

## 🛠️ Development

Build and run the whole thing in a container:

```bash
git clone https://github.com/TheInfamousToTo/PiHoleVault.git
cd PiHoleVault
docker-compose -f docker-compose.local.yml up -d --build
```

Or run the two halves directly, which gives you hot reload on the frontend:

```bash
# Backend on :3001
cd backend && npm ci && npm run dev

# Frontend on :3000, proxying /api and /health to the backend
cd frontend && npm ci && npm run dev
```

The frontend is built with [Vite](https://vite.dev/) and React. All of the
styling lives in `frontend/src/theme.js`, so change the palette, the type scale
or the component defaults there rather than in individual components.

## 🐛 Troubleshooting

**Debug mode**: Set `DEBUG_MODE=true` in `.env` and restart container

**View logs**: `docker-compose logs -f piholevault`

**Common issues**:

- **"Pi-hole rejected the password"**: use the web interface password, or an
  app password if 2FA is on.
- **"TLS certificate is not trusted"**: see *HTTPS* above.
- **"API seats exceeded"**: Pi-hole has run out of API sessions (16 by
  default, each lasting 30 minutes). PiHoleVault logs out after every request
  since 2.0.0; older versions did not, so wait 30 minutes after upgrading or
  raise `webserver.api.max_sessions`.
- **"The SSH user cannot read Pi-hole's configuration"**: see the SSH method
  above.

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

## 📊 Repository Activity

![Alt](https://repobeats.axiom.co/api/embed/cfcc8c7b021140861e2e50ae0abb4d06ef2807fd.svg "Repobeats analytics image")
