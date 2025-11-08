import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { ReportingService } from '../services/reporting.service';
import { logger } from '../utils/logger';

const router = Router();
const prisma = new PrismaClient();
const reportingService = new ReportingService(prisma);

// ============================================================================
// AGGREGATED REPORTS
// ============================================================================

/**
 * GET /reporting/engagement
 *
 * Get aggregated engagement data with confidentiality protection
 */
router.get('/engagement', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const {
      startDate,
      endDate,
      orgUnitId,
      jobFamily,
      region,
      minN = 5
    } = req.query;

    const report = await reportingService.getEngagementReport({
      tenantId: user.tenantId,
      userId: user.id,
      filters: {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        orgUnitId: orgUnitId as string | undefined,
        jobFamily: jobFamily as string | undefined,
        region: region as string | undefined
      },
      minN: Number(minN)
    });

    res.json(report);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /reporting/trends
 *
 * Get time-series trends for engagement signals
 */
router.get('/trends', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const {
      itemId,
      startDate,
      endDate,
      granularity = 'week',
      orgUnitId,
      jobFamily,
      minN = 5
    } = req.query;

    const trends = await reportingService.getTrends({
      tenantId: user.tenantId,
      userId: user.id,
      itemId: itemId as string | undefined,
      filters: {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        orgUnitId: orgUnitId as string | undefined,
        jobFamily: jobFamily as string | undefined
      },
      granularity: granularity as 'day' | 'week' | 'month',
      minN: Number(minN)
    });

    res.json(trends);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /reporting/breakdown
 *
 * Get breakdown by dimension (org unit, job family, region, etc.)
 */
router.get('/breakdown', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const {
      dimension,
      itemId,
      startDate,
      endDate,
      minN = 5
    } = req.query;

    if (!dimension) {
      return res.status(400).json({ error: 'dimension parameter required' });
    }

    const breakdown = await reportingService.getBreakdown({
      tenantId: user.tenantId,
      userId: user.id,
      dimension: dimension as string,
      itemId: itemId as string | undefined,
      filters: {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      },
      minN: Number(minN)
    });

    res.json(breakdown);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /reporting/manager/team
 *
 * Get team-level engagement for managers
 */
router.get('/manager/team', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const { startDate, endDate, includeIndirect = false, minN = 5 } = req.query;

    const teamReport = await reportingService.getManagerTeamReport({
      tenantId: user.tenantId,
      managerId: user.id,
      filters: {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      },
      includeIndirect: includeIndirect === 'true',
      minN: Number(minN)
    });

    res.json(teamReport);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /reporting/functional/cohort
 *
 * Get cohort-level engagement for functional leaders
 */
router.get('/functional/cohort', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const { jobFamily, startDate, endDate, minN = 5 } = req.query;

    if (!jobFamily) {
      return res.status(400).json({ error: 'jobFamily parameter required' });
    }

    const cohortReport = await reportingService.getFunctionalCohortReport({
      tenantId: user.tenantId,
      userId: user.id,
      jobFamily: jobFamily as string,
      filters: {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      },
      minN: Number(minN)
    });

    res.json(cohortReport);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /reporting/benchmarks
 *
 * Get benchmark comparisons (team vs org, cohort vs org, etc.)
 */
router.get('/benchmarks', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const { scopeType, scopeId, itemId, startDate, endDate, minN = 5 } = req.query;

    const benchmarks = await reportingService.getBenchmarks({
      tenantId: user.tenantId,
      userId: user.id,
      scopeType: scopeType as 'team' | 'orgUnit' | 'jobFamily',
      scopeId: scopeId as string | undefined,
      itemId: itemId as string | undefined,
      filters: {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined
      },
      minN: Number(minN)
    });

    res.json(benchmarks);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /reporting/export
 *
 * Export aggregated data (CSV)
 */
router.post('/export', requireAuth, async (req, res, next) => {
  try {
    const user = req.user as any;
    const { reportType, filters, format = 'csv' } = req.body;

    // Log export for audit
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        action: 'data_exported',
        resource: `report:${reportType}`,
        details: { filters, format },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    });

    const exportData = await reportingService.exportData({
      tenantId: user.tenantId,
      userId: user.id,
      reportType,
      filters,
      format
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="signalloop-export-${Date.now()}.csv"`);
    res.send(exportData);
  } catch (error) {
    next(error);
  }
});

export const reportingRoutes = router;
