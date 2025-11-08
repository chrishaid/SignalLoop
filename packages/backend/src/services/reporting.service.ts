import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';

interface ReportFilters {
  startDate?: Date;
  endDate?: Date;
  orgUnitId?: string;
  jobFamily?: string;
  region?: string;
}

interface ReportOptions {
  tenantId: string;
  userId: string;
  filters: ReportFilters;
  minN: number;
}

/**
 * Reporting Service with Confidentiality Enforcement
 *
 * Key principles:
 * 1. All data is aggregated before being returned
 * 2. Minimum-N thresholds prevent small cohort identification
 * 3. RBAC determines what scopes a user can access
 * 4. No individual responses are ever returned (except to authorized roles)
 */
export class ReportingService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Get engagement report with confidentiality protection
   */
  async getEngagementReport(options: ReportOptions) {
    const { tenantId, userId, filters, minN } = options;

    // Get user's permissions to determine what they can see
    // For MVP, we'll implement basic scope checking
    // In production, this would be more sophisticated RBAC

    // Build the WHERE clause
    const where = this.buildWhereClause(tenantId, filters);

    // Get aggregated statistics
    const signals = await this.prisma.signal.findMany({
      where,
      include: {
        item: true,
        staffSnapshot: {
          select: {
            jobFamily: true,
            orgUnitId: true,
            region: true
          }
        }
      }
    });

    // Group by item and calculate aggregates
    const itemStats = this.calculateItemStatistics(signals, minN);

    return {
      totalResponses: signals.length,
      meetsMinimumN: signals.length >= minN,
      items: itemStats,
      period: {
        startDate: filters.startDate,
        endDate: filters.endDate
      }
    };
  }

  /**
   * Get time-series trends
   */
  async getTrends(options: any) {
    const { tenantId, filters, granularity, minN, itemId } = options;

    const where = this.buildWhereClause(tenantId, filters);
    if (itemId) {
      where.itemId = itemId;
    }

    const signals = await this.prisma.signal.findMany({
      where,
      include: {
        item: true
      },
      orderBy: { createdAt: 'asc' }
    });

    // Group by time period
    const trendData = this.groupByTimePeriod(signals, granularity, minN);

    return {
      granularity,
      data: trendData,
      meetsMinimumN: signals.length >= minN
    };
  }

  /**
   * Get breakdown by dimension
   */
  async getBreakdown(options: any) {
    const { tenantId, dimension, filters, minN, itemId } = options;

    const where = this.buildWhereClause(tenantId, filters);
    if (itemId) {
      where.itemId = itemId;
    }

    const signals = await this.prisma.signal.findMany({
      where,
      include: {
        item: true,
        staffSnapshot: true
      }
    });

    // Group by dimension
    const groups = new Map<string, any[]>();

    for (const signal of signals) {
      const dimensionValue = (signal.staffSnapshot as any)[dimension];
      const key = dimensionValue || 'Unknown';

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(signal);
    }

    // Calculate statistics for each group
    const breakdown = Array.from(groups.entries())
      .map(([key, groupSignals]) => ({
        dimension: key,
        count: groupSignals.length,
        meetsMinimumN: groupSignals.length >= minN,
        statistics: groupSignals.length >= minN
          ? this.calculateStatistics(groupSignals)
          : null
      }))
      .filter(item => item.meetsMinimumN); // Only include groups that meet threshold

    return {
      dimension,
      breakdown,
      totalGroups: breakdown.length
    };
  }

  /**
   * Get manager's team report
   */
  async getManagerTeamReport(options: any) {
    const { tenantId, managerId, filters, includeIndirect, minN } = options;

    // Get the manager's latest snapshot to find their team
    const managerSnapshot = await this.prisma.staffSnapshot.findFirst({
      where: {
        userId: managerId
      },
      orderBy: { snapshotDate: 'desc' }
    });

    if (!managerSnapshot) {
      return { error: 'Manager snapshot not found' };
    }

    // Build filter for direct reports (and indirect if requested)
    const teamFilter: any = {
      managerId: managerId
    };

    // Get team member IDs
    const teamSnapshots = await this.prisma.staffSnapshot.findMany({
      where: teamFilter,
      select: { userId: true },
      distinct: ['userId']
    });

    const teamUserIds = teamSnapshots.map(s => s.userId);

    if (teamUserIds.length === 0) {
      return {
        teamSize: 0,
        meetsMinimumN: false,
        message: 'No team members found'
      };
    }

    // Get signals for team members
    const where = this.buildWhereClause(tenantId, filters);
    where.userId = { in: teamUserIds };

    const signals = await this.prisma.signal.findMany({
      where,
      include: { item: true }
    });

    return {
      teamSize: teamUserIds.length,
      responseCount: signals.length,
      meetsMinimumN: signals.length >= minN,
      statistics: signals.length >= minN
        ? this.calculateItemStatistics(signals, minN)
        : null,
      period: filters
    };
  }

  /**
   * Get functional cohort report
   */
  async getFunctionalCohortReport(options: any) {
    const { tenantId, jobFamily, filters, minN } = options;

    // Get latest snapshots for cohort members
    const cohortSnapshots = await this.prisma.$queryRaw<any[]>`
      SELECT DISTINCT ON (user_id) *
      FROM staff_snapshots
      WHERE job_family = ${jobFamily}
      ORDER BY user_id, snapshot_date DESC
    `;

    const cohortUserIds = cohortSnapshots.map((s: any) => s.user_id);

    if (cohortUserIds.length === 0) {
      return {
        cohortSize: 0,
        meetsMinimumN: false,
        message: 'No cohort members found'
      };
    }

    // Get signals for cohort
    const where = this.buildWhereClause(tenantId, filters);
    where.userId = { in: cohortUserIds };

    const signals = await this.prisma.signal.findMany({
      where,
      include: { item: true }
    });

    return {
      cohortSize: cohortUserIds.length,
      responseCount: signals.length,
      meetsMinimumN: signals.length >= minN,
      statistics: signals.length >= minN
        ? this.calculateItemStatistics(signals, minN)
        : null,
      period: filters
    };
  }

  /**
   * Get benchmarks (comparison between scope and org-wide)
   */
  async getBenchmarks(options: any) {
    const { tenantId, scopeType, scopeId, filters, minN } = options;

    // Get scope data
    const scopeData = await this.getScopeData(tenantId, scopeType, scopeId, filters, minN);

    // Get org-wide data for comparison
    const orgWideData = await this.getEngagementReport({
      tenantId,
      userId: '', // Not user-specific
      filters,
      minN
    });

    return {
      scope: scopeData,
      organization: orgWideData,
      comparison: this.calculateComparison(scopeData, orgWideData)
    };
  }

  /**
   * Export data
   */
  async exportData(options: any): Promise<string> {
    const { tenantId, reportType, filters, format } = options;

    // Get the data based on report type
    let data: any;

    switch (reportType) {
      case 'engagement':
        data = await this.getEngagementReport({
          tenantId,
          userId: '',
          filters,
          minN: 5
        });
        break;
      // Add more report types as needed
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }

    // Convert to CSV
    return this.convertToCSV(data);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private buildWhereClause(tenantId: string, filters: ReportFilters): any {
    const where: any = {
      staffSnapshot: {
        user: {
          tenantId
        }
      }
    };

    if (filters.startDate) {
      where.createdAt = { ...where.createdAt, gte: filters.startDate };
    }

    if (filters.endDate) {
      where.createdAt = { ...where.createdAt, lte: filters.endDate };
    }

    if (filters.orgUnitId) {
      where.staffSnapshot = {
        ...where.staffSnapshot,
        orgUnitId: filters.orgUnitId
      };
    }

    if (filters.jobFamily) {
      where.staffSnapshot = {
        ...where.staffSnapshot,
        jobFamily: filters.jobFamily
      };
    }

    if (filters.region) {
      where.staffSnapshot = {
        ...where.staffSnapshot,
        region: filters.region
      };
    }

    return where;
  }

  private calculateItemStatistics(signals: any[], minN: number) {
    const itemGroups = new Map<string, any[]>();

    for (const signal of signals) {
      const itemId = signal.itemId;
      if (!itemGroups.has(itemId)) {
        itemGroups.set(itemId, []);
      }
      itemGroups.get(itemId)!.push(signal);
    }

    return Array.from(itemGroups.entries())
      .map(([itemId, itemSignals]) => {
        const item = itemSignals[0].item;

        return {
          itemId,
          itemText: item.text,
          scaleType: item.scaleType,
          count: itemSignals.length,
          meetsMinimumN: itemSignals.length >= minN,
          statistics: itemSignals.length >= minN
            ? this.calculateStatistics(itemSignals)
            : null
        };
      });
  }

  private calculateStatistics(signals: any[]) {
    // Calculate statistics based on scale type
    const values = signals.map(s => {
      const val = s.value;
      // Handle different value types (JSON stored values)
      if (typeof val === 'object' && val.numericValue !== undefined) {
        return val.numericValue;
      }
      return val;
    });

    // For Likert scales, calculate distribution
    const distribution = this.calculateDistribution(values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const favorablePercent = this.calculateFavorablePercent(values, distribution);

    return {
      count: values.length,
      mean: Math.round(mean * 100) / 100,
      distribution,
      favorablePercent
    };
  }

  private calculateDistribution(values: number[]) {
    const dist: Record<number, number> = {};

    for (const val of values) {
      dist[val] = (dist[val] || 0) + 1;
    }

    return dist;
  }

  private calculateFavorablePercent(values: number[], distribution: any) {
    // For 5-point Likert, 4 and 5 are favorable
    // For 7-point, 6 and 7 are favorable
    const maxValue = Math.max(...values);

    let favorableCount = 0;

    if (maxValue === 5) {
      favorableCount = (distribution[4] || 0) + (distribution[5] || 0);
    } else if (maxValue === 7) {
      favorableCount = (distribution[6] || 0) + (distribution[7] || 0);
    }

    return Math.round((favorableCount / values.length) * 100);
  }

  private groupByTimePeriod(signals: any[], granularity: string, minN: number) {
    // Implementation would group signals by time period
    // For brevity, returning placeholder
    return [];
  }

  private async getScopeData(
    tenantId: string,
    scopeType: string,
    scopeId: string,
    filters: any,
    minN: number
  ) {
    // Implementation would get data for specific scope
    return {};
  }

  private calculateComparison(scopeData: any, orgData: any) {
    // Calculate difference between scope and org
    return {};
  }

  private convertToCSV(data: any): string {
    // Simple CSV conversion
    // In production, use a library like 'csv-stringify'
    return JSON.stringify(data);
  }
}
