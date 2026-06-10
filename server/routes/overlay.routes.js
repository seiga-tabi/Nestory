const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { createHttpError } = require('../utils/httpError');
const overlayService = require('../services/overlay.service');
const {
  overlayAssetUpload,
  validateUploadedOverlayAsset,
  removeUpload
} = require('../services/upload.service');

const router = express.Router();
const publicRouter = express.Router();

const listSchema = z.object({
  body: z.object({}).passthrough().optional().default({}),
  query: z.object({
    streamerId: z.string().optional(),
    streamerProfileId: z.string().optional(),
    streamerSlug: z.string().optional()
  }).passthrough(),
  params: z.object({})
});

const idSchema = z.object({
  body: z.object({}).passthrough().optional().default({}),
  query: z.object({}).passthrough(),
  params: z.object({ id: z.string().min(1) })
});

const assetIdSchema = z.object({
  body: z.object({}).passthrough().optional().default({}),
  query: z.object({}).passthrough(),
  params: z.object({
    id: z.string().min(1),
    assetId: z.string().min(1)
  })
});

const publicTokenSchema = z.object({
  body: z.object({}).passthrough().optional().default({}),
  query: z.object({}).passthrough(),
  params: z.object({ token: z.string().min(20) })
});

const overlayBodySchema = z.object({
  body: z.object({
    streamerId: z.string().optional(),
    streamerProfileId: z.string().optional(),
    streamerSlug: z.string().optional(),
    title: z.string().max(80).optional(),
    description: z.string().max(500).optional().nullable(),
    mode: z.enum(['BUILDER', 'CUSTOM_HTML_CSS', 'CUSTOM_ADVANCED']).optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'DISABLED']).optional(),
    name: z.string().max(80).optional(),
    slug: z.string().max(80).optional(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    thumbnailUrl: z.string().max(500).optional().nullable(),
    htmlCode: z.string().max(20000).optional(),
    cssCode: z.string().max(20000).optional(),
    jsCode: z.string().max(20000).optional(),
    allowCustomJs: z.boolean().optional(),
    isEnabled: z.boolean().optional(),
    configJson: z.any().optional(),
    config: z.any().optional()
  }),
  query: z.object({}).passthrough(),
  params: z.object({})
});

const overlayPatchSchema = z.object({
  body: z.object({
    title: z.string().max(80).optional(),
    description: z.string().max(500).optional().nullable(),
    mode: z.enum(['BUILDER', 'CUSTOM_HTML_CSS', 'CUSTOM_ADVANCED']).optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'DISABLED']).optional(),
    name: z.string().max(80).optional(),
    slug: z.string().max(80).optional(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    thumbnailUrl: z.string().max(500).optional().nullable(),
    htmlCode: z.string().max(20000).optional(),
    cssCode: z.string().max(20000).optional(),
    jsCode: z.string().max(20000).optional(),
    allowCustomJs: z.boolean().optional(),
    isEnabled: z.boolean().optional(),
    configJson: z.any().optional(),
    config: z.any().optional()
  }),
  query: z.object({}).passthrough(),
  params: z.object({ id: z.string().min(1) })
});

const publicOverlayHandler = asyncHandler(async (req, res) => {
  res.json(await overlayService.getPublicOverlayByToken(req.validated.params.token));
});

const overlayAssetFields = overlayAssetUpload.fields([
  { name: 'asset', maxCount: 1 },
  { name: 'image', maxCount: 1 },
  { name: 'file', maxCount: 1 }
]);

function uploadedOverlayAsset(req) {
  return req.files?.asset?.[0] || req.files?.image?.[0] || req.files?.file?.[0] || null;
}

router.get('/public/:token', validate(publicTokenSchema), publicOverlayHandler);
publicRouter.get('/:token', validate(publicTokenSchema), publicOverlayHandler);

router.use(requireAuth);

router.get('/', validate(listSchema), asyncHandler(async (req, res) => {
  res.json({ ok: true, items: await overlayService.listOverlays(req.user, req.validated.query) });
}));

router.post('/', validate(overlayBodySchema), asyncHandler(async (req, res) => {
  res.status(201).json({ ok: true, item: await overlayService.createOverlay(req.user, req.validated.body) });
}));

router.get('/:id/assets', validate(idSchema), asyncHandler(async (req, res) => {
  res.json({ ok: true, items: await overlayService.listOverlayAssets(req.user, req.validated.params.id) });
}));

router.post(
  '/:id/assets',
  validate(idSchema),
  asyncHandler(async (req, _res, next) => {
    await overlayService.assertOverlayAccess(req.user, req.validated.params.id);
    return next();
  }),
  overlayAssetFields,
  asyncHandler(async (req, res) => {
    const file = uploadedOverlayAsset(req);
    if (!file) {
      throw createHttpError(400, '업로드할 오버레이 이미지를 선택해주세요.', 'UPLOAD_FILE_REQUIRED');
    }

    await validateUploadedOverlayAsset(file);
    const url = `/uploads/overlays/${file.filename}`;
    try {
      const item = await overlayService.createOverlayAsset(req.user, req.validated.params.id, file, url);
      res.status(201).json({
        ok: true,
        item,
        url: item.url
      });
    } catch (error) {
      removeUpload(url);
      throw error;
    }
  })
);

router.delete('/:id/assets/:assetId', validate(assetIdSchema), asyncHandler(async (req, res) => {
  res.json({
    ok: true,
    item: await overlayService.deleteOverlayAsset(req.user, req.validated.params.id, req.validated.params.assetId)
  });
}));

router.get('/:id', validate(idSchema), asyncHandler(async (req, res) => {
  res.json({ ok: true, item: await overlayService.getOverlay(req.user, req.validated.params.id) });
}));

router.patch('/:id', validate(overlayPatchSchema), asyncHandler(async (req, res) => {
  res.json({ ok: true, item: await overlayService.updateOverlay(req.user, req.validated.params.id, req.validated.body) });
}));

router.delete('/:id', validate(idSchema), asyncHandler(async (req, res) => {
  res.json({ ok: true, item: await overlayService.disableOverlay(req.user, req.validated.params.id) });
}));

router.post('/:id/duplicate', validate(idSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ ok: true, item: await overlayService.duplicateOverlay(req.user, req.validated.params.id) });
}));

router.post('/:id/regenerate-token', validate(idSchema), asyncHandler(async (req, res) => {
  res.json({ ok: true, item: await overlayService.regenerateOverlayToken(req.user, req.validated.params.id) });
}));

module.exports = { overlayRoutes: router, overlayPublicRoutes: publicRouter };
