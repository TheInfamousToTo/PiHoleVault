---
name: Bug report
about: Report a bug to help us improve PiHoleVault
title: '[BUG] '
labels: 'bug'
assignees: 'TheInfamousToTo'

---

## Bug Description

A clear and concise description of what the bug is.

## Steps to Reproduce

Steps to reproduce the behavior:

1. Go to '...'
2. Click on '....'
3. Enter configuration '....'
4. See error

## Expected Behavior

A clear and concise description of what you expected to happen.

## Actual Behavior

What actually happened instead.

## Environment Information

**PiHoleVault Setup:**

- Version: [e.g. 1.6.0]
- Deployment method: [Docker Compose/Docker Run/Local Build]
- Container platform: [e.g. Docker Desktop, Portainer, Unraid]

**Pi-hole Setup:**

- Pi-hole version: [e.g. 5.17.3]
- Installation type: [Docker/Native/Other]
- Connection method: [Web-only/SSH/Hybrid]

**System Information:**

- Host OS: [e.g. Ubuntu 22.04, Windows 11, macOS]
- Browser: [e.g. Chrome 116, Firefox 117, Safari 16]
- Device: [Desktop/Mobile/Tablet]

## Configuration

**Docker Compose Configuration (if applicable):**

```yaml
# Paste relevant docker-compose.yml sections here
# Remove sensitive information like passwords/webhooks
```

**Environment Variables:**

```bash
# List relevant environment variables (remove sensitive data)
DEBUG_MODE=false
LOG_LEVEL=info
```

## Logs

**Container Logs:**

```text
# Paste relevant logs from: docker-compose logs piholevault
# Or from the debug endpoints if DEBUG_MODE=true
```

**Browser Console Errors (if applicable):**

```text
# Press F12 -> Console tab and paste any errors
```

## Screenshots

If applicable, add screenshots to help explain your problem.

## Additional Context

Add any other context about the problem here, such as:

- When did the issue start occurring?
- Does it happen consistently or intermittently?
- Any recent changes to your setup?
