import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, requireRole } from '../middleware/auth';
import { z } from 'zod';
import { logger } from '../utils/logger';

const router = Router();
const prisma = new PrismaClient();

// ============================================================================
// CAMPAIGNS
// ============================================================================

const createCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().transform(s => new Date(s)),
  endDate: z.string().transform(s => new Date(s)).optional(),
  cadence: z.enum(['DAILY_M_F', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY']),
  maxTouchesPerDay: z.number().min(1).default(1),
  maxTouchesPerWeek: z.number().min(1).default(3),
  timeWindows: z.array(z.object({
    dayOfWeek: z.number().min(0).max(6),
    startHour: z.number().min(0).max(23),
    endHour: z.number().min(0).max(23)
  })).optional(),
  blackouts: z.array(z.object({
    startDate: z.string(),
    endDate: z.string(),
    reason: z.string()
  })).optional()
});

router.post('/campaigns', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const data = createCampaignSchema.parse(req.body);

    const campaign = await prisma.campaign.create({
      data: {
        ...data,
        tenantId: user.tenantId,
        timeWindows: data.timeWindows || [],
        blackouts: data.blackouts || []
      }
    });

    logger.info(`Campaign created: ${campaign.id} by user ${user.id}`);

    res.status(201).json(campaign);
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const { status } = req.query;

    const campaigns = await prisma.campaign.findMany({
      where: {
        tenantId: user.tenantId,
        ...(status && { status: status as any })
      },
      include: {
        campaignItems: {
          include: {
            item: true
          }
        },
        targetRules: {
          include: {
            targetRule: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(campaigns);
  } catch (error) {
    next(error);
  }
});

router.get('/campaigns/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const { id } = req.params;

    const campaign = await prisma.campaign.findFirst({
      where: {
        id,
        tenantId: user.tenantId
      },
      include: {
        campaignItems: {
          include: {
            item: true
          }
        },
        targetRules: {
          include: {
            targetRule: true
          }
        }
      }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

router.patch('/campaigns/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const { id } = req.params;

    // Verify ownership
    const existing = await prisma.campaign.findFirst({
      where: { id, tenantId: user.tenantId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: req.body
    });

    logger.info(`Campaign updated: ${campaign.id} by user ${user.id}`);

    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ITEMS
// ============================================================================

const createItemSchema = z.object({
  signalTypeId: z.string(),
  text: z.string().min(1),
  description: z.string().optional(),
  scaleType: z.enum(['LIKERT_5', 'LIKERT_7', 'YES_NO', 'EMOJI_5', 'SCALE_0_10', 'TEXT']),
  scaleConfig: z.object({}).passthrough(),
  category: z.string().optional(),
  tags: z.array(z.string()).default([])
});

router.post('/items', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const data = createItemSchema.parse(req.body);

    const item = await prisma.item.create({
      data: {
        ...data,
        tenantId: user.tenantId
      }
    });

    logger.info(`Item created: ${item.id} by user ${user.id}`);

    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.get('/items', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const { signalTypeId, category, status } = req.query;

    const items = await prisma.item.findMany({
      where: {
        tenantId: user.tenantId,
        ...(signalTypeId && { signalTypeId: signalTypeId as string }),
        ...(category && { category: category as string }),
        ...(status && { status: status as any })
      },
      include: {
        signalType: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(items);
  } catch (error) {
    next(error);
  }
});

router.get('/items/:id', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const { id } = req.params;

    const item = await prisma.item.findFirst({
      where: {
        id,
        tenantId: user.tenantId
      },
      include: {
        signalType: true
      }
    });

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// TARGET RULES
// ============================================================================

const createTargetRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  expression: z.object({}).passthrough()
});

router.post('/target-rules', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const data = createTargetRuleSchema.parse(req.body);

    const rule = await prisma.targetRule.create({
      data: {
        ...data,
        tenantId: user.tenantId
      }
    });

    logger.info(`Target rule created: ${rule.id} by user ${user.id}`);

    res.status(201).json(rule);
  } catch (error) {
    next(error);
  }
});

router.get('/target-rules', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;

    const rules = await prisma.targetRule.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' }
    });

    res.json(rules);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// CAMPAIGN ITEMS (Link items to campaigns)
// ============================================================================

router.post('/campaigns/:campaignId/items', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const { campaignId } = req.params;
    const { itemId, weight, order } = req.body;

    // Verify campaign ownership
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, tenantId: user.tenantId }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const campaignItem = await prisma.campaignItem.create({
      data: {
        campaignId,
        itemId,
        weight: weight || 1,
        order
      }
    });

    res.status(201).json(campaignItem);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// SIGNAL TYPES
// ============================================================================

router.get('/signal-types', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;

    const signalTypes = await prisma.signalType.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { name: 'asc' }
    });

    res.json(signalTypes);
  } catch (error) {
    next(error);
  }
});

export const adminRoutes = router;
