# SignalLoop

**Continuous signals from the people who make your mission real.**

SignalLoop is a continuous workforce listening and performance signaling platform that embeds micro-surveys into authentication flows and provides matrix-aware reporting for organizations.

## Features

- 🔐 **Authentication-Embedded Surveys**: One-question micro-surveys during SSO login
- 📊 **Continuous Listening**: High response rates with minimal survey fatigue
- 🏢 **Matrix-Aware Reporting**: Insights across reporting lines and functional cohorts
- 🔒 **Confidential by Design**: Privacy-preserving aggregation with minimum-N thresholds
- 📈 **Longitudinal Analytics**: Daily IdP snapshots enable trend analysis and retention modeling
- 🎯 **Flexible Targeting**: Rule-based survey delivery to specific cohorts

## Architecture

SignalLoop is built as a monorepo with the following packages:

- **`packages/database`**: Prisma schema and database migrations
- **`packages/backend`**: Express API server with core services
- **`packages/frontend`**: React dashboard for admins and managers
- **`packages/shared`**: Shared types and utilities

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 14
- Redis >= 6.0
- Google Workspace account (for MVP)

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp packages/backend/.env.example packages/backend/.env
cp packages/database/.env.example packages/database/.env

# Run database migrations
npm run db:migrate

# Start development servers
npm run dev
```

### Environment Setup

See `packages/backend/.env.example` for required environment variables including:
- Google Workspace OAuth credentials
- Database connection strings
- Redis configuration
- Session secrets

## Development

```bash
# Run all packages in development mode
npm run dev

# Build all packages
npm run build

# Run tests
npm run test

# Lint code
npm run lint

# Open Prisma Studio (database GUI)
npm run db:studio
```

## Documentation

- [Product Requirements Document](./docs/PRD.md)
- [Architecture Overview](./docs/ARCHITECTURE.md)
- [Google Workspace Integration](./docs/GOOGLE_WORKSPACE.md)
- [API Documentation](./docs/API.md)

## License

Proprietary - All Rights Reserved

## Version

0.9.0 (MVP - Google Workspace)
