# Last Session Context

## Date
2026-02-04

## What We Built
Phase 1 of Fly-Bot Email API - an email mediator service that wraps Manus.im's Mail Manus feature, plus a full admin panel for managing users, workflows, and monitoring activity.

## Architecture
```
User email → research@mail.fly-bot.net
                    ↓
            SendGrid Inbound Parse
                    ↓
            POST /webhooks/email/inbound (ngrok → localhost:3000)
                    ↓
            App validates user, checks credits
                    ↓
            Rewrites From: relay@mail.fly-bot.net
            Forwards to: arksenu-research@manus.bot
                    ↓
            Manus processes task
                    ↓
            Manus replies to relay@mail.fly-bot.net
                    ↓
            SendGrid → webhook → App matches mapping
                    ↓
            Strips Manus branding, relays to original user
```

## Current State

### What's Working
- ✅ Docker Compose setup (app + PostgreSQL)
- ✅ SendGrid Inbound Parse receiving emails at `mail.fly-bot.net`
- ✅ Webhook endpoint processing emails
- ✅ User validation (registered, approved, credits)
- ✅ Bounce emails for rejected requests
- ✅ Email forwarding to Manus (arksenu-research@manus.bot)
- ✅ Mapping stored in database
- ✅ Manus response handling
- ✅ Branding stripping
- ✅ Credit deduction on completion
- ✅ Admin panel (React + Vite)
  - Dashboard with stats
  - User CRUD + credit adjustments + approval
  - Workflow editing (name, manus_address, credits_per_task, description, is_active)
  - Activity log (email tasks + transactions)
  - JWT authentication

### Not Implemented (Phase 2+)
- User registration API (public)
- Login/auth API (public)
- Credit purchase (Stripe)
- Webhook signature verification
- Rate limiting
- Tests

## Key Configuration

### Environment
```
FROM_DOMAIN=mail.fly-bot.net
RELAY_ADDRESS=relay@mail.fly-bot.net
```

### DNS (GoDaddy)
```
MX mail.fly-bot.net → mx.sendgrid.net (priority 10)
```

### SendGrid Inbound Parse
- Domain: `mail.fly-bot.net`
- Webhook URL: `https://<ngrok-url>/webhooks/email/inbound`
- Note: ngrok URL changes on restart

### Manus Configuration
- Approved sender: `relay@mail.fly-bot.net` (configured)
- Workflow emails use prefix: `arksenu-*@manus.bot`

### Database
- Users table has test user: `leizaro.fei@gmail.com` (100 credits, approved)
- Workflows: research, summarize, newsletter → `arksenu-*@manus.bot`

## Files Structure
```
email-api/
├── src/
│   ├── index.ts          # Express entry
│   ├── config.ts         # Env validation
│   ├── api/
│   │   ├── routes.ts     # Webhook endpoint
│   │   └── admin/
│   │       ├── routes.ts     # Admin API endpoints
│   │       └── middleware.ts # JWT auth
│   ├── db/               # Database queries
│   │   ├── client.ts
│   │   ├── users.ts
│   │   ├── workflows.ts
│   │   ├── mappings.ts
│   │   ├── admins.ts
│   │   └── transactions.ts
│   └── email/            # Email processing
│       ├── inbound.ts    # User email handler
│       ├── response.ts   # Manus response handler
│       ├── outbound.ts   # SendGrid sending
│       ├── parser.ts     # Webhook parsing
│       └── branding.ts   # Strip Manus branding + ack detection
├── admin/                # React admin frontend (Vite)
│   ├── src/
│   │   ├── pages/        # Login, Dashboard, Users, Workflows, Activity
│   │   ├── components/   # Layout
│   │   └── lib/api.ts    # API client
│   └── vite.config.ts
├── migrations/
│   ├── 001_initial.sql
│   └── 002_admin.sql
├── scripts/
│   ├── seed-workflows.ts
│   └── seed-admin.ts
├── docker-compose.yml
├── Dockerfile
└── .env
```

## Completed During Session (2026-02-05)
1. ✅ Built admin panel (React + Vite + react-router-dom)
2. ✅ Added JWT authentication for admin API
3. ✅ Created admin user seeding script (ADMIN_PASSWORD env var)
4. ✅ Implemented user CRUD with credit adjustments and approval
5. ✅ Implemented full workflow editing (name, manus_address, credits_per_task, description, is_active)
6. ✅ Added activity monitoring (email tasks + transactions)
7. ✅ Fixed Vite proxy for local development (port 3001)
8. ✅ Updated documentation (CLAUDE.md, CHANGELOG.md)

## Files Modified/Created This Session
- admin/ - New React admin frontend
- src/api/admin/routes.ts - Admin API endpoints
- src/api/admin/middleware.ts - JWT auth middleware
- src/db/admins.ts - Admin authentication model
- src/db/workflows.ts - Extended updateWorkflow() for name/manus_address
- src/db/transactions.ts - Transaction queries
- migrations/002_admin.sql - Admin table
- scripts/seed-admin.ts - Admin user seeder
- admin/vite.config.ts - Proxy to port 3001 for local dev

## Next Steps (Future)
1. Deploy to permanent server (replace ngrok)
2. Remove DEBUG logging from parser.ts and outbound.ts
3. Add webhook signature verification
4. Add retry logic for failed email sends
5. Add rate limiting
6. Build user registration API (public)
7. Build payment integration (Stripe)
8. Add monitoring/alerting
9. Write tests

## Running the App

### Production (Docker)
```bash
docker compose up
# Admin at http://localhost:3000/admin
```

### Local Development (with hot reload)
```bash
# Terminal 1: Backend on port 3001
PORT=3001 npm run dev

# Terminal 2: Vite frontend with hot reload
npm run dev:admin
# Admin at http://localhost:5173/admin
```

### Email Testing (ngrok)
```bash
ngrok http 3000
# Update SendGrid webhook URL when ngrok restarts
```

## Useful Commands
```bash
# Add user
docker compose exec db psql -U flybot -d flybot -c "INSERT INTO users (email, credits, is_approved) VALUES ('email@example.com', 100, true);"

# Check workflows
docker compose exec db psql -U flybot -d flybot -c "SELECT * FROM workflows;"

# Check mappings
docker compose exec db psql -U flybot -d flybot -c "SELECT * FROM email_mappings;"

# Check user credits
docker compose exec db psql -U flybot -d flybot -c "SELECT email, credits FROM users;"
```
