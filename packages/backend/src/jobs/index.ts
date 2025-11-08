import Bull from 'bull';
import { PrismaClient } from '@prisma/client';
import { GoogleWorkspaceService } from '../services/google-workspace.service';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

// ============================================================================
// QUEUE SETUP
// ============================================================================

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const dailySnapshotQueue = new Bull('daily-snapshot', redisUrl, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 60000 // 1 minute
    }
  }
});

export const userSyncQueue = new Bull('user-sync', redisUrl, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 30000 // 30 seconds
    }
  }
});

// ============================================================================
// JOB PROCESSORS
// ============================================================================

/**
 * Daily Snapshot Job
 *
 * This is the core job that creates the longitudinal data warehouse.
 * It runs daily to capture the current state of the organization.
 */
dailySnapshotQueue.process(async (job) => {
  const { tenantId, snapshotDate } = job.data;

  logger.info(`Processing daily snapshot job for tenant ${tenantId}`, {
    snapshotDate
  });

  try {
    // Get IdP configuration
    const idpConfig = await prisma.idpConfig.findFirst({
      where: {
        tenantId,
        provider: 'GOOGLE_WORKSPACE',
        status: 'ACTIVE'
      }
    });

    if (!idpConfig) {
      throw new Error(`No active Google Workspace config for tenant ${tenantId}`);
    }

    // Initialize Google Workspace service
    const googleService = new GoogleWorkspaceService(prisma, {
      clientId: idpConfig.clientId,
      clientSecret: idpConfig.clientSecret,
      refreshToken: '' // Would be stored securely in production
    });

    // Create snapshots
    const snapshotCount = await googleService.createDailySnapshots(
      tenantId,
      new Date(snapshotDate)
    );

    logger.info(`Daily snapshot complete: ${snapshotCount} snapshots created`);

    // Update last sync time
    await prisma.idpConfig.update({
      where: { id: idpConfig.id },
      data: { lastSyncAt: new Date() }
    });

    return { success: true, snapshotCount };
  } catch (error) {
    logger.error('Error in daily snapshot job', error);
    throw error;
  }
});

/**
 * User Sync Job
 *
 * Syncs user data from Google Workspace
 */
userSyncQueue.process(async (job) => {
  const { tenantId } = job.data;

  logger.info(`Processing user sync job for tenant ${tenantId}`);

  try {
    const idpConfig = await prisma.idpConfig.findFirst({
      where: {
        tenantId,
        provider: 'GOOGLE_WORKSPACE',
        status: 'ACTIVE'
      }
    });

    if (!idpConfig) {
      throw new Error(`No active Google Workspace config for tenant ${tenantId}`);
    }

    const googleService = new GoogleWorkspaceService(prisma, {
      clientId: idpConfig.clientId,
      clientSecret: idpConfig.clientSecret,
      refreshToken: ''
    });

    // Sync users
    const syncResult = await googleService.syncUsers(tenantId);

    logger.info('User sync complete', syncResult);

    return { success: true, ...syncResult };
  } catch (error) {
    logger.error('Error in user sync job', error);
    throw error;
  }
});

// ============================================================================
// JOB SCHEDULING
// ============================================================================

/**
 * Schedule daily snapshots for all active tenants
 */
export async function scheduleDailySnapshots() {
  const tenants = await prisma.tenant.findMany({
    where: { status: 'ACTIVE' },
    include: {
      idpConfigs: {
        where: {
          status: 'ACTIVE',
          syncEnabled: true
        }
      }
    }
  });

  for (const tenant of tenants) {
    if (tenant.idpConfigs.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await dailySnapshotQueue.add(
        {
          tenantId: tenant.id,
          snapshotDate: today.toISOString()
        },
        {
          // Run at 2 AM
          delay: getDelayUntil(2, 0)
        }
      );

      logger.info(`Scheduled daily snapshot for tenant ${tenant.id}`);
    }
  }
}

/**
 * Initialize job scheduling
 */
export async function initializeJobs() {
  logger.info('Initializing background jobs');

  // Schedule daily snapshots
  await scheduleDailySnapshots();

  // Set up recurring schedules
  dailySnapshotQueue.add(
    'recurring',
    {},
    {
      repeat: {
        cron: '0 2 * * *' // Daily at 2 AM
      }
    }
  );

  logger.info('Background jobs initialized');
}

// ============================================================================
// HELPERS
// ============================================================================

function getDelayUntil(hour: number, minute: number): number {
  const now = new Date();
  const target = new Date();
  target.setHours(hour, minute, 0, 0);

  if (target < now) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - now.getTime();
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

dailySnapshotQueue.on('completed', (job, result) => {
  logger.info(`Daily snapshot job completed`, {
    jobId: job.id,
    result
  });
});

dailySnapshotQueue.on('failed', (job, err) => {
  logger.error(`Daily snapshot job failed`, {
    jobId: job?.id,
    error: err.message
  });
});

userSyncQueue.on('completed', (job, result) => {
  logger.info(`User sync job completed`, {
    jobId: job.id,
    result
  });
});

userSyncQueue.on('failed', (job, err) => {
  logger.error(`User sync job failed`, {
    jobId: job?.id,
    error: err.message
  });
});
