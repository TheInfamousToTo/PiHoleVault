# 🚀 Quick Start Guide

## Prerequisites
- Docker and Docker Compose installed
- Pi-hole server with SSH access
- Network connectivity between backup system and Pi-hole

## 1. Clone and Setup

```bash
git clone https://github.com/TheInfamousToTo/PiHoleVault.git
cd PiHoleVault
chmod +x setup.sh
./setup.sh
```

## 2. Access Web Interface

Open your browser and go to: **http://localhost:3000**

## 3. Complete Setup Wizard

### Step 1: Pi-hole Server Configuration
- **Host**: Your Pi-hole IP address (e.g., `192.168.1.100`)
- **Username**: SSH username (usually `pi`)
- **Password**: SSH password
- **Port**: SSH port (default: `22`)

### Step 2: Backup Settings
- **Destination**: Leave as `/app/backups` (default)
- **Max Backups**: Number of backups to keep (default: `10`)

### Step 3: Schedule Configuration
- **Cron Expression**: `0 3 * * *` (daily at 3 AM)
- **Timezone**: Select your timezone

### Step 4: SSH Key Setup
- Click "Next" to automatically generate and deploy SSH keys
- This enables passwordless authentication

## 4. Test Your Setup

1. **Run Manual Backup**: Click "Run Backup Now" on the dashboard
2. **Check Status**: Verify the backup completed successfully
3. **View Files**: See your backup files in the dashboard

## 5. Common Cron Expressions

- `0 3 * * *` - Daily at 3:00 AM
- `0 3 * * 0` - Weekly on Sunday at 3:00 AM
- `0 3 1 * *` - Monthly on the 1st at 3:00 AM
- `0 */6 * * *` - Every 6 hours
- `0 3 */2 * *` - Every 2 days at 3:00 AM

## 6. Troubleshooting

### Connection Issues
```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs

# Restart services
docker-compose restart
```

### SSH Issues
- Verify Pi-hole server is accessible: `ping YOUR_PIHOLE_IP`
- Test SSH manually: `ssh username@YOUR_PIHOLE_IP`
- Check Pi-hole SSH service: `sudo systemctl status ssh`

### Backup Issues
- Ensure Pi-hole user has sudo privileges
- Verify `pihole-FTL` command exists on Pi-hole server
- Check disk space on both systems

## 7. Management Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Update to latest version
git pull
docker-compose pull
docker-compose up -d

# Backup your configuration
cp data/config.json config-backup.json

# Health check
./health-check.sh
```

## 8. File Locations

- **Configuration**: `data/config.json`
- **Backup Files**: `backups/`
- **Job History**: `data/jobs.json`
- **Logs**: `data/combined.log`, `data/error.log`

## 9. Security Notes

- SSH keys are automatically generated and deployed
- Passwords are not stored after SSH key setup
- Backup files are stored locally
- No external network access required after setup

## 🆘 Need Help?

1. Check the [README.md](README.md) for detailed documentation
2. Run the health check script: `./health-check.sh`
3. View application logs: `docker-compose logs`
4. Create an issue on GitHub if you need assistance

---

**You're all set! 🎉**

Your Pi-hole backups will now run automatically according to your schedule.
