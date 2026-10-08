const express = require('express');
const NotificationService = require('../services/NotificationService');
const StorageService = require('../services/StorageService');
const { loadConfigOrEmpty } = require('../utils/configStore');

const router = express.Router();

// Both tests use the SAVED configuration, never URLs or credentials from the
// request: an endpoint that fetched a caller-supplied URL would let anyone who
// can reach the API make this server send requests to arbitrary hosts.

// POST /api/integrations/notifications/test  { channelId }
router.post('/notifications/test', async (req, res) => {
  const channelId = req.body && typeof req.body.channelId === 'string' ? req.body.channelId : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(channelId)) {
    return res.status(400).json({ success: false, error: 'channelId is required' });
  }
  try {
    const config = await loadConfigOrEmpty(req.app.locals.DATA_DIR);
    const result = await new NotificationService(req.app.locals.logger).test(config, channelId);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// POST /api/integrations/storage/test
router.post('/storage/test', async (req, res) => {
  try {
    const config = await loadConfigOrEmpty(req.app.locals.DATA_DIR);
    const storage = new StorageService({ ...config.offsite, enabled: true }, req.app.locals.logger);
    if (!['s3', 'webdav'].includes(config.offsite?.type)) {
      return res.status(400).json({ success: false, error: 'Choose and save an off-site storage type first' });
    }
    res.json(await storage.test());
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
