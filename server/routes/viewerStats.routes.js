const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { getViewerStats } = require('../services/viewerStats.service');

const router = express.Router();

router.use(requireAuth);

router.get('/me', asyncHandler(async (req, res) => {
  res.json(await getViewerStats(req.user));
}));

module.exports = { viewerStatsRoutes: router };
