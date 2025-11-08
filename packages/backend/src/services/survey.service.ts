import { PrismaClient, User, Item, Signal } from '@prisma/client';
import { logger } from '../utils/logger';
import { TargetingService } from './targeting.service';

interface EligibilityResult {
  eligible: boolean;
  reason?: string;
  campaignId?: string;
}

interface RecordSignalParams {
  userId: string;
  itemId: string;
  value: any;
  deliveryContext: string;
  clientInfo?: any;
}

export class SurveyService {
  private targetingService: TargetingService;

  constructor(private prisma: PrismaClient) {
    this.targetingService = new TargetingService(prisma);
  }

  /**
   * Check if a user is eligible to receive a survey right now
   */
  async checkEligibility(userId: string): Promise<EligibilityResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        staffSnapshots: {
          orderBy: { snapshotDate: 'desc' },
          take: 1
        }
      }
    });

    if (!user || user.status !== 'ACTIVE') {
      return { eligible: false, reason: 'User not active' };
    }

    // Get latest staff snapshot
    const latestSnapshot = user.staffSnapshots[0];
    if (!latestSnapshot) {
      return { eligible: false, reason: 'No staff snapshot found' };
    }

    // Find active campaigns
    const now = new Date();
    const campaigns = await this.prisma.campaign.findMany({
      where: {
        tenantId: user.tenantId,
        status: 'ACTIVE',
        startDate: { lte: now },
        OR: [
          { endDate: null },
          { endDate: { gte: now } }
        ]
      },
      include: {
        targetRules: {
          include: {
            targetRule: true
          }
        },
        campaignItems: {
          include: {
            item: true
          }
        }
      }
    });

    if (campaigns.length === 0) {
      return { eligible: false, reason: 'No active campaigns' };
    }

    // Check each campaign for eligibility
    for (const campaign of campaigns) {
      // Check if user matches targeting rules
      const matchesRules = await this.targetingService.evaluateCampaignRules(
        campaign,
        latestSnapshot
      );

      if (!matchesRules) {
        continue;
      }

      // Check time windows
      if (!this.isWithinTimeWindow(campaign)) {
        continue;
      }

      // Check if user has been surveyed too recently
      const hasRecentResponse = await this.checkRecentResponse(
        userId,
        campaign.maxTouchesPerDay,
        campaign.maxTouchesPerWeek
      );

      if (hasRecentResponse) {
        continue;
      }

      // User is eligible for this campaign
      return {
        eligible: true,
        campaignId: campaign.id
      };
    }

    return { eligible: false, reason: 'No matching campaigns' };
  }

  /**
   * Get the next item to show for a campaign
   */
  async getNextItem(userId: string, campaignId: string): Promise<Item | null> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        campaignItems: {
          include: {
            item: true
          },
          orderBy: {
            order: 'asc'
          }
        }
      }
    });

    if (!campaign || campaign.campaignItems.length === 0) {
      return null;
    }

    // For MVP, we'll use weighted random selection
    // In production, this could be more sophisticated (least recently shown, etc.)
    const items = campaign.campaignItems;
    const totalWeight = items.reduce((sum, ci) => sum + ci.weight, 0);
    let random = Math.random() * totalWeight;

    for (const campaignItem of items) {
      random -= campaignItem.weight;
      if (random <= 0) {
        return campaignItem.item;
      }
    }

    // Fallback to first item
    return items[0].item;
  }

  /**
   * Record a signal (survey response)
   */
  async recordSignal(params: RecordSignalParams): Promise<Signal> {
    const { userId, itemId, value, deliveryContext, clientInfo } = params;

    // Get the user's latest staff snapshot
    const latestSnapshot = await this.prisma.staffSnapshot.findFirst({
      where: { userId },
      orderBy: { snapshotDate: 'desc' }
    });

    if (!latestSnapshot) {
      throw new Error('No staff snapshot found for user');
    }

    // Get the item to determine signal type
    const item = await this.prisma.item.findUnique({
      where: { id: itemId }
    });

    if (!item) {
      throw new Error('Item not found');
    }

    // Create the signal
    const signal = await this.prisma.signal.create({
      data: {
        userId,
        itemId,
        signalTypeId: item.signalTypeId,
        staffSnapshotId: latestSnapshot.id,
        value,
        deliveryContext,
        clientInfo
      }
    });

    logger.info(`Signal recorded: ${signal.id}`, {
      userId,
      itemId,
      signalTypeId: item.signalTypeId
    });

    return signal;
  }

  /**
   * Check if current time is within campaign's time windows
   */
  private isWithinTimeWindow(campaign: any): boolean {
    // If no time windows defined, always eligible
    if (!campaign.timeWindows) {
      return true;
    }

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = now.getHours();

    const windows = campaign.timeWindows as Array<{
      dayOfWeek: number;
      startHour: number;
      endHour: number;
    }>;

    return windows.some(window =>
      window.dayOfWeek === dayOfWeek &&
      hour >= window.startHour &&
      hour < window.endHour
    );
  }

  /**
   * Check if user has responded too recently
   */
  private async checkRecentResponse(
    userId: string,
    maxPerDay: number,
    maxPerWeek: number
  ): Promise<boolean> {
    const now = new Date();

    // Check daily limit
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const todayCount = await this.prisma.signal.count({
      where: {
        userId,
        createdAt: { gte: startOfDay }
      }
    });

    if (todayCount >= maxPerDay) {
      return true;
    }

    // Check weekly limit
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const weekCount = await this.prisma.signal.count({
      where: {
        userId,
        createdAt: { gte: startOfWeek }
      }
    });

    return weekCount >= maxPerWeek;
  }
}
