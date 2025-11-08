# Google Workspace Integration Guide

This guide walks you through setting up SignalLoop with Google Workspace as your identity provider and organizational data source.

## Prerequisites

- Google Workspace super admin access
- A Google Cloud Project
- Domain verification in Google Workspace

## Setup Steps

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your Project ID

### 2. Enable Required APIs

Enable the following APIs in your Google Cloud Project:

```bash
gcloud services enable admin.googleapis.com
gcloud services enable oauth2.googleapis.com
```

Or via the Cloud Console:
- Admin SDK API
- Google OAuth 2.0

### 3. Create OAuth 2.0 Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Select **Web application**
4. Configure:
   - **Name**: SignalLoop
   - **Authorized JavaScript origins**:
     - `http://localhost:3000` (development)
     - `https://yourdomain.com` (production)
   - **Authorized redirect URIs**:
     - `http://localhost:3000/api/auth/google/callback` (development)
     - `https://yourdomain.com/api/auth/google/callback` (production)
5. Click **Create**
6. **Save your Client ID and Client Secret**

### 4. Configure Domain-Wide Delegation

For the Admin SDK to work, you need to grant domain-wide delegation:

1. Go to **APIs & Services** > **Credentials**
2. Under **Service Accounts**, click on your service account
3. Click **Show Domain-Wide Delegation**
4. Click **Enable Domain-Wide Delegation**
5. Note the **Client ID**

6. Go to your [Google Admin Console](https://admin.google.com/)
7. Navigate to **Security** > **API Controls** > **Domain-wide Delegation**
8. Click **Add new**
9. Enter the **Client ID** from step 5
10. Add the following OAuth Scopes:
    ```
    https://www.googleapis.com/auth/admin.directory.user.readonly
    https://www.googleapis.com/auth/admin.directory.orgunit.readonly
    https://www.googleapis.com/auth/admin.directory.group.readonly
    ```
11. Click **Authorize**

### 5. Set Up Custom Schemas (Optional but Recommended)

Custom schemas allow you to store additional employee data in Google Workspace:

1. Go to [Google Admin Console](https://admin.google.com/)
2. Navigate to **Directory** > **Users** > **More** > **Manage custom attributes**
3. Click **Add Custom Attribute**
4. Create a schema called "Employee" with these fields:
   - **manager** (Text) - Manager's email address
   - **hireDate** (Date) - Employee hire date
   - **jobFamily** (Text) - Job family/function
   - **level** (Text) - Job level
   - **department** (Text) - Department name
   - **costCenter** (Text) - Cost center code

### 6. Configure SignalLoop

Add the following to your `.env` file:

```bash
# Google Workspace OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# Google Workspace Admin SDK
GOOGLE_ADMIN_EMAIL=admin@yourdomain.com
GOOGLE_CUSTOMER_ID=C12345678
```

To find your Customer ID:
1. Go to [Google Admin Console](https://admin.google.com/)
2. Navigate to **Account** > **Account Settings**
3. Copy the **Customer ID**

### 7. Configure Attribute Mappings

In SignalLoop, create an IdP Configuration for your tenant:

```typescript
{
  "provider": "GOOGLE_WORKSPACE",
  "domain": "yourdomain.com",
  "attributeMappings": {
    "manager": "customSchemas.Employee.manager",
    "hireDate": "customSchemas.Employee.hireDate",
    "jobFamily": "customSchemas.Employee.jobFamily",
    "jobTitle": "organizations[0].title",
    "department": "customSchemas.Employee.department",
    "location": "locations[0].buildingId",
    "employeeType": "organizations[0].type"
  }
}
```

## Data Sync

### Initial Sync

After configuration, trigger an initial sync:

```bash
# Via API
POST /api/admin/sync/users

# Or via CLI
npm run sync:users -- --tenant=your-tenant-id
```

This will:
1. Pull all users from Google Workspace
2. Create User records in SignalLoop
3. Create initial StaffSnapshots

### Daily Snapshots

The daily snapshot job runs automatically at 2 AM (configurable):

```typescript
// Cron schedule in src/jobs/index.ts
dailySnapshotQueue.add(
  'recurring',
  {},
  {
    repeat: {
      cron: '0 2 * * *' // Daily at 2 AM
    }
  }
);
```

## Testing the Integration

### Test OAuth Flow

1. Navigate to `http://localhost:3000/login`
2. Click **Sign in with Google**
3. Authorize SignalLoop
4. You should be redirected to `/survey/prompt` or `/dashboard`

### Test Admin SDK Access

```bash
# Check if users can be synced
npm run test:google-sync
```

### Verify Data

```sql
-- Check users were created
SELECT COUNT(*) FROM users WHERE tenant_id = 'your-tenant-id';

-- Check latest snapshots
SELECT
  u.primary_email,
  ss.job_title,
  ss.job_family,
  ou.name as org_unit
FROM staff_snapshots ss
JOIN users u ON ss.user_id = u.id
LEFT JOIN org_units ou ON ss.org_unit_id = ou.id
WHERE ss.snapshot_date = CURRENT_DATE
ORDER BY u.primary_email;
```

## Organizational Structure

### Org Units

Google Workspace org units are synced as `OrgUnit` records:

```
/Engineering
  /Engineering/Backend
  /Engineering/Frontend
/Sales
  /Sales/Enterprise
  /Sales/SMB
```

These are stored with:
- Hierarchical relationships (`parentId`)
- Paths for efficient querying (`path`)

### Manager Relationships

Manager relationships can be configured in two ways:

**Option 1: Custom Schema (Recommended)**
- Add manager email in custom schema
- SignalLoop resolves to User ID during sync

**Option 2: Org Unit-Based**
- Use org unit hierarchy
- Org unit manager = team manager
- Less precise but simpler setup

## Troubleshooting

### Common Issues

**OAuth Error: "redirect_uri_mismatch"**
- Ensure redirect URI in Google Console exactly matches your configured callback URL
- Check for trailing slashes

**Admin SDK Error: "Not Authorized"**
- Verify domain-wide delegation is enabled
- Check OAuth scopes are correct
- Ensure service account email is authorized

**No Users Synced**
- Check `GOOGLE_CUSTOMER_ID` is correct
- Verify Admin SDK API is enabled
- Check service account has domain-wide delegation

**Snapshots Not Creating**
- Check Redis is running (Bull queue requires Redis)
- Verify cron job is scheduled: `dailySnapshotQueue.getRepeatableJobs()`
- Check logs: `tail -f logs/combined.log`

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm run dev
```

### Manual Sync

Trigger a manual sync for testing:

```typescript
import { GoogleWorkspaceService } from './services/google-workspace.service';

const service = new GoogleWorkspaceService(prisma, {
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  refreshToken: 'your-refresh-token'
});

await service.syncUsers('tenant-id');
await service.syncOrgUnits('tenant-id');
await service.createDailySnapshots('tenant-id', new Date());
```

## Best Practices

### Security

1. **Never commit credentials** - Use environment variables
2. **Rotate secrets regularly** - Change OAuth secrets periodically
3. **Limit scopes** - Only request necessary permissions
4. **Monitor usage** - Set up alerts for API quota

### Performance

1. **Batch requests** - Use batch APIs when available
2. **Cache org units** - They change infrequently
3. **Rate limiting** - Respect Google API quotas
4. **Incremental sync** - For large organizations (10,000+ users)

### Data Quality

1. **Validate custom schemas** - Ensure consistent data entry
2. **Regular audits** - Check for missing manager relationships
3. **Handle deletions** - Mark users as "EXITED" instead of deleting
4. **Test mappings** - Verify attribute mappings with sample users

## Advanced Configuration

### Custom Sync Schedule

Modify the cron expression in `src/jobs/index.ts`:

```typescript
// Every 6 hours
repeat: { cron: '0 */6 * * *' }

// Weekdays only at 3 AM
repeat: { cron: '0 3 * * 1-5' }

// Multiple times per day
repeat: { cron: '0 2,14 * * *' } // 2 AM and 2 PM
```

### Selective Sync

Sync only specific org units:

```typescript
async syncOrgUnit(tenantId: string, orgUnitPath: string) {
  const response = await this.admin.users.list({
    customer: 'my_customer',
    query: `orgUnitPath='${orgUnitPath}'`
  });
  // ... process users
}
```

### Webhook Integration (Future)

Google Workspace supports webhooks for real-time updates:

```typescript
// Subscribe to user changes
await admin.users.watch({
  customer: 'my_customer',
  event: 'update'
});
```

## Support

For issues specific to Google Workspace configuration:
- [Google Workspace Admin Help](https://support.google.com/a)
- [Admin SDK Documentation](https://developers.google.com/admin-sdk)

For SignalLoop-specific issues:
- Check logs in `logs/` directory
- Review error messages in browser console
- Contact support@signalloop.com
