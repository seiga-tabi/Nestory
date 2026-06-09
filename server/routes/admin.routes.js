const express = require('express');
const { z } = require('zod');
const { prisma } = require('../db/prisma');
const { requireAdmin } = require('../middleware/admin');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { sendError } = require('../utils/httpError');
const { sanitizeText } = require('../utils/sanitize');
const {
  listAccessRequests,
  getAccessRequest,
  approveAccessRequest,
  rejectAccessRequest
} = require('../services/accessRequest.service');

const router = express.Router();

router.use(requireAdmin);

const idSchema = z.object({
  body: z.object({}).passthrough().optional().default({}),
  query: z.object({}).passthrough(),
  params: z.object({ id: z.string().min(1) })
});

const rejectSchema = z.object({
  body: z.object({
    reason: z.string().max(500).optional().nullable()
  }).optional().default({}),
  query: z.object({}).passthrough(),
  params: z.object({ id: z.string().min(1) })
});

const listAccessRequestsHandler = asyncHandler(async (req, res) => {
  const items = await listAccessRequests(req.query);
  res.json({ items });
});

const getAccessRequestHandler = asyncHandler(async (req, res) => {
  const item = await getAccessRequest(req.params.id);
  res.json({ item });
});

const approveAccessRequestHandler = asyncHandler(async (req, res) => {
  const result = await approveAccessRequest(req.params.id, req.user);
  res.json(result);
});

const rejectAccessRequestHandler = asyncHandler(async (req, res) => {
  const item = await rejectAccessRequest(req.params.id, req.user, req.validated.body);
  res.json({ item });
});

router.get('/access-requests', listAccessRequestsHandler);
router.get('/streamer-requests', listAccessRequestsHandler);
router.get('/access-requests/:id', validate(idSchema), getAccessRequestHandler);
router.get('/streamer-requests/:id', validate(idSchema), getAccessRequestHandler);
router.post('/access-requests/:id/approve', validate(idSchema), approveAccessRequestHandler);
router.post('/streamer-requests/:id/approve', validate(idSchema), approveAccessRequestHandler);
router.post('/access-requests/:id/reject', validate(rejectSchema), rejectAccessRequestHandler);
router.post('/streamer-requests/:id/reject', validate(rejectSchema), rejectAccessRequestHandler);

router.get('/users', asyncHandler(async (_req, res) => {
  const items = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      status: true,
      twitchLogin: true,
      createdAt: true
    }
  });
  res.json({ items });
}));

router.patch('/users/:id/status', asyncHandler(async (req, res) => {
  const status = req.body.status;
  if (!['ACTIVE', 'PENDING', 'SUSPENDED'].includes(status)) {
    return sendError(res, 400, '상태값을 확인해주세요.', 'INVALID_USER_STATUS');
  }
  const item = await prisma.user.update({ where: { id: req.params.id }, data: { status } });
  res.json({ item });
}));

router.get('/profiles', asyncHandler(async (_req, res) => {
  const items = await prisma.streamerProfile.findMany({
    include: { user: { select: { email: true, displayName: true, status: true } } },
    orderBy: { updatedAt: 'desc' }
  });
  res.json({ items });
}));

router.patch('/profiles/:id', asyncHandler(async (req, res) => {
  const data = {};
  if (req.body.isPublic !== undefined) data.isPublic = Boolean(req.body.isPublic);
  if (req.body.subtitle !== undefined) data.subtitle = sanitizeText(req.body.subtitle, 180);
  if (req.body.mainContent !== undefined) data.mainContent = sanitizeText(req.body.mainContent, 80);
  const item = await prisma.streamerProfile.update({ where: { id: req.params.id }, data });
  res.json({ item });
}));

module.exports = { adminRoutes: router };
