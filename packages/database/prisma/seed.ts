import { PrismaClient } from '@prisma/client';
import { SAMPLE_ENGAGEMENT_ITEMS } from '@signalloop/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seed...');

  // Create a demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo Organization',
      slug: 'demo',
      status: 'ACTIVE'
    }
  });

  console.log(`Created tenant: ${tenant.name}`);

  // Create signal type
  const engagementSignalType = await prisma.signalType.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: 'EngagementPulse'
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'EngagementPulse',
      displayName: 'Engagement Pulse',
      description: 'Continuous engagement monitoring',
      status: 'ACTIVE'
    }
  });

  console.log(`Created signal type: ${engagementSignalType.displayName}`);

  // Create sample items
  for (const itemData of SAMPLE_ENGAGEMENT_ITEMS) {
    await prisma.item.create({
      data: {
        tenantId: tenant.id,
        signalTypeId: engagementSignalType.id,
        text: itemData.text,
        category: itemData.category,
        scaleType: itemData.scaleType as any,
        scaleConfig: {},
        tags: itemData.tags,
        status: 'ACTIVE'
      }
    });
  }

  console.log(`Created ${SAMPLE_ENGAGEMENT_ITEMS.length} sample items`);

  // Create default roles
  const roles = [
    {
      name: 'Super Admin',
      description: 'Full system access',
      capabilities: ['*'],
      isSystem: true
    },
    {
      name: 'Manager',
      description: 'View team reports',
      capabilities: ['view_team_reports', 'view_aggregated'],
      isSystem: true
    },
    {
      name: 'Functional Leader',
      description: 'View functional cohort reports',
      capabilities: ['view_cohort_reports', 'view_aggregated'],
      isSystem: true
    },
    {
      name: 'HR Analytics',
      description: 'Full reporting access and exports',
      capabilities: ['view_all_reports', 'export', 'view_aggregated', 'manage_campaigns'],
      isSystem: true
    }
  ];

  for (const roleData of roles) {
    await prisma.role.upsert({
      where: {
        tenantId_name: {
          tenantId: tenant.id,
          name: roleData.name
        }
      },
      update: {},
      create: {
        tenantId: tenant.id,
        ...roleData
      }
    });
  }

  console.log(`Created ${roles.length} default roles`);

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
