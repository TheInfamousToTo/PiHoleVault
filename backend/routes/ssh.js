const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { NodeSSH } = require('node-ssh');
const router = express.Router();

// Setup SSH key
router.post('/setup-key', async (req, res) => {
  const { host, username, password, port = 22 } = req.body;
  
  if (!host || !username || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required connection parameters' 
    });
  }

  try {
    req.app.locals.logger.info('Setting up SSH key', { host, username });
    
    const sshDir = '/root/.ssh';
    const privateKeyPath = path.join(sshDir, 'id_rsa');
    const publicKeyPath = path.join(sshDir, 'id_rsa.pub');
    
    // Ensure SSH directory exists
    await fs.ensureDir(sshDir);
    await fs.chmod(sshDir, 0o700);
    
    // Generate SSH key pair if it doesn't exist
    if (!await fs.pathExists(privateKeyPath)) {
      req.app.locals.logger.info('Generating SSH key pair');
      
      try {
        execSync(`ssh-keygen -t rsa -b 4096 -f ${privateKeyPath} -N "" -C "pihole-backup@$(hostname)"`, {
          stdio: 'inherit'
        });
        
        await fs.chmod(privateKeyPath, 0o600);
        await fs.chmod(publicKeyPath, 0o644);
        
        req.app.locals.logger.info('SSH key pair generated successfully');
      } catch (error) {
        req.app.locals.logger.error('Failed to generate SSH key', { error: error.message });
        return res.json({ 
          success: false, 
          error: `Failed to generate SSH key: ${error.message}` 
        });
      }
    }
    
    // Read the public key
    const publicKey = await fs.readFile(publicKeyPath, 'utf8');
    
    // Connect to remote server and deploy the key
    const ssh = new NodeSSH();
    
    try {
      req.app.locals.logger.info('Attempting SSH connection', { host, port, username });
      
      await ssh.connect({
        host,
        username,
        password,
        port,
        readyTimeout: 15000,
        algorithms: {
          serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-ed25519'],
          hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
          cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-gcm', 'aes256-gcm'],
          compress: ['none']
        }
      });
      
      req.app.locals.logger.info('SSH connection successful');
      
      // Check if .ssh directory exists and create if needed
      const checkSshDir = await ssh.execCommand('ls -la ~/.ssh || echo "NO_SSH_DIR"');
      req.app.locals.logger.info('SSH directory check result', { stdout: checkSshDir.stdout, stderr: checkSshDir.stderr });
      
      // Create .ssh directory on remote server
      const createDirResult = await ssh.execCommand('mkdir -p ~/.ssh && chmod 700 ~/.ssh');
      if (createDirResult.code !== 0) {
        req.app.locals.logger.error('Failed to create SSH directory', { result: createDirResult });
        return res.json({ 
          success: false, 
          error: `Failed to create SSH directory: ${createDirResult.stderr}` 
        });
      }
      
      // Check current authorized_keys
      const checkKeysResult = await ssh.execCommand('ls -la ~/.ssh/authorized_keys || echo "NO_AUTHORIZED_KEYS"');
      req.app.locals.logger.info('Authorized keys check', { stdout: checkKeysResult.stdout, stderr: checkKeysResult.stderr });
      
      // Add public key to authorized_keys (using a safer approach)
      const escapedKey = publicKey.trim().replace(/'/g, "'\"'\"'");
      const addKeyCommand = `echo '${escapedKey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`;
      req.app.locals.logger.info('Adding SSH key', { command: addKeyCommand.replace(escapedKey, '[KEY_REDACTED]') });
      
      const result = await ssh.execCommand(addKeyCommand);
      
      if (result.code !== 0) {
        await ssh.dispose();
        req.app.locals.logger.error('Failed to add SSH key', { result });
        return res.json({ 
          success: false, 
          error: `Failed to add SSH key: ${result.stderr || result.stdout}` 
        });
      }
      
      req.app.locals.logger.info('SSH key added successfully', { result });
      
      // Verify the key was added
      const verifyResult = await ssh.execCommand('tail -1 ~/.ssh/authorized_keys');
      req.app.locals.logger.info('Key verification', { result: verifyResult });
      
      // Test the key-based authentication
      await ssh.dispose();
      
      req.app.locals.logger.info('Testing SSH key authentication');
      const testSSH = new NodeSSH();
      try {
        // Create a temporary SSH config to ensure no strict host checking
        const sshConfigPath = path.join(sshDir, 'config');
        await fs.writeFile(sshConfigPath, 'StrictHostKeyChecking no\nUserKnownHostsFile /dev/null\n');
        await fs.chmod(sshConfigPath, 0o600);
        
        req.app.locals.logger.info('Attempting SSH key authentication');
        
        await testSSH.connect({
          host,
          username,
          privateKey: await fs.readFile(privateKeyPath, 'utf8'),
          port,
          readyTimeout: 20000,
          // Fall back to password auth if key fails
          tryKeyboard: true,
          onKeyboardInteractive: (name, instructions, instructionsLang, prompts, finish) => {
            if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password')) {
              finish([password]);
            }
          },
          algorithms: {
            serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-ed25519'],
            hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
            cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-gcm', 'aes256-gcm'],
            compress: ['none']
          }
        });
        
        req.app.locals.logger.info('SSH key authentication test successful');
        
        // Run a test command
        const testCommand = await testSSH.execCommand('whoami');
        req.app.locals.logger.info('Test command result', { result: testCommand });
        
        await testSSH.dispose();
        
        // Update configuration to mark SSH key as deployed
        const configPath = path.join(req.app.locals.DATA_DIR, 'config.json');
        if (await fs.pathExists(configPath)) {
          const config = await fs.readJson(configPath);
          config.sshKeyDeployed = true;
          config.sshKeyPath = privateKeyPath;
          config.updatedAt = new Date().toISOString();
          await fs.writeJson(configPath, config, { spaces: 2 });
        }
        
        req.app.locals.logger.info('SSH key deployed and tested successfully', { host });
        res.json({ 
          success: true, 
          message: 'SSH key deployed successfully' 
        });
        
      } catch (keyTestError) {
        req.app.locals.logger.error('SSH key test failed', { 
          host, 
          error: keyTestError.message 
        });
        res.json({ 
          success: false, 
          error: `SSH key deployment failed: ${keyTestError.message}` 
        });
      }
      
    } catch (error) {
      if (ssh) {
        try {
          await ssh.dispose();
        } catch (e) {
          // Ignore disposal errors
        }
      }
      
      req.app.locals.logger.error('SSH connection failed during key deployment', { 
        host, 
        error: error.message 
      });
      
      res.json({ 
        success: false, 
        error: `SSH connection failed: ${error.message}` 
      });
    }
    
  } catch (error) {
    req.app.locals.logger.error('Error setting up SSH key', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug SSH connectivity
router.post('/debug', async (req, res) => {
  const { host, username, password, port = 22 } = req.body;
  
  if (!host || !username || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required connection parameters' 
    });
  }

  const debug = {
    timestamp: new Date().toISOString(),
    host,
    port,
    username,
    tests: {}
  };

  try {
    // Test 1: Basic network connectivity
    try {
      const { execSync } = require('child_process');
      const pingResult = execSync(`ping -c 1 -W 3 ${host}`, { timeout: 5000 }).toString();
      debug.tests.ping = { success: true, output: pingResult.trim() };
    } catch (error) {
      debug.tests.ping = { success: false, error: error.message };
    }

    // Test 2: Port connectivity
    try {
      const net = require('net');
      const socket = new net.Socket();
      
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          socket.destroy();
          reject(new Error('Connection timeout'));
        }, 5000);

        socket.connect(port, host, () => {
          clearTimeout(timeout);
          socket.destroy();
          resolve();
        });

        socket.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      
      debug.tests.portConnectivity = { success: true };
    } catch (error) {
      debug.tests.portConnectivity = { success: false, error: error.message };
    }

    // Test 3: SSH connection with password
    const ssh = new NodeSSH();
    try {
      await ssh.connect({
        host,
        username,
        password,
        port,
        readyTimeout: 10000,
        algorithms: {
          serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-ed25519'],
          hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
          cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-gcm', 'aes256-gcm'],
          compress: ['none']
        }
      });

      debug.tests.sshConnection = { success: true };

      // Test basic commands
      const whoamiResult = await ssh.execCommand('whoami');
      debug.tests.whoami = { 
        success: whoamiResult.code === 0, 
        output: whoamiResult.stdout || whoamiResult.stderr 
      };

      const homeResult = await ssh.execCommand('pwd && ls -la');
      debug.tests.homeDirectory = { 
        success: homeResult.code === 0, 
        output: homeResult.stdout || homeResult.stderr 
      };

      const sshDirResult = await ssh.execCommand('ls -la ~/.ssh || echo "NO_SSH_DIR"');
      debug.tests.sshDirectory = { 
        success: true, 
        output: sshDirResult.stdout || sshDirResult.stderr 
      };

      await ssh.dispose();
      
    } catch (error) {
      debug.tests.sshConnection = { success: false, error: error.message };
    }

    // Test 4: Check if SSH keys exist locally
    const sshDir = '/root/.ssh';
    const privateKeyPath = path.join(sshDir, 'id_rsa');
    const publicKeyPath = path.join(sshDir, 'id_rsa.pub');
    
    debug.tests.localSshKeys = {
      sshDirExists: await fs.pathExists(sshDir),
      privateKeyExists: await fs.pathExists(privateKeyPath),
      publicKeyExists: await fs.pathExists(publicKeyPath)
    };

    if (await fs.pathExists(publicKeyPath)) {
      const publicKey = await fs.readFile(publicKeyPath, 'utf8');
      debug.tests.localSshKeys.publicKeyLength = publicKey.length;
      debug.tests.localSshKeys.publicKeyPreview = publicKey.substring(0, 50) + '...';
    }

    res.json({ success: true, debug });

  } catch (error) {
    debug.tests.generalError = { success: false, error: error.message };
    res.json({ success: false, debug });
  }
});

// Test SSH key authentication
router.post('/test-key', async (req, res) => {
  try {
    const configPath = path.join(req.app.locals.DATA_DIR, 'config.json');
    
    if (!await fs.pathExists(configPath)) {
      return res.status(404).json({ success: false, error: 'Configuration not found' });
    }
    
    const config = await fs.readJson(configPath);
    
    if (!config.pihole || !config.sshKeyDeployed) {
      return res.status(400).json({ 
        success: false, 
        error: 'SSH key not configured' 
      });
    }

    const ssh = new NodeSSH();
    
    try {
      await ssh.connect({
        host: config.pihole.host,
        username: config.pihole.username,
        privateKeyPath: config.sshKeyPath || '/root/.ssh/id_rsa',
        port: config.pihole.port || 22,
        readyTimeout: 5000,
      });

      // Test a simple command
      const result = await ssh.execCommand('echo "SSH key authentication successful"');
      
      await ssh.dispose();
      
      if (result.code === 0) {
        res.json({ 
          success: true, 
          message: 'SSH key authentication successful' 
        });
      } else {
        res.json({ 
          success: false, 
          error: 'SSH key authentication failed' 
        });
      }
      
    } catch (error) {
      if (ssh) {
        try {
          await ssh.dispose();
        } catch (e) {
          // Ignore disposal errors
        }
      }
      
      res.json({ 
        success: false, 
        error: `SSH key authentication failed: ${error.message}` 
      });
    }
    
  } catch (error) {
    req.app.locals.logger.error('Error testing SSH key', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test SSH connection with password (for initial setup)
router.post('/test', async (req, res) => {
  const { host, username, password, port = 22 } = req.body;
  
  if (!host || !username || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required connection parameters' 
    });
  }

  const ssh = new NodeSSH();
  
  try {
    req.app.locals.logger.info('Testing SSH connection', { host, username, port });
    
    await ssh.connect({
      host,
      username,
      password,
      port,
      readyTimeout: 10000,
    });

    // Test if pihole-FTL command exists
    const result = await ssh.execCommand('which pihole-FTL');
    
    if (result.code !== 0) {
      await ssh.dispose();
      return res.json({ 
        success: false, 
        error: 'Pi-hole not found on the target server. Please ensure Pi-hole is installed.' 
      });
    }

    // Test pihole-FTL teleporter command
    const teleporterTest = await ssh.execCommand('pihole-FTL --help | grep -i teleporter');
    
    if (teleporterTest.code !== 0) {
      await ssh.dispose();
      return res.json({ 
        success: false, 
        error: 'Pi-hole teleporter command not available. Please update Pi-hole to a newer version.' 
      });
    }

    await ssh.dispose();
    
    req.app.locals.logger.info('SSH connection test successful', { host });
    res.json({ success: true, message: 'Connection successful! Pi-hole found and ready for backup.' });
    
  } catch (error) {
    if (ssh) {
      try {
        await ssh.dispose();
      } catch (e) {
        // Ignore disposal errors
      }
    }
    
    req.app.locals.logger.error('SSH connection test failed', { 
      host, 
      error: error.message 
    });
    
    let errorMessage = error.message;
    
    // Provide better error messages for common issues
    if (error.level === 'client-authentication') {
      errorMessage = 'Authentication failed. Please check your username and password.';
    } else if (error.level === 'client-timeout') {
      errorMessage = 'Connection timeout. Please check the server address and port.';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Server not found. Please check the hostname/IP address.';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused. Please check if SSH service is running on the server.';
    } else if (error.code === 'EHOSTUNREACH') {
      errorMessage = 'Host unreachable. Please check the network connection.';
    }
    
    res.json({ 
      success: false, 
      error: `Connection failed: ${errorMessage}` 
    });
  }
});

// Get SSH key status
router.get('/status', async (req, res) => {
  try {
    const configPath = path.join(req.app.locals.DATA_DIR, 'config.json');
    const privateKeyPath = '/root/.ssh/id_rsa';
    const publicKeyPath = '/root/.ssh/id_rsa.pub';
    
    let config = {};
    if (await fs.pathExists(configPath)) {
      config = await fs.readJson(configPath);
    }
    
    const status = {
      keyPairExists: await fs.pathExists(privateKeyPath) && await fs.pathExists(publicKeyPath),
      keyDeployed: !!config.sshKeyDeployed,
      keyPath: privateKeyPath
    };
    
    if (status.keyPairExists && await fs.pathExists(publicKeyPath)) {
      status.publicKey = await fs.readFile(publicKeyPath, 'utf8');
    }
    
    res.json(status);
    
  } catch (error) {
    req.app.locals.logger.error('Error getting SSH status', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
