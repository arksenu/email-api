# MVP: Fly-Bot Email API

## Scope

Email proxy service that receives emails at `*@fly-bot.net`, forwards to Manus workflows via a single relay address, and relays responses back to original senders.

## Core Flow

```
User → workflow@fly-bot.net → [Validate + Rewrite] → workflow@manus.bot
                                                           ↓
User ← workflow@fly-bot.net ← [Match + Brand + Relay] ← relay@fly-bot.net
```

## MVP Features

### 1. Inbound Email Handling
- Receive emails via SendGrid Inbound Parse webhook
- Parse sender, recipient, subject, body, attachments
- Extract workflow from recipient address

### 2. User Validation
- Lookup sender in database
- Reject if: not registered, not approved, insufficient credits
- Send rejection email with reason

### 3. Forward to Manus
- Rewrite `From:` to `relay@fly-bot.net`
- Rewrite `To:` to `{workflow}@manus.bot`
- Prepend original sender info to body
- Store mapping: `{message_id, sender, workflow, timestamp}`

### 4. Response Handling
- Receive Manus responses at `relay@fly-bot.net`
- Match to original request via In-Reply-To header or body parsing
- Detect acknowledgment vs completion emails
- Strip Manus branding from subject/body

### 5. Relay to User
- Rewrite `From:` to `{workflow}@fly-bot.net`
- Send to original sender
- Deduct credits on completion
- Log transaction

## Database Schema

```sql
users (id, email, credits, is_approved, created_at)
workflows (id, name, manus_address, description, credits_per_task, is_active)
email_mappings (id, original_message_id, original_sender, workflow, manus_message_id, status, credits_charged, created_at, completed_at)
transactions (id, user_id, credits_delta, reason, email_mapping_id, created_at)
```

## Tech Stack

- Node.js + TypeScript + Express
- PostgreSQL
- SendGrid (Inbound Parse + Mail Send API)
- Zod for validation

## Endpoints

```
POST /api/webhook/inbound    # SendGrid Inbound Parse webhook
GET  /health                 # Health check
```

## Environment Variables

```
DATABASE_URL
SENDGRID_API_KEY
FROM_DOMAIN
RELAY_ADDRESS
PORT
NODE_ENV
```

## Out of Scope (Phase 2+)

- User registration/login API
- Payment/Stripe integration
- Admin dashboard
- Email threading/conversation context
- Rate limiting
- Metrics/monitoring
