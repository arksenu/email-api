# Fly-Bot Email API

Email API service wrapping Manus.im Mail Manus. Provides an email proxy for workflow automation: receives emails at *@fly-bot.net, forwards to Manus workflows, and relays responses back to original senders.

## Current Status

**MVP WORKING** - Full email relay system operational.

### What Works (Tested and Verified)

- ✅ **Full email round-trip**: User → workflow@mail.fly-bot.net → Manus → relay receives response → original sender
- ✅ **SendGrid integration**: Inbound Parse webhook configured for mail.fly-bot.net subdomain
- ✅ **Domain authentication**: SendGrid domain authentication configured for sending from mail.fly-bot.net
- ✅ **User validation**: Registered users, approval system, credit balance checks
- ✅ **Bounce handling**: Rejection emails for unregistered/unapproved/insufficient credits/unknown workflows
- ✅ **Email forwarding**: Rewrites From field to relay@mail.fly-bot.net, forwards to Manus workflow addresses
- ✅ **Response matching**: Matches Manus responses to original requests via In-Reply-To header or Mapping ID
- ✅ **Acknowledgment filtering**: Skips Manus "I have received your task" acknowledgment messages
- ✅ **Branding removal**: Strips Manus branding from subject and body
- ✅ **Credit system**: Automatic deduction on task completion with race condition protection
- ✅ **Multiple workflows**: Supports research, summarize, newsletter workflows
- ✅ **Transaction logging**: Records all credit operations
- ✅ **Attachment handling**: Preserves attachments when forwarding to Manus
- ✅ **Health check**: GET /health endpoint

### Deployment Status

Currently running on **ngrok** (temporary). Webhook URL must be updated in SendGrid when ngrok restarts.

**Production deployment needed**: Requires permanent server with static webhook URL.

### Implemented

- ✅ **User registration and login**: User portal with JWT authentication (7-day tokens)
- ✅ **User dashboard**: Account overview with credits, approval status, usage history
- ✅ **Community workflows**: Users can create custom workflows with API method support
- ✅ **Workflow directory**: Browse public native, official, and community workflows
- ✅ **Approved senders**: Manage email access for private workflows
- ✅ **Paginated history**: Usage and transaction logs with pagination
- ✅ **Admin platform**: Full admin panel for user/workflow/activity management

### Not Implemented (Future Phases)

- Stripe payment integration for purchasing credits
- Webhook signature verification (SendGrid signed events)
- Retry logic for failed email sends
- Dead letter queue for unmatched responses
- Rate limiting on webhook endpoint
- HTML email templates (bounce emails are plain text)
- External logging service (console.log only)
- Metrics/monitoring
- Tests
- Removal of DEBUG logging (temporary debugging code in parser.ts and outbound.ts)

## Architecture

- **Backend**: Node.js 20+ with TypeScript, Express
- **Database**: PostgreSQL 16
- **Email**: SendGrid Inbound Parse webhook for receiving, SendGrid API for sending
- **Deployment**: Docker Compose

### Database Schema

- `users`: User accounts with email, credits, approval status
- `workflows`: Manus workflow configurations (name, manus address, credits per task)
- `email_mappings`: Tracks email routing from user → workflow → Manus → response
- `transactions`: Credit ledger

### Email Flow

1. User sends email to `workflow@mail.fly-bot.net` (e.g., research@mail.fly-bot.net)
2. SendGrid Inbound Parse delivers to POST /webhooks/email/inbound
3. System validates user (registered, approved, sufficient credits)
4. Email forwarded to Manus workflow (e.g., arksenu-research@manus.bot) with From: relay@mail.fly-bot.net
5. Manus processes task and sends acknowledgment (skipped by system)
6. Manus sends completion response to relay@mail.fly-bot.net
7. System matches response to original request via In-Reply-To header or Mapping ID
8. System strips Manus branding and relays cleaned response to original sender
9. Credits deducted from user account, transaction logged

## Installation

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- SendGrid account with API key and Inbound Parse configured

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database
DATABASE_URL=postgresql://flybot:flybot@localhost:5432/flybot

# SendGrid
SENDGRID_API_KEY=SG.xxxx

# Email Configuration
FROM_DOMAIN=mail.fly-bot.net
RELAY_ADDRESS=relay@mail.fly-bot.net

# Server
PORT=3000
NODE_ENV=development
```

### Local Development

```bash
# Install dependencies
npm install

# Start PostgreSQL (via Docker)
docker-compose up -d db

# Run migrations
npm run migrate

# Seed workflow data
npm run seed

# Run development server
npm run dev
```

### Docker Deployment

```bash
# Build and start all services
docker-compose up

# Stop services
docker-compose down
```

### SendGrid Configuration

**Inbound Parse Setup:**
1. Go to SendGrid Settings → Inbound Parse
2. Add hostname: `mail.fly-bot.net`
3. Set webhook URL: `https://[your-server]/webhooks/email/inbound`
4. Check "POST raw, full MIME message"

**Domain Authentication:**
1. Go to SendGrid Settings → Sender Authentication
2. Authenticate domain: `mail.fly-bot.net`
3. Follow DNS record instructions for DKIM/SPF/DMARC

**DNS Records (GoDaddy or similar):**
- MX record: `mail.fly-bot.net` → `mx.sendgrid.net` (priority 10)
- CNAME records for domain authentication (provided by SendGrid)

### Manus Configuration

Add approved sender in Manus settings:
- Email: `relay@mail.fly-bot.net`

Workflow addresses use format: `arksenu-[workflow]@manus.bot`
- research@mail.fly-bot.net → arksenu-research@manus.bot
- summarize@mail.fly-bot.net → arksenu-summarize@manus.bot
- newsletter@mail.fly-bot.net → arksenu-newsletter@manus.bot

### Testing the System

1. Add test user to database:
```bash
docker compose exec db psql -U flybot -d flybot -c \
  "INSERT INTO users (email, credits, is_approved) VALUES ('your@email.com', 100, true);"
```

2. Send email to `research@mail.fly-bot.net` from registered email address

3. Check logs for processing:
```bash
docker compose logs -f app
```

4. Verify email mapping created:
```bash
docker compose exec db psql -U flybot -d flybot -c "SELECT * FROM email_mappings ORDER BY created_at DESC LIMIT 1;"
```

5. Wait for Manus response (relayed back to your email)

6. Verify credits deducted:
```bash
docker compose exec db psql -U flybot -d flybot -c "SELECT email, credits FROM users WHERE email='your@email.com';"
```

## Commands

- `npm install` - Install dependencies
- `npm run build` - Compile TypeScript + build admin + portal frontends
- `npm run build:admin` - Build admin frontend only
- `npm run build:portal` - Build portal frontend only
- `npm run dev` - Run backend only with ts-node
- `npm run dev:backend` - Run database + backend (via scripts/dev.sh)
- `npm run dev:all` - Run database + backend + admin + portal (via scripts/dev-all.sh)
- `npm run dev:admin` - Run admin frontend dev server (port 5173)
- `npm run dev:portal` - Run portal frontend dev server (port 5174)
- `npm start` - Run compiled production server
- `npm run migrate` - Run database migrations
- `npm run seed` - Seed workflow data (creates research, summarize, newsletter workflows)
- `npm run seed:admin` - Create admin user (set ADMIN_PASSWORD env var)
- `docker-compose up` - Start with Docker (app + PostgreSQL)
- `docker-compose up -d db` - Start only PostgreSQL
- `docker-compose logs -f app` - View application logs

## Project Structure

```
email-api/
├── src/
│   ├── api/           # Express routes and handlers
│   │   ├── routes.ts      # Webhook endpoints
│   │   ├── admin/         # Admin API and middleware
│   │   └── user/          # User API and middleware
│   ├── db/            # Database client and models
│   ├── email/         # Email parsing, sending, branding
│   ├── config.ts      # Environment configuration
│   └── index.ts       # Application entry point
├── admin/             # React admin frontend (Vite)
├── portal/            # React user portal (Vite)
├── migrations/        # SQL migration files
├── scripts/           # Utility scripts (seeding, dev helpers)
├── docker-compose.yml # Docker orchestration
├── Dockerfile         # Application container
└── tsconfig.json      # TypeScript configuration
```