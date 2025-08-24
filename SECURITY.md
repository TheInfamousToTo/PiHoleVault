# Security Guidelines for PiHoleVault

## 🔐 Sensitive Data Protection

### Never Commit These Files:
- `data/config.json` - Contains Pi-hole passwords and URLs
- `.env` - Contains environment-specific secrets
- `docker-compose.local.yml` - Contains local development settings
- `debug-logs/*.json` - May contain system information and credentials
- `backups/*` - May contain sensitive Pi-hole data

### Files Already Protected by .gitignore:
```bash
# Configuration files with credentials
/data/config.json
/data/instance_id.txt
/data/*.log
/debug-logs/*.json
/debug-logs/*.log

# Local development files
docker-compose.local.yml
build-local.sh

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Backup files
/backups/*
```

## 🚨 Pre-Commit Security Checklist

Before committing code, ensure:

1. **No hardcoded credentials**: Search for passwords, API keys, or tokens
2. **No hardcoded URLs**: Replace specific IPs/domains with examples
3. **No sensitive logs**: Remove debug logs containing system information
4. **No local configs**: Only commit `.example` template files

## 🔍 Security Scan Commands

```bash
# Check for potential credential leaks
grep -r -i "password\|secret\|key\|token" --exclude-dir=node_modules --exclude="*.md" .

# Check for hardcoded IPs (adjust range as needed)
grep -r "192\.168\|10\.0\|172\.16" --exclude-dir=node_modules --exclude="*.md" .

# Check git status for untracked sensitive files
git status
```

## 📝 Safe Configuration Setup

### Production Setup:
1. Copy `data/config.json.example` to `data/config.json`
2. Copy `.env.example` to `.env`
3. Copy `docker-compose.yml` and customize as needed
4. Fill in your actual credentials in these copied files

### Development Setup:
1. Copy `docker-compose.local.yml.example` to `docker-compose.local.yml`
2. Customize for your local environment
3. Never commit the non-example versions

## 🛡️ Docker Security

### Volume Mounts:
- Data volumes are properly isolated
- SSH keys are stored in named volumes, not bind mounts
- Backup directory has appropriate permissions

### Environment Variables:
- Sensitive values should come from `.env` files
- Never hardcode secrets in docker-compose files
- Use Docker secrets for production deployments

## 🔐 Runtime Security

### Authentication:
- Pi-hole admin passwords are only stored in `config.json`
- No permanent session tokens are stored
- Session cookies are temporary and not logged

### Network Security:
- Container-to-container communication only
- No unnecessary port exposures
- DNS configuration is environment-specific

## 📋 Security Audit Log

- ✅ Removed hardcoded credentials from all files
- ✅ Updated .gitignore to protect sensitive files
- ✅ Created template files with placeholder values
- ✅ Removed development and temporary files
- ✅ Cleaned up log files containing credentials
- ✅ Updated documentation with example values only

## 🚀 Next Steps

1. Review all template files before production use
2. Set up proper backup encryption for sensitive data
3. Consider implementing credential rotation
4. Regular security audits of dependencies
5. Monitor logs for credential exposure

## ⚡ Quick Security Check

Run this command to verify no sensitive data is being tracked:
```bash
git log -p | grep -E "(password|secret|192\.168|toto@)" || echo "✅ No obvious secrets found in git history"
```
