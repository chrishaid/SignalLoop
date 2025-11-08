# SignalLoop Architecture

## Overview

SignalLoop is built as a modern, scalable platform for continuous workforce listening. This document describes the high-level architecture and key design decisions.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
├─────────────────────────────────────────────────────────────────┤
│  - React Dashboard (Admin, Managers, Functional Leaders)        │
│  - Survey Prompt UI (SSO Intercept)                             │
│  - Mobile-Responsive Design                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ HTTPS/REST
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                      API Gateway / Backend                       │
├─────────────────────────────────────────────────────────────────┤
│  Express.js + TypeScript                                         │
│  ┌─────────────┬─────────────┬──────────────┬────────────────┐ │
│  │   Auth      │   Survey    │    Admin     │   Reporting    │ │
│  │  Service    │   Service   │   Service    │    Service     │ │
│  └─────────────┴─────────────┴──────────────┴────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
┌─────────────▼───┐  ┌───────▼──────┐  ┌───▼────────────┐
│   PostgreSQL    │  │    Redis     │  │  Bull Queue    │
│   (Primary DB)  │  │  (Sessions   │  │  (Background   │
│                 │  │  & Cache)    │  │   Jobs)        │
└─────────────────┘  └──────────────┘  └────────────────┘
         │
         │
┌────────▼─────────────────────────────────────────────────────┐
│              Google Workspace Directory API                   │
│  - User Sync                                                 │
│  - Org Structure                                             │
│  - Daily Snapshots                                           │
└──────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Database Layer (PostgreSQL + Prisma)

**Why PostgreSQL?**
- Strong ACID guarantees for sensitive workforce data
- Excellent support for complex queries (joins, aggregations)
- JSON support for flexible attribute storage
- Mature ecosystem with proven scalability

**Schema Design Principles:**
- **Tenant Isolation**: All data partitioned by `tenantId`
- **Temporal Design**: `StaffSnapshot` captures point-in-time org state
- **Flexible Attributes**: JSON fields for custom organization-specific data
- **Audit Trail**: `AuditLog` table for compliance

### 2. Authentication & Authorization

**OAuth/OIDC Flow:**
1. User initiates login
2. Redirect to Google OAuth
3. After successful auth, redirect to `/survey/prompt`
4. Survey prompt shown if user is eligible
5. After submission, redirect to intended destination

**RBAC Model:**
- **Roles**: Define capabilities (e.g., "Manager", "HR Analytics")
- **Scopes**: Define what data a role can access (e.g., "my team", "all engineers")
- **Permissions**: Combine Role + Scope for a user

### 3. Survey Delivery Service

**Eligibility Engine:**
```typescript
checkEligibility(userId) {
  1. Get user's latest StaffSnapshot
  2. Find active campaigns
  3. For each campaign:
     - Evaluate targeting rules
     - Check time windows
     - Check recent response history (rate limiting)
  4. Return first matching campaign or null
}
```

**Targeting Rules (DSL):**
```json
{
  "operator": "AND",
  "conditions": [
    {
      "field": "jobFamily",
      "operator": "in",
      "value": ["Teacher", "Principal"]
    },
    {
      "field": "region",
      "operator": "equals",
      "value": "Northeast"
    }
  ]
}
```

### 4. Reporting & Analytics

**Confidentiality Enforcement:**
- **Minimum-N Threshold**: Never show data for cohorts < N responses (default: 5)
- **Aggregation-Only**: Individual responses only accessible to authorized roles
- **Scope Filtering**: Users only see data within their RBAC scope

**Query Pattern:**
```typescript
getReport(filters, minN) {
  1. Apply RBAC scope filters
  2. Apply user-provided filters (date range, org unit, etc.)
  3. Aggregate signals
  4. Check each aggregate against minN threshold
  5. Return only compliant aggregates
}
```

### 5. Background Jobs (Bull + Redis)

**Daily Snapshot Job:**
- Runs at 2 AM daily
- Pulls all users from Google Workspace Directory API
- Creates `StaffSnapshot` record for each user
- Captures: manager, org unit, job title, location, custom attributes

**Why Daily Snapshots?**
- Enables longitudinal analysis (track changes over time)
- Supports retention modeling (identify early warning signs)
- Decouples survey responses from org structure at time of response

### 6. Google Workspace Integration

**APIs Used:**
- **Admin SDK Directory API**: User list, org units, custom schemas
- **OAuth 2.0**: Authentication

**Attribute Mapping:**
- Configurable per tenant
- Maps Google Workspace fields to SignalLoop schema
- Supports custom schemas for manager relationships, hire dates, etc.

**Sync Frequency:**
- Users: Daily (via snapshot job)
- Org Units: On-demand or daily
- Real-time updates: Future enhancement (webhooks)

## Data Flow: Survey Response

```
1. User logs in via Google OAuth
   │
   ├─> Backend receives OAuth callback
   │
2. Check if user is eligible for survey
   │
   ├─> Yes: Show survey prompt
   │   │
   │   ├─> User submits response
   │   │
   │   └─> Create Signal record
   │       - Link to User
   │       - Link to Item
   │       - Link to latest StaffSnapshot
   │       - Store value + metadata
   │
   └─> No: Redirect to intended destination
```

## Data Flow: Reporting

```
1. Manager requests team report
   │
   ├─> Resolve manager's RBAC permissions
   │   - Role: "Manager"
   │   - Scope: "Direct reports"
   │
2. Find all users in scope
   │
   ├─> Get latest StaffSnapshot for each
   │   WHERE managerId = requestingUserId
   │
3. Query Signals for those users
   │
   ├─> Apply filters (date range, item, etc.)
   │
4. Aggregate signals
   │
   ├─> Group by item
   │   Calculate: count, mean, distribution, favorable%
   │
5. Check confidentiality
   │
   ├─> For each aggregate:
   │   IF count >= minN THEN include
   │   ELSE redact
   │
6. Return compliant aggregates
```

## Security Considerations

### Data Protection
- **Encryption at Rest**: PostgreSQL + disk encryption
- **Encryption in Transit**: TLS for all API calls
- **Session Management**: Secure cookies, HttpOnly, SameSite
- **Credential Storage**: Environment variables, secrets manager in production

### RBAC Enforcement
- Enforced at **data access layer**, not just UI
- All queries filtered by tenant + scope
- Audit logs for sensitive operations (exports, permission changes)

### Rate Limiting
- Survey delivery: Max 1/day, 3/week per user (configurable)
- API endpoints: 100 requests/15min per IP

## Scalability

### Current MVP
- Single PostgreSQL instance
- Single Redis instance
- Supports ~10,000 users per tenant

### Future Scaling Path
- **Database**: Read replicas, partitioning by tenant
- **Redis**: Redis Cluster for session/cache distribution
- **Background Jobs**: Multiple Bull workers
- **Multi-Region**: Geo-distributed deployment

## Monitoring & Observability

**Logging (Winston):**
- Structured JSON logs
- Log levels: error, warn, info, debug
- Correlation IDs for request tracing

**Metrics (Future):**
- Response times
- Survey completion rates
- Job success/failure rates
- Database query performance

**Alerts (Future):**
- Job failures
- API error rate spikes
- Database connection issues

## Technology Choices

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Backend Runtime** | Node.js + TypeScript | Excellent ecosystem, type safety, rapid development |
| **API Framework** | Express.js | Mature, flexible, extensive middleware |
| **Database** | PostgreSQL + Prisma | ACID guarantees, complex queries, great ORM |
| **Caching/Sessions** | Redis | Fast, reliable, session store |
| **Background Jobs** | Bull + Redis | Queue-based, retries, scheduling |
| **Frontend** | React + TypeScript | Component-based, strong ecosystem |
| **Build Tool** | Vite | Fast, modern, great DX |
| **Styling** | Tailwind CSS | Utility-first, rapid prototyping |
| **Monorepo** | Turborepo | Fast builds, shared dependencies |

## Future Enhancements

### Phase 2: Quick Checks
- Manager-driven skill assessments
- Same data model (Signal)
- Different delivery mechanism (manager-initiated vs. SSO-intercept)

### Phase 3: Microsoft Entra ID
- Add OIDC provider for Microsoft
- Attribute mapping for Azure AD
- Graph API integration

### Phase 4: Predictive Analytics
- Retention risk modeling using longitudinal snapshots
- Early warning system for engagement drops
- Recommended interventions

### Phase 5: Integrations
- **Workday**: Bi-directional sync for HR data
- **Slack/Teams**: Survey delivery via chat
- **BI Tools**: Power BI, Tableau connectors
