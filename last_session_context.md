# Last Session Context

## Date
2026-02-04

## What We Built
Phase 1 of Fly-Bot Email API - an email mediator service that wraps Manus.im's Mail Manus feature.

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

### What's Not Tested Yet
- ⏳ Manus response handling (need to add relay@mail.fly-bot.net to Manus approved senders)
- ⏳ Branding stripping
- ⏳ Credit deduction on completion

### Not Implemented (Phase 2+)
- User registration API
- Login/auth API
- Credit purchase (Stripe)
- Admin panel
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

### Manus Configuration (TODO)
- Add approved sender: `relay@mail.fly-bot.net`
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
│   ├── api/routes.ts     # Webhook endpoint
│   ├── db/               # Database queries
│   │   ├── client.ts
│   │   ├── users.ts
│   │   ├── workflows.ts
│   │   └── mappings.ts
│   └── email/            # Email processing
│       ├── inbound.ts    # User email handler
│       ├── response.ts   # Manus response handler
│       ├── outbound.ts   # SendGrid sending (with DEBUG logging)
│       ├── parser.ts     # Webhook parsing (with DEBUG logging)
│       └── branding.ts   # Strip Manus branding + ack detection
├── migrations/001_initial.sql
├── scripts/seed-workflows.ts
├── docker-compose.yml
├── Dockerfile
└── .env
```

## Completed During Session
1. ✅ Added relay@mail.fly-bot.net to Manus approved senders
2. ✅ Configured SendGrid Inbound Parse for mail.fly-bot.net subdomain
3. ✅ Configured SendGrid domain authentication for mail.fly-bot.net
4. ✅ Tested full email round-trip (user → workflow → Manus → relay → user)
5. ✅ Verified acknowledgment detection (skips Manus ack messages)
6. ✅ Verified branding stripping (subject and body cleaned)
7. ✅ Verified credit deduction on task completion
8. ✅ Updated environment variables (RELAY_ADDRESS, FROM_DOMAIN to use mail.fly-bot.net)
9. ✅ Added DEBUG logging to parser.ts and outbound.ts for troubleshooting
10. ✅ Tested multiple workflows (research, summarize, newsletter)

## Files Modified This Session
- src/email/branding.ts - Added acknowledgment indicators for Manus messages
- src/email/parser.ts - Added DEBUG logging and stripHtml fallback
- src/email/outbound.ts - Added SendGrid error logging
- .env - Updated RELAY_ADDRESS and FROM_DOMAIN to mail.fly-bot.net

## Next Steps (Future)
1. Deploy to permanent server (replace ngrok)
2. Remove DEBUG logging from parser.ts and outbound.ts
3. Add webhook signature verification
4. Add retry logic for failed email sends
5. Add rate limiting
6. Build user registration API
7. Build payment integration (Stripe)
8. Build admin panel for user approval
9. Add monitoring/alerting
10. Write tests

## Running the App
```bash
# Start
docker compose up

# In another terminal, expose via ngrok
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
