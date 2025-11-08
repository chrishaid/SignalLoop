# Getting Started with SignalLoop

Welcome to SignalLoop! This guide will help you get the platform running locally for development.

## Quick Start (5 minutes)

### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **PostgreSQL** 14+ ([Download](https://www.postgresql.org/download/))
- **Redis** 6+ ([Download](https://redis.io/download))
- **Google Workspace** account with admin access

### 1. Install Dependencies

```bash
npm install
```

This will install dependencies for all packages in the monorepo.

### 2. Set Up Environment Variables

```bash
cp .env.example packages/backend/.env
cp .env.example packages/database/.env
```

Edit `packages/backend/.env` and `packages/database/.env` with your configuration.

**Minimum Required Configuration:**

```bash
# Database
DATABASE_URL="postgresql://signalloop:signalloop@localhost:5432/signalloop"

# Redis
REDIS_URL=redis://localhost:6379

# Session Secret (generate with: openssl rand -hex 32)
SESSION_SECRET=your-random-secret-here

# Google OAuth (get from Google Cloud Console)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback
```

### 3. Set Up Database

```bash
# Create database
createdb signalloop

# Run migrations
npm run db:migrate

# Seed initial data (creates demo tenant, roles, sample items)
npm run db:seed
```

### 4. Start Services

**Option A: All services at once (recommended)**
```bash
npm run dev
```

This starts:
- Backend API on http://localhost:3000
- Frontend dashboard on http://localhost:3001

**Option B: Individual services**
```bash
# Terminal 1 - Backend
cd packages/backend
npm run dev

# Terminal 2 - Frontend
cd packages/frontend
npm run dev
```

### 5. Verify Installation

Open http://localhost:3001 in your browser. You should see the SignalLoop login page.

Click "Sign in with Google" to test OAuth integration.

## Google Workspace Setup

To fully integrate with Google Workspace, follow these steps:

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Note your Project ID

### 2. Enable APIs

```bash
gcloud services enable admin.googleapis.com
gcloud services enable oauth2.googleapis.com
```

Or enable via Console:
- Admin SDK API
- Google OAuth 2.0

### 3. Create OAuth Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Select **Web application**
4. Add authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
5. Save **Client ID** and **Client Secret**

### 4. Configure Domain-Wide Delegation

See [docs/GOOGLE_WORKSPACE.md](docs/GOOGLE_WORKSPACE.md) for detailed instructions.

## Next Steps

### 1. Create Your First Campaign

```bash
# Via API
curl -X POST http://localhost:3000/api/admin/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weekly Pulse",
    "startDate": "2024-01-01",
    "cadence": "WEEKLY",
    "maxTouchesPerDay": 1,
    "maxTouchesPerWeek": 1
  }'
```

Or use the admin dashboard at http://localhost:3001/campaigns

### 2. Add Items to Campaign

Sample items are seeded automatically. Link them to your campaign:

```bash
# Get item IDs
curl http://localhost:3000/api/admin/items

# Add item to campaign
curl -X POST http://localhost:3000/api/admin/campaigns/{campaignId}/items \
  -H "Content-Type: application/json" \
  -d '{
    "itemId": "item_xxx",
    "weight": 1
  }'
```

### 3. Test Survey Flow

1. Log in via Google OAuth
2. You'll be redirected to `/survey/prompt`
3. Answer the survey question
4. You'll be redirected to the dashboard

### 4. View Reports

Navigate to http://localhost:3001/reports to see aggregated data.

## Docker Setup (Alternative)

If you prefer Docker:

```bash
# Start all services
docker-compose up -d

# Run migrations
docker-compose exec backend npm run db:migrate

# Seed data
docker-compose exec backend npm run db:seed

# View logs
docker-compose logs -f
```

Access:
- Backend: http://localhost:3000
- Frontend: http://localhost:3001

## Project Structure

```
SignalLoop/
├── packages/
│   ├── backend/          # Express API server
│   │   ├── src/
│   │   │   ├── routes/   # API endpoints
│   │   │   ├── services/ # Business logic
│   │   │   ├── jobs/     # Background jobs
│   │   │   └── middleware/
│   │   └── package.json
│   │
│   ├── frontend/         # React dashboard
│   │   ├── src/
│   │   │   ├── pages/    # Route pages
│   │   │   └── components/
│   │   └── package.json
│   │
│   ├── database/         # Prisma schema & migrations
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── package.json
│   │
│   └── shared/           # Shared types & utilities
│       └── src/
│
├── docs/                 # Documentation
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── GOOGLE_WORKSPACE.md
│   └── DEPLOYMENT.md
│
├── docker-compose.yml    # Docker setup
└── package.json          # Root package
```

## Development Workflow

### Running Tests (Future)

```bash
npm run test
```

### Database Migrations

```bash
# Create a new migration
cd packages/database
npx prisma migrate dev --name description_of_change

# Apply migrations
npm run db:migrate

# Reset database (CAUTION: deletes all data)
npx prisma migrate reset
```

### Viewing Database

```bash
npm run db:studio
```

Opens Prisma Studio at http://localhost:5555

### Background Jobs

Background jobs (daily snapshots, user sync) are managed by Bull:

```bash
# View job status
curl http://localhost:3000/api/admin/jobs/status

# Manually trigger snapshot
curl -X POST http://localhost:3000/api/admin/jobs/snapshot
```

## Common Issues

### "Cannot connect to database"

1. Check PostgreSQL is running: `pg_isready`
2. Verify DATABASE_URL in `.env`
3. Create database: `createdb signalloop`

### "Redis connection failed"

1. Start Redis: `redis-server`
2. Check REDIS_URL in `.env`

### "OAuth error: redirect_uri_mismatch"

1. Verify callback URL in Google Console matches exactly
2. No trailing slashes
3. Check protocol (http vs https)

### Port already in use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

## Key Concepts

### Tenants

Multi-tenant architecture. Each organization is a separate tenant with isolated data.

### Staff Snapshots

Daily snapshot of organizational structure. Enables:
- Longitudinal analysis
- Retention modeling
- Accurate reporting at time of response

### Signal Types

Categories of signals:
- **EngagementPulse**: Continuous engagement surveys
- **QuickCheck**: Manager-driven skill assessments (future)

### Targeting Rules

Define who sees which surveys using a flexible DSL:

```json
{
  "operator": "AND",
  "conditions": [
    {"field": "jobFamily", "operator": "equals", "value": "Teacher"},
    {"field": "region", "operator": "in", "value": ["Northeast", "Midwest"]}
  ]
}
```

### Confidentiality

All reporting enforces minimum-N thresholds (default: 5) to protect privacy.

## Learning Resources

- **Architecture**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **API Reference**: [docs/API.md](docs/API.md)
- **Google Workspace Setup**: [docs/GOOGLE_WORKSPACE.md](docs/GOOGLE_WORKSPACE.md)
- **Deployment**: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Support

- **Documentation**: Check `docs/` folder
- **Issues**: GitHub Issues
- **Questions**: Discussions tab

## What's Next?

### Immediate (MVP)
- [x] Google Workspace integration
- [x] Survey delivery via SSO
- [x] Daily snapshots
- [x] Reporting with confidentiality
- [x] Admin dashboard

### Phase 2
- [ ] Quick Checks (manager-driven assessments)
- [ ] Advanced visualizations (centered diverging bars)
- [ ] Email/Slack delivery channels
- [ ] More targeting rule operators

### Phase 3
- [ ] Microsoft Entra ID support
- [ ] Workday integration
- [ ] Predictive analytics (retention modeling)
- [ ] Mobile app

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write tests
5. Submit a pull request

---

**Ready to start?** Run `npm run dev` and open http://localhost:3001

Questions? Check the docs or open an issue!
