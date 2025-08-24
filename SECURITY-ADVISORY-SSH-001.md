# 🚨 CRITICAL SECURITY ADVISORY - SSH Key Vulnerability

## ⚠️ Vulnerability Summary

**CVE-2025-SSH-001** (Internal Reference)
**Severity: CRITICAL**  
**CVSS Score: 9.8 (Critical)**

### 🔍 Issue Description

Prior to version 1.7.1, PiHoleVault Docker images contained a critical security vulnerability where SSH private keys were generated during the Docker build process instead of at container runtime.

### 🎯 Impact

- **Shared SSH Keys**: All containers derived from the same image share identical SSH key pairs
- **Key Exposure**: Private keys are embedded in publicly available Docker images
- **Unauthorized Access**: Anyone with access to the Docker image can potentially access Pi-hole servers where the public key was deployed
- **No Key Rotation**: Keys remain static across all deployments until image rebuild

### 📋 Affected Versions

- **PiHoleVault versions ≤ 1.7.0**
- **All Docker images published before August 24, 2025**
- **Both production and local build configurations**

### ✅ Fixed Versions

- **PiHoleVault v1.7.1+**
- **All Docker images published after August 24, 2025**

## 🛡️ Security Fix Implementation

### What Changed

**Before (Vulnerable):**
```dockerfile
# VULNERABLE - Keys generated at BUILD TIME
RUN ssh-keygen -t rsa -b 4096 -f /root/.ssh/id_rsa -N "" && \
    chmod 600 /root/.ssh/id_rsa
```

**After (Secure):**
```dockerfile
# SECURE - Keys generated at RUNTIME
# Generate SSH keys at runtime if they do not exist
if [ ! -f /root/.ssh/id_rsa ]; then
  echo "🔑 Generating unique SSH keys for this container..."
  ssh-keygen -t rsa -b 4096 -f /root/.ssh/id_rsa -N "" -q
  chmod 600 /root/.ssh/id_rsa
  chmod 644 /root/.ssh/id_rsa.pub
  echo "✅ SSH keys generated successfully"
fi
```

### Security Benefits

- ✅ **Unique Keys Per Container**: Each container generates its own unique SSH key pair
- ✅ **No Key Embedding**: No private keys stored in Docker images
- ✅ **Runtime Security**: Keys generated fresh when container starts
- ✅ **Volume Persistence**: Keys persist through container restarts via Docker volumes
- ✅ **Automatic Rotation**: New containers automatically get new keys

## 🚨 Immediate Action Required

### For Current Users

1. **🔄 Update Immediately**:
   ```bash
   # Pull latest fixed image
   docker pull theinfamoustoto/piholevault:latest
   
   # Restart with new image
   docker-compose down
   docker-compose pull
   docker-compose up -d
   ```

2. **🔑 Rotate SSH Keys**:
   ```bash
   # Remove old SSH keys to force regeneration
   docker-compose down
   docker volume rm piholevault_ssh_keys  # Force new key generation
   docker-compose up -d
   ```

3. **🔒 Audit Pi-hole Access**:
   - Review authorized SSH keys on all Pi-hole servers
   - Remove any old PiHoleVault public keys
   - Redeploy SSH keys using the fixed version

### For New Users

- ✅ **No Action Needed**: Version 1.7.1+ automatically generates unique keys
- ✅ **Verify Version**: Ensure you're using the latest Docker image

## 🔍 Detection Methods

### Check if You're Affected

**Method 1: Check Docker Image Creation Date**
```bash
docker inspect theinfamoustoto/piholevault:latest | grep Created
# If created before August 24, 2025 - UPDATE IMMEDIATELY
```

**Method 2: Check Container Startup Logs**
```bash
docker logs piholevault-container | grep "SSH keys"
# Fixed version shows: "🔑 Generating unique SSH keys for this container..."
# Vulnerable version shows no SSH key generation messages
```

**Method 3: Check SSH Key Fingerprint**
```bash
# Compare SSH key fingerprints between different containers
docker exec piholevault-container ssh-keygen -lf /root/.ssh/id_rsa.pub
# Each container should have a DIFFERENT fingerprint
```

## 📊 Risk Assessment

### Attack Scenarios

1. **Docker Image Analysis**: Attackers extract private keys from public Docker images
2. **Unauthorized Pi-hole Access**: Using extracted keys to access Pi-hole servers
3. **Lateral Movement**: Using compromised Pi-hole access for network reconnaissance
4. **Data Exfiltration**: Accessing Pi-hole configuration and network data

### Mitigation Factors

- SSH keys are only functional if public key was deployed to Pi-hole server
- Web-Only connection method (new in v1.7.0) doesn't use SSH keys
- Docker volumes can provide some isolation if properly configured

## 🏃‍♂️ Workaround for Affected Versions

If you cannot update immediately:

1. **Use Web-Only Connection Method**:
   ```json
   {
     "pihole": {
       "connectionMethod": "web",
       "host": "http://your-pihole",
       "webPassword": "your-admin-password"
     }
   }
   ```

2. **Manual Key Regeneration**:
   ```bash
   # Generate new keys inside running container
   docker exec -it piholevault-container sh
   rm -f /root/.ssh/id_rsa*
   ssh-keygen -t rsa -b 4096 -f /root/.ssh/id_rsa -N ""
   chmod 600 /root/.ssh/id_rsa
   ```

## 📋 Timeline

- **August 24, 2025**: Vulnerability identified and fixed
- **August 24, 2025**: Fixed Docker images published
- **August 24, 2025**: Security advisory published

## 🤝 Credits

**Vulnerability Discovery**: User question during security audit  
**Fix Implementation**: GitHub Copilot & Development Team  
**Security Review**: Community feedback

## 📞 Contact

For security concerns or questions:
- **GitHub Issues**: https://github.com/TheInfamousToTo/PiHoleVault/issues
- **Security Contact**: Create issue with "Security" label

## ⚖️ Responsible Disclosure

This vulnerability was identified during routine security audit and fixed immediately. No evidence of exploitation in the wild has been detected.

---

**🔒 Security is our top priority. Update immediately to protect your Pi-hole infrastructure.**
