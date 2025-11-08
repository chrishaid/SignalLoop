import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { SurveyService } from '../services/survey.service';
import { logger } from '../utils/logger';

const router = Router();
const prisma = new PrismaClient();
const surveyService = new SurveyService(prisma);

// ============================================================================
// SURVEY PROMPT (SSO Intercept)
// ============================================================================

/**
 * GET /survey/prompt
 *
 * This endpoint is called after successful SSO authentication.
 * It determines if the user should see a survey and returns the appropriate item.
 */
router.get('/prompt', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;

    // Check if user is eligible for a survey right now
    const eligibility = await surveyService.checkEligibility(user.id);

    if (!eligibility.eligible) {
      // No survey to show, redirect to intended destination
      return res.redirect(req.session.returnTo || '/dashboard');
    }

    // Get the next item to show
    const item = await surveyService.getNextItem(user.id, eligibility.campaignId!);

    if (!item) {
      logger.warn(`No item found for eligible user ${user.id}`);
      return res.redirect(req.session.returnTo || '/dashboard');
    }

    // Render survey prompt page (in production, this would be a frontend route)
    res.json({
      showSurvey: true,
      item: {
        id: item.id,
        text: item.text,
        scaleType: item.scaleType,
        scaleConfig: item.scaleConfig
      },
      campaign: {
        id: eligibility.campaignId
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /survey/submit
 *
 * Submit a survey response
 */
router.post('/submit', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const { itemId, value, deliveryContext } = req.body;

    // Validate input
    if (!itemId || value === undefined) {
      return res.status(400).json({ error: 'itemId and value are required' });
    }

    // Record the signal
    const signal = await surveyService.recordSignal({
      userId: user.id,
      itemId,
      value,
      deliveryContext: deliveryContext || 'sso_login',
      clientInfo: {
        userAgent: req.get('user-agent'),
        ip: req.ip
      }
    });

    logger.info(`Signal recorded: ${signal.id} for user ${user.id}`);

    res.json({
      success: true,
      signalId: signal.id,
      redirectTo: req.session.returnTo || '/dashboard'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /survey/history
 *
 * Get user's own survey history
 */
router.get('/history', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const { limit = 50, offset = 0 } = req.query;

    const signals = await prisma.signal.findMany({
      where: { userId: user.id },
      include: {
        item: {
          select: {
            text: true,
            scaleType: true,
            category: true
          }
        },
        staffSnapshot: {
          select: {
            jobTitle: true,
            orgUnit: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset)
    });

    res.json({
      signals: signals.map(s => ({
        id: s.id,
        itemText: s.item.text,
        value: s.value,
        createdAt: s.createdAt,
        category: s.item.category
      })),
      total: await prisma.signal.count({ where: { userId: user.id } })
    });
  } catch (error) {
    next(error);
  }
});

export const surveyRoutes = router;
