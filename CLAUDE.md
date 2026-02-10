# CLAUDE.md

## System Directive

### Output Behavior
- No pleasantries, hedging, or affective language
- No emojis or expressive punctuation
- No preamble—execute directly
- No narrating actions before taking them
- Report completion with affected files/lines only

### Code Output
- Write code directly
- Comments only where logic is non-obvious
- Include imports and dependencies

### Errors
- State failure and cause
- Provide fix if known
- No apologies

### Agent Pipeline
For significant implementations:
1. web-researcher → gather external docs/APIs if needed
2. codebase-navigator → identify relevant code
3. implementation-planner → create plan using navigator output
4. main agent → write code
5. implementation-reviewer → validate against plan
6. docs-sync → update CHANGELOG.md, README.md, CLAUDE.md

---

## Project Overview

Fly-Bot Email API: TypeScript/Express service that acts as an email proxy for Manus.im workflow automation. Receives emails via SendGrid webhooks, routes to Manus workflows, and relays responses back to senders.

## Technology Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.3
- **Framework**: Express 4.18
- **Database**: PostgreSQL 16 (pg driver)
- **Email**: SendGrid (@sendgrid/mail, Inbound Parse webhook)
- **Parsing**: mailparser, multer
- **Validation**: Zod

## Project Structure

```
email-api/
├── src/
│   ├── api/
│   │   ├── routes.ts          # Express router with webhook endpoints
│   │   ├── admin/
│   │   │   ├── routes.ts      # Admin API endpoints (SafeUser responses)
│   │   │   └── middleware.ts  # JWT auth middleware (24h expiry)
│   │   └── user/
│   │       ├── routes.ts      # User API endpoints (workflow validation)
│   │       └── middleware.ts  # JWT auth middleware (7-day expiry)
│   ├── db/
│   │   ├── client.ts          # PostgreSQL connection pool
│   │   ├── users.ts           # User model and queries (SafeUser type)
│   │   ├── workflows.ts       # Workflow model and queries
│   │   ├── mappings.ts        # Email mapping model and queries (atomic claim)
│   │   ├── admins.ts          # Admin authentication model
│   │   ├── approvedSenders.ts # Approved sender model and queries
│   │   └── transactions.ts    # Transaction query functions (with pagination)
│   ├── email/
│   │   ├── inbound.ts         # Incoming email handler
│   │   ├── outbound.ts        # Outgoing email sender
│   │   ├── parser.ts          # Email parsing utilities
│   │   ├── response.ts        # Response email handler
│   │   └── branding.ts        # Email footer branding
│   ├── manus/
│   │   └── webhook.ts         # Manus webhook handler (signature validation)
│   ├── config.ts              # Environment variable validation
│   └── index.ts               # Express application entry point (raw middleware)
├── admin/                     # React admin frontend (Vite)
│   ├── src/
│   │   ├── pages/             # Login, Dashboard, Users, Workflows, Activity
│   │   ├── components/        # Layout components
│   │   └── lib/api.ts         # API client with JWT auth
│   ├── package.json
│   └── vite.config.ts
├── portal/                    # React user portal (Vite)
│   ├── src/
│   │   ├── pages/             # Login, Register, Dashboard, Directory, MyWorkflows, Account
│   │   ├── components/        # Layout, TypeBadge, WorkflowCard
│   │   └── lib/api.ts         # API client with JWT auth
│   ├── package.json
│   └── vite.config.ts
├── migrations/
│   ├── 001_initial.sql        # Database schema
│   ├── 002_admin.sql          # Admin table
│   └── 003_custom_workflows.sql # Community workflows and approved senders
├── scripts/
│   ├── seed-workflows.ts      # Seed Manus workflow configurations
│   ├── seed-admin.ts          # Create initial admin user
│   ├── dev.sh                 # Start database + backend
│   └── dev-all.sh             # Start database + backend + admin + portal
├── docker-compose.yml         # PostgreSQL + app orchestration
├── Dockerfile                 # Multi-stage production build
├── tsconfig.json              # TypeScript compiler options
└── package.json               # Dependencies and scripts
```

## Build Commands

```bash
# Development
npm install                # Install dependencies
npm run dev                # Run backend only with ts-node
npm run dev:backend        # Run database + backend (via scripts/dev.sh)
npm run dev:all            # Run database + backend + admin + portal (via scripts/dev-all.sh)
cd admin && npm install    # Install admin frontend dependencies
npm run dev:admin          # Run admin frontend dev server (port 5173)
cd portal && npm install   # Install portal frontend dependencies
npm run dev:portal         # Run portal frontend dev server (port 5174)

# Production
npm run build              # Compile backend + admin + portal frontends
npm run build:admin        # Build admin frontend only (includes npm install)
npm run build:portal       # Build portal frontend only
npm start                  # Run compiled JavaScript

# Database
npm run migrate            # Apply all migrations (uses psql $DATABASE_URL)
npm run seed               # Seed workflow data
npm run seed:admin         # Create admin user (set ADMIN_PASSWORD env var)

# Docker
docker-compose up          # Start app + PostgreSQL
docker-compose up -d db    # Start only PostgreSQL
docker-compose down        # Stop all services
```

## Database Schema

**users**: id, email (unique), credits, is_approved, created_at, password_hash
**workflows**: id, name (unique), manus_address, description, instruction, credits_per_task, is_active, type (native/official/community), is_public, created_by_user_id
**email_mappings**: id, original_message_id, original_sender, workflow, manus_message_id, status, credits_charged, created_at, completed_at
**transactions**: id, user_id, credits_delta, reason, email_mapping_id, created_at
**admins**: id, username (unique), password_hash, created_at
**approved_senders**: id, workflow_id, email, created_by_user_id, created_at

## Environment Variables

Required in `.env`:
- `DATABASE_URL`: PostgreSQL connection string
- `SENDGRID_API_KEY`: SendGrid API key
- `FROM_DOMAIN`: Email domain (mail.fly-bot.net)
- `RELAY_ADDRESS`: Address for Manus responses (relay@mail.fly-bot.net)
- `PORT`: Server port (default 3000)
- `NODE_ENV`: development | production
- `JWT_SECRET`: Secret for admin JWT tokens (min 32 chars)
- `ADMIN_PASSWORD`: (optional) Password for seed script

## Architecture Notes

**Email Flow**:
1. User sends to workflow@mail.fly-bot.net (e.g., research@mail.fly-bot.net)
2. SendGrid Inbound Parse webhook → POST /webhooks/email/inbound
3. Validate user (registered, approved, sufficient credits)
4. Forward to Manus (arksenu-[workflow]@manus.bot) with From: relay@mail.fly-bot.net
5. Manus sends acknowledgment (skipped by system)
6. Manus webhook → POST /webhooks/manus (signature + timestamp validated)
7. System atomically claims mapping via claimMapping (prevents duplicate processing)
8. Strip Manus branding, relay response to original sender
9. Deduct credits atomically, log transaction

**Credit System**:
- Users have credit balance
- Workflows have per-task cost (configured in database, validated positive integer)
- Credits deducted on task completion only
- Atomic mapping claim and completion prevent race conditions
- Transactions logged for each credit operation

**Security**:
- User password hashes never exposed in API responses (SafeUser type)
- Manus webhook signature and timestamp validation prevent unauthorized access
- Atomic database operations prevent TOCTOU race conditions
- JWT authentication for admin (24h) and user (7-day) sessions
- Workflow name uniqueness enforced including inactive workflows

**Approval System**:
- Users must be approved to send emails
- Unapproved users receive bounce email
- Bounce also sent for: unregistered users, insufficient credits, unknown workflows

**Acknowledgment Detection**:
- System skips Manus "I have received your task" messages
- Only completion responses are relayed to users
- Detection based on content patterns in branding.ts

## Current Deployment

**Status**: MVP working, deployed via ngrok (temporary)

**Known Issues**:
- DEBUG logging present in parser.ts and outbound.ts (temporary)
- Ngrok URL must be updated in SendGrid when restarted
- No permanent deployment yet

**Production Requirements**:
- Permanent server with static IP
- Update SendGrid webhook URL to production endpoint
- Remove DEBUG logging
- Add SendGrid Inbound Parse webhook signature verification
- Add rate limiting
- Add monitoring/alerting

## Configuration

**SendGrid**:
- Inbound Parse domain: mail.fly-bot.net
- Webhook URL: https://[server]/webhooks/email/inbound
- Domain authentication: mail.fly-bot.net

**Manus**:
- Approved sender: relay@mail.fly-bot.net
- Workflow format: arksenu-[workflow]@manus.bot

**Workflows** (seeded via scripts/seed-workflows.ts):
- research: 1 credit per task
- summarize: 1 credit per task
- newsletter: 2 credits per task

## Admin Platform

**URL**: http://localhost:3000/admin (or /admin on production)

**Features**:
- Dashboard: Overview stats (users, workflows, tasks, credits)
- Users: CRUD operations, credit adjustments, approval management
- Workflows: View/edit workflow settings (name, manus_address, credits_per_task, description, is_active)
- Activity: Email task history with filters, transaction log

**Setup**:
1. Run `npm run migrate` to create admins table
2. Run `ADMIN_PASSWORD=yourpassword npm run seed:admin` to create admin user
3. Access /admin and login with username: admin

**API Endpoints** (all prefixed with /admin/api):
- POST /auth/login - Get JWT token
- GET /stats - Dashboard statistics
- GET/POST/PATCH/DELETE /users - User CRUD (responses sanitized, no password_hash)
- POST /users/:id/credits - Adjust credits
- GET /workflows - List all workflows
- PATCH /workflows/:id - Update workflow (name, manus_address, credits_per_task, description, is_active)
- GET /mappings - Email task history (filterable)
- GET /transactions - Credit transaction log

**Tech Stack**:
- Backend: Express + JWT (jsonwebtoken, bcrypt)
- Frontend: React 18 + Vite + react-router-dom
- Auth: Bearer token in Authorization header, 24h expiry

## User Portal

**URL**: http://localhost:3000/portal (or /portal on production, localhost:5174/portal in dev)

**Features**:
- Registration: Users can register, pending admin approval
- Login: JWT authentication with 7-day token expiry
- Dashboard: Account overview with credits, approval status, and stats
- Directory: Browse public workflows (native, official, community)
- MyWorkflows: Create and manage community workflows with API method support
- Account: View usage history and transaction log (paginated)
- Approved Senders: Manage approved email addresses for private workflows

**Pages**:
- /portal/login - User login
- /portal/register - User registration
- /portal/dashboard - Account overview
- /portal/directory - Browse public workflows
- /portal/my-workflows - Manage community workflows
- /portal/account - Usage history and transactions

**API Endpoints** (all prefixed with /api):
- POST /auth/register - Register new user
- POST /auth/login - Get JWT token (7-day expiry)
- GET /auth/me - Current user profile
- GET /account - User account details
- GET /account/usage - Email task history (paginated)
- GET /account/transactions - Credit transaction log (paginated)
- GET /workflows/directory - Public workflows
- GET/POST/PATCH/DELETE /workflows - Community workflow CRUD
- GET /workflows/mine - User's own workflows
- GET/POST/DELETE /workflows/:id/senders - Approved sender management

**Tech Stack**:
- Backend: Express + JWT (7-day expiry)
- Frontend: React 18 + Vite + react-router-dom
- Auth: Bearer token stored in localStorage (portal_token)