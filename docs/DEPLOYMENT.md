# SignalLoop Deployment Guide

This guide covers deploying SignalLoop to production environments.

## Deployment Options

### 1. Docker Compose (Recommended for MVP)

The simplest way to deploy SignalLoop is using Docker Compose.

**Prerequisites:**
- Docker 20.10+
- Docker Compose 2.0+
- 2GB RAM minimum
- 10GB disk space

**Steps:**

1. **Clone the repository**
```bash
git clone https://github.com/yourorg/signalloop.git
cd signalloop
```

2. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your production values
```

3. **Set production secrets**
```bash
# Generate secure secrets
openssl rand -hex 32  # Use for SESSION_SECRET
openssl rand -hex 32  # Use for JWT_SECRET
```

4. **Build and start services**
```bash
docker-compose up -d
```

5. **Run database migrations**
```bash
docker-compose exec backend npm run db:migrate
```

6. **Seed initial data**
```bash
docker-compose exec backend npm run db:seed
```

7. **Verify deployment**
```bash
# Check all services are running
docker-compose ps

# Check backend logs
docker-compose logs -f backend

# Test health endpoint
curl http://localhost:3000/health
```

### 2. Kubernetes

For production at scale, deploy to Kubernetes.

**Prerequisites:**
- Kubernetes cluster (1.25+)
- kubectl configured
- Helm 3+

**Steps:**

1. **Create namespace**
```bash
kubectl create namespace signalloop
```

2. **Create secrets**
```bash
kubectl create secret generic signalloop-secrets \
  --from-literal=SESSION_SECRET=$(openssl rand -hex 32) \
  --from-literal=JWT_SECRET=$(openssl rand -hex 32) \
  --from-literal=GOOGLE_CLIENT_SECRET=your-secret \
  -n signalloop
```

3. **Deploy PostgreSQL (or use managed service)**
```bash
helm install signalloop-postgres bitnami/postgresql \
  --set auth.username=signalloop \
  --set auth.password=changeme \
  --set auth.database=signalloop \
  -n signalloop
```

4. **Deploy Redis (or use managed service)**
```bash
helm install signalloop-redis bitnami/redis \
  --set auth.enabled=false \
  -n signalloop
```

5. **Deploy SignalLoop**
```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/ -n signalloop
```

6. **Run migrations**
```bash
kubectl exec -it deployment/signalloop-backend -n signalloop -- npm run db:migrate
```

### 3. Cloud Platforms

#### AWS

**Architecture:**
- **ECS Fargate** for containers
- **RDS PostgreSQL** for database
- **ElastiCache Redis** for sessions/queue
- **ALB** for load balancing
- **CloudFront** for CDN

**Estimated Monthly Cost:**
- ECS Fargate: ~$50/month (2 tasks)
- RDS db.t3.medium: ~$60/month
- ElastiCache t3.micro: ~$15/month
- **Total: ~$125/month**

#### Google Cloud

**Architecture:**
- **Cloud Run** for containers
- **Cloud SQL PostgreSQL** for database
- **Memorystore Redis** for sessions/queue
- **Cloud Load Balancer**

**Estimated Monthly Cost:**
- Cloud Run: ~$30/month
- Cloud SQL db-f1-micro: ~$25/month
- Memorystore M1: ~$35/month
- **Total: ~$90/month**

#### Azure

**Architecture:**
- **Container Apps** for containers
- **Azure Database for PostgreSQL**
- **Azure Cache for Redis**
- **Application Gateway**

**Estimated Monthly Cost:**
- Container Apps: ~$40/month
- PostgreSQL Basic: ~$30/month
- Redis C0: ~$15/month
- **Total: ~$85/month**

## Production Checklist

### Security

- [ ] Change all default secrets
- [ ] Enable SSL/TLS for all endpoints
- [ ] Configure firewall rules
- [ ] Enable database encryption at rest
- [ ] Set up VPC/private networking
- [ ] Configure OAuth callback URLs for production domain
- [ ] Enable rate limiting
- [ ] Set up WAF (Web Application Firewall)
- [ ] Regular security audits

### Database

- [ ] Configure automated backups (daily minimum)
- [ ] Set up point-in-time recovery
- [ ] Enable query logging for slow queries
- [ ] Configure connection pooling
- [ ] Set up read replicas for reporting (optional)
- [ ] Monitor disk space
- [ ] Set up alerts for connection limits

### Monitoring

- [ ] Set up application monitoring (e.g., DataDog, New Relic)
- [ ] Configure log aggregation (e.g., CloudWatch, Stackdriver)
- [ ] Set up uptime monitoring
- [ ] Create dashboards for key metrics
- [ ] Configure alerts for errors and performance

**Key Metrics to Monitor:**
- API response times
- Database query performance
- Queue job success/failure rates
- Daily snapshot completion
- User authentication success rate
- Survey completion rate

### Performance

- [ ] Enable database query caching
- [ ] Configure Redis for session storage
- [ ] Set up CDN for static assets
- [ ] Enable gzip compression
- [ ] Configure appropriate resource limits
- [ ] Load test with expected user volume

### Backup & Recovery

- [ ] Database backups (automated daily)
- [ ] Test restore process monthly
- [ ] Document recovery procedures
- [ ] Store backups in separate region
- [ ] Backup retention policy (30 days minimum)

### Compliance

- [ ] Review data retention policies
- [ ] Configure audit logging
- [ ] Set up data export capabilities
- [ ] Document security practices
- [ ] GDPR compliance (if applicable)
- [ ] SOC 2 compliance (if required)

## Environment Variables

### Required

```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Redis
REDIS_URL=redis://host:6379

# Secrets
SESSION_SECRET=<64-char-hex-string>
JWT_SECRET=<64-char-hex-string>

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_CALLBACK_URL=https://yourdomain.com/api/auth/google/callback

# Google Admin SDK
GOOGLE_ADMIN_EMAIL=admin@yourdomain.com
GOOGLE_CUSTOMER_ID=C12345678
```

### Optional

```bash
# CORS
CORS_ORIGIN=https://yourdomain.com

# Logging
LOG_LEVEL=info  # error, warn, info, debug

# Performance
NODE_ENV=production
```

## Scaling

### Horizontal Scaling

SignalLoop backend is stateless and can be scaled horizontally:

```bash
# Docker Compose
docker-compose up -d --scale backend=3

# Kubernetes
kubectl scale deployment signalloop-backend --replicas=3
```

### Database Scaling

**Read Replicas:**
- Use for reporting queries
- Reduce load on primary database
- Configure in Prisma:

```typescript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL_REPLICA
    }
  }
});
```

**Connection Pooling:**
```
DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public&connection_limit=20&pool_timeout=10"
```

### Queue Scaling

For large organizations (10,000+ users), scale Bull workers:

```typescript
// Multiple workers
for (let i = 0; i < 3; i++) {
  dailySnapshotQueue.process(async (job) => {
    // Process job
  });
}
```

## Maintenance

### Database Migrations

```bash
# Run migrations
npm run db:migrate

# Rollback migration (if needed)
npx prisma migrate resolve --rolled-back <migration-name>
```

### Updating

```bash
# Pull latest code
git pull origin main

# Rebuild containers
docker-compose build

# Restart services
docker-compose up -d

# Run migrations
docker-compose exec backend npm run db:migrate
```

### Backups

**Manual Backup:**
```bash
# PostgreSQL
docker-compose exec postgres pg_dump -U signalloop signalloop > backup.sql

# Restore
docker-compose exec -T postgres psql -U signalloop signalloop < backup.sql
```

**Automated Backup Script:**
```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="signalloop_backup_$DATE.sql"

docker-compose exec -T postgres pg_dump -U signalloop signalloop | gzip > $BACKUP_FILE.gz

# Upload to S3
aws s3 cp $BACKUP_FILE.gz s3://your-bucket/backups/

# Keep last 30 days
find . -name "signalloop_backup_*.sql.gz" -mtime +30 -delete
```

### Logs

```bash
# View backend logs
docker-compose logs -f backend

# View all logs
docker-compose logs -f

# Export logs
docker-compose logs --no-color > logs.txt
```

## Troubleshooting

### Backend won't start

```bash
# Check database connection
docker-compose exec backend npx prisma db push

# Check environment variables
docker-compose exec backend env | grep DATABASE_URL

# View detailed logs
docker-compose logs backend --tail 100
```

### Database connection issues

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check connection from backend
docker-compose exec backend psql $DATABASE_URL

# Reset database (CAUTION: deletes all data)
docker-compose down -v
docker-compose up -d
```

### Queue jobs not processing

```bash
# Check Redis is running
docker-compose exec redis redis-cli ping

# View queue status
docker-compose exec backend npm run queue:status

# Manually trigger job
docker-compose exec backend npm run sync:users
```

### High memory usage

```bash
# Check resource usage
docker stats

# Limit container resources in docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
```

## Support

For deployment issues:
- Check logs first
- Review this documentation
- Search existing issues on GitHub
- Create a new issue with logs and configuration
- Email support@signalloop.com for urgent issues

## Next Steps

After deployment:
1. Configure Google Workspace integration
2. Create your first campaign
3. Add survey items
4. Set up daily snapshot job
5. Monitor for first responses
6. Review reports and dashboards
