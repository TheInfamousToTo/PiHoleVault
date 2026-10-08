# PiHoleVault

A self-hosted backup manager for Pi-hole v6: scheduled, verified and optionally encrypted Teleporter backups of one or many Pi-holes, copied off-site, with one-click selective restore.

<div align="center">
  <img src="https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/frontend/public/logo.png" alt="PiHoleVault Logo" width="200"/>
</div>

![PiHoleVault Dashboard](https://raw.githubusercontent.com/TheInfamousToTo/PiHoleVault/main/frontend/public/dashboard-preview.png)

## 🚀 Key Features

- **🌐 Web / API mode**: full Teleporter backups through Pi-hole v6's API, no SSH needed. SSH and hybrid modes too.
- **♻️ One-click restore**: everything, or just the allow/deny lists, blocklists, groups, clients, settings or DHCP leases. A pinned safety backup is taken first, so every restore can be undone.
- **🧩 Several Pi-holes**: back up your primary, secondary and lab Pi-holes from one place, and restore one's lists onto another.
- **☁️ Off-site copies**: S3-compatible storage (AWS, B2, R2, MinIO, Garage, Wasabi) or WebDAV (Nextcloud, Synology, rclone). SMB/NFS via a volume mount.
- **🔐 Encryption**: AES-256-GCM with your passphrase; downloads are decrypted so they import straight into Pi-hole.
- **✅ Verified backups**: every archive is checked for a readable `pihole.toml` and a valid `gravity.db` before it is kept.
- **🔍 Compare backups**: see which domains, blocklists, groups, clients and settings changed between two backups.
- **🗓️ Retention that makes sense**: keep the last N, or daily/weekly/monthly (GFS). Pin backups to keep them forever.
- **🔔 Notifications**: ntfy, Gotify, Telegram, email, generic webhook (n8n, Home Assistant) and Discord.
- **🔒 Secured by default where it matters**: SSH host keys are verified, Pi-hole
  TLS certificates are checked, secrets never leave the server in plaintext, and
  the API can require a token.
- **🙈 Private by default**: anonymous usage statistics are opt-in and never include your Pi-hole's address.
- **🐳 Docker ready**: one container, nginx + Node.js, multi-arch.

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
# Discord notifications (optional; more channels under Settings -> Notifications)
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
2. **Follow** the setup wizard to connect your first Pi-hole, pick a schedule
   and, optionally, a Discord webhook.
3. Everything else lives under **Settings** (the gear icon): more Pi-holes,
   retention, off-site storage, encryption, notification channels and privacy.

### Restoring

Click the restore icon on any backup, choose the Pi-hole to restore to and
which parts to import. Pi-hole restarts after every Teleporter import; the
restore waits until it answers again. If you restore blocklists, run *Update
gravity* in Pi-hole afterwards so the lists are downloaded.

Restoring over SSH always imports the whole archive; use the web or hybrid
method for a selective restore.

### Off-site storage

| Target | What to enter |
| --- | --- |
| AWS S3 | Region and bucket; leave the endpoint empty |
| Backblaze B2, Cloudflare R2, Wasabi | The provider's S3 endpoint URL, bucket and an application key |
| MinIO, Garage, SeaweedFS | `http(s)://host:port`, bucket, keys; keep *path-style URLs* on |
| Nextcloud | `https://cloud.example.com/remote.php/dav/files/<user>` and an app password |
| SMB / NFS share | No settings: mount the share at `/app/backups` in `docker-compose.yml` |

*Save and test* writes, reads back and deletes a small probe file.

### Encryption

When on, new backups are stored as `.zip.enc`. Keep the passphrase somewhere
safe: without it nobody can open them, including you. Changing it only affects
new backups. Downloads from the dashboard are decrypted for you; with
`?raw=1` the API returns the encrypted file.

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

| Method | Path | |
| --- | --- | --- |
| `GET` | `/health` | Health check (unauthenticated) |
| `POST` | `/api/backup/run` | Back up every enabled Pi-hole, or `{ "instanceId": "…" }` for one |
| `GET` | `/api/backups` | List backups with Pi-hole, integrity, encryption, off-site and pin status |
| `GET` | `/api/backups/:file/download` | Download (decrypted; `?raw=1` for the stored file) |
| `POST` | `/api/backups/:file/restore` | `{ instanceId, parts: { domains, adlists, groups, clients, settings, dhcpLeases }, backupFirst }` |
| `POST` | `/api/backups/:file/verify` | Re-run the integrity check |
| `PATCH` | `/api/backups/:file` | `{ pinned, note }` |
| `DELETE` | `/api/backups/:file` | Delete locally and off-site |
| `GET` | `/api/backups/diff?from=&to=` | Compare two backups |
| `POST` | `/api/pihole/test-connection` | Test a Pi-hole connection |
| `POST` | `/api/integrations/storage/test` | Test the saved off-site storage |
| `POST` | `/api/integrations/notifications/test` | `{ channelId }`: send a test notification |

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

Tests:

```bash
cd backend
npm test                      # unit tests, no network
# integration tests against a real Pi-hole v6
docker run -d --name ph -p 8080:80 -e FTLCONF_webserver_api_password=test pihole/pihole:latest
PIHOLE_HOST=localhost PIHOLE_PORT=8080 PIHOLE_PASSWORD=test npm run test:integration
```

End-to-end, in a browser, against the Docker image plus a real Pi-hole, S3,
WebDAV and ntfy: see [`e2e/README.md`](e2e/README.md).

Every pull request runs the full round (dependency audit, unit, integration,
frontend build, end-to-end) in `.github/workflows/ci.yml`. Its `ci-passed`
job is green only when all of them are, so it is the one check to require
before merging.

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
