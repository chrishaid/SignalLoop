import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

/**
 * Google Workspace Directory API Integration
 *
 * This service syncs organizational data from Google Workspace:
 * - Users
 * - Organizational units
 * - Manager relationships (via custom schemas or org units)
 */
export class GoogleWorkspaceService {
  private admin: any;

  constructor(
    private prisma: PrismaClient,
    private credentials: {
      clientId: string;
      clientSecret: string;
      refreshToken: string;
    }
  ) {
    this.initializeAdmin();
  }

  private initializeAdmin() {
    const oauth2Client = new google.auth.OAuth2(
      this.credentials.clientId,
      this.credentials.clientSecret
    );

    oauth2Client.setCredentials({
      refresh_token: this.credentials.refreshToken
    });

    this.admin = google.admin({ version: 'directory_v1', auth: oauth2Client });
  }

  /**
   * Sync all users from Google Workspace
   */
  async syncUsers(tenantId: string): Promise<{
    created: number;
    updated: number;
    errors: number;
  }> {
    logger.info(`Starting Google Workspace user sync for tenant ${tenantId}`);

    let created = 0;
    let updated = 0;
    let errors = 0;
    let pageToken: string | undefined;

    try {
      do {
        const response = await this.admin.users.list({
          customer: 'my_customer',
          maxResults: 500,
          pageToken,
          projection: 'full',
          orderBy: 'email'
        });

        const users = response.data.users || [];

        for (const googleUser of users) {
          try {
            await this.syncUser(tenantId, googleUser);

            // Check if user already exists
            const existing = await this.prisma.user.findUnique({
              where: {
                tenantId_idpSubjectId: {
                  tenantId,
                  idpSubjectId: googleUser.id!
                }
              }
            });

            if (existing) {
              updated++;
            } else {
              created++;
            }
          } catch (error) {
            logger.error(`Error syncing user ${googleUser.primaryEmail}`, error);
            errors++;
          }
        }

        pageToken = response.data.nextPageToken;
      } while (pageToken);

      logger.info(`User sync complete: ${created} created, ${updated} updated, ${errors} errors`);

      return { created, updated, errors };
    } catch (error) {
      logger.error('Error in Google Workspace user sync', error);
      throw error;
    }
  }

  /**
   * Sync a single user
   */
  private async syncUser(tenantId: string, googleUser: any) {
    const userData = {
      idpSubjectId: googleUser.id!,
      primaryEmail: googleUser.primaryEmail!,
      firstName: googleUser.name?.givenName || null,
      lastName: googleUser.name?.familyName || null,
      displayName: googleUser.name?.fullName || null,
      avatarUrl: googleUser.thumbnailPhotoUrl || null,
      status: googleUser.suspended ? 'SUSPENDED' as const : 'ACTIVE' as const
    };

    await this.prisma.user.upsert({
      where: {
        tenantId_idpSubjectId: {
          tenantId,
          idpSubjectId: googleUser.id!
        }
      },
      create: {
        ...userData,
        tenantId
      },
      update: userData
    });
  }

  /**
   * Create daily staff snapshots
   *
   * This is the core of the longitudinal data warehouse.
   * It captures the state of the organization on a specific date.
   */
  async createDailySnapshots(tenantId: string, snapshotDate: Date): Promise<number> {
    logger.info(`Creating staff snapshots for ${snapshotDate.toISOString().split('T')[0]}`);

    let snapshotCount = 0;

    // Get all active users for this tenant
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'SUSPENDED'] }
      }
    });

    // Get IdP config to determine attribute mappings
    const idpConfig = await this.prisma.idpConfig.findFirst({
      where: {
        tenantId,
        provider: 'GOOGLE_WORKSPACE',
        status: 'ACTIVE'
      }
    });

    if (!idpConfig) {
      throw new Error('No active Google Workspace IdP config found');
    }

    for (const user of users) {
      try {
        // Fetch detailed user info from Google
        const googleUser = await this.admin.users.get({
          userKey: user.primaryEmail
        });

        // Extract organizational data
        const snapshotData = await this.extractSnapshotData(
          tenantId,
          user,
          googleUser.data,
          idpConfig.attributeMappings as any
        );

        // Create or update snapshot
        await this.prisma.staffSnapshot.upsert({
          where: {
            userId_snapshotDate: {
              userId: user.id,
              snapshotDate
            }
          },
          create: {
            ...snapshotData,
            userId: user.id,
            snapshotDate
          },
          update: snapshotData
        });

        snapshotCount++;
      } catch (error) {
        logger.error(`Error creating snapshot for user ${user.primaryEmail}`, error);
      }
    }

    logger.info(`Created ${snapshotCount} snapshots`);
    return snapshotCount;
  }

  /**
   * Extract staff snapshot data from Google user object
   */
  private async extractSnapshotData(
    tenantId: string,
    user: any,
    googleUser: any,
    attributeMappings: any
  ) {
    const data: any = {};

    // Organization unit
    if (googleUser.orgUnitPath) {
      const orgUnit = await this.ensureOrgUnit(tenantId, googleUser.orgUnitPath);
      if (orgUnit) {
        data.orgUnitId = orgUnit.id;
      }
    }

    // Location
    if (googleUser.locations && googleUser.locations.length > 0) {
      data.location = googleUser.locations[0].buildingId;
    }

    // Job title (from custom schema or org data)
    if (googleUser.organizations && googleUser.organizations.length > 0) {
      const org = googleUser.organizations[0];
      data.jobTitle = org.title;
      data.employeeType = org.type;
      data.location = org.location;
    }

    // Manager relationship (if using custom schema)
    // This would need to be configured via custom schemas in Google Workspace
    if (googleUser.customSchemas?.Employee?.manager) {
      const managerEmail = googleUser.customSchemas.Employee.manager;
      const manager = await this.prisma.user.findUnique({
        where: {
          tenantId_primaryEmail: {
            tenantId,
            primaryEmail: managerEmail
          }
        }
      });
      if (manager) {
        data.managerId = manager.id;
      }
    }

    // Custom attributes (store everything else as JSON)
    data.customAttributes = {
      orgUnitPath: googleUser.orgUnitPath,
      customSchemas: googleUser.customSchemas || {}
    };

    // Calculate tenure if hire date is available
    if (googleUser.customSchemas?.Employee?.hireDate) {
      const hireDate = new Date(googleUser.customSchemas.Employee.hireDate);
      data.hireDate = hireDate;
      data.tenureDays = Math.floor(
        (new Date().getTime() - hireDate.getTime()) / (1000 * 60 * 60 * 24)
      );
    }

    return data;
  }

  /**
   * Ensure organizational unit exists
   */
  private async ensureOrgUnit(tenantId: string, orgUnitPath: string) {
    // Parse the path (e.g., "/Engineering/Backend")
    const parts = orgUnitPath.split('/').filter(p => p);

    if (parts.length === 0) return null;

    const name = parts[parts.length - 1];
    const parentPath = parts.slice(0, -1).join('/');

    return await this.prisma.orgUnit.upsert({
      where: {
        tenantId_externalId: {
          tenantId,
          externalId: orgUnitPath
        }
      },
      create: {
        tenantId,
        name,
        externalId: orgUnitPath,
        type: 'google_ou',
        path: orgUnitPath
      },
      update: {
        name,
        path: orgUnitPath
      }
    });
  }

  /**
   * Sync organizational units from Google Workspace
   */
  async syncOrgUnits(tenantId: string): Promise<number> {
    logger.info('Syncing organizational units from Google Workspace');

    let syncCount = 0;

    try {
      const response = await this.admin.orgunits.list({
        customerId: 'my_customer',
        type: 'all'
      });

      const orgUnits = response.data.organizationUnits || [];

      for (const googleOrgUnit of orgUnits) {
        await this.ensureOrgUnit(tenantId, googleOrgUnit.orgUnitPath);
        syncCount++;
      }

      logger.info(`Synced ${syncCount} organizational units`);
      return syncCount;
    } catch (error) {
      logger.error('Error syncing org units', error);
      throw error;
    }
  }
}
