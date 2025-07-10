const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const router = express.Router();

// Get job history
router.get('/', async (req, res) => {
  try {
    const jobsPath = path.join(req.app.locals.DATA_DIR, 'jobs.json');
    
    if (await fs.pathExists(jobsPath)) {
      const jobs = await fs.readJson(jobsPath);
      // Sort by timestamp (newest first)
      const sortedJobs = jobs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      res.json(sortedJobs);
    } else {
      res.json([]);
    }
  } catch (error) {
    req.app.locals.logger.error('Error reading jobs', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear job history
router.delete('/', async (req, res) => {
  try {
    const jobsPath = path.join(req.app.locals.DATA_DIR, 'jobs.json');
    await fs.writeJson(jobsPath, [], { spaces: 2 });
    
    req.app.locals.logger.info('Job history cleared');
    res.json({ success: true, message: 'Job history cleared' });
  } catch (error) {
    req.app.locals.logger.error('Error clearing jobs', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get job statistics
router.get('/stats', async (req, res) => {
  try {
    const jobsPath = path.join(req.app.locals.DATA_DIR, 'jobs.json');
    
    if (await fs.pathExists(jobsPath)) {
      const jobs = await fs.readJson(jobsPath);
      
      const stats = {
        total: jobs.length,
        successful: jobs.filter(job => job.status === 'success').length,
        failed: jobs.filter(job => job.status === 'error').length,
        running: jobs.filter(job => job.status === 'running').length,
        lastRun: jobs.length > 0 ? jobs[jobs.length - 1] : null
      };
      
      // Calculate success rate
      stats.successRate = stats.total > 0 ? (stats.successful / stats.total * 100).toFixed(2) : 0;
      
      res.json(stats);
    } else {
      res.json({
        total: 0,
        successful: 0,
        failed: 0,
        running: 0,
        successRate: 0,
        lastRun: null
      });
    }
  } catch (error) {
    req.app.locals.logger.error('Error getting job stats', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
