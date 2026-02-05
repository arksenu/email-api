Implement Phase 1 of this spec. Use the agent pipeline:
1. codebase-navigator to check current project state
2. implementation-planner to create the plan
3. Write code
4. implementation-reviewer to validate

Start with codebase-navigator.

# Fly-Bot Email API Service Prototype

## Project Overview
Build a prototype email-based API service that wraps Manus.im's Mail Manus feature. Users send emails to fly-bot.net, which forwards to your Manus workflow emails, then intercepts and relays responses back to users with your branding.

## Architecture
```
User (anyone@gmail.com) → research@fly-bot.net
                              ↓
                    [Your SMTP Server]
                    - Verify user has credits
                    - Rewrite From: relay@fly-bot.net
                    - Store mapping: message_id → original sender
                              ↓
                    [Forward to research@manus.bot]
                    (relay@fly-bot.net is in Manus approved senders)
                              ↓
                    [Manus processes task]
                              ↓
                    [Manus replies to relay@fly-bot.net]
                              ↓
                    [Your SMTP Server]
                    - Match response to original request
                    - Strip Manus branding
                    - Deduct credits
                              ↓
                    [Relay to anyone@gmail.com]
                    From: research@fly-bot.net
```

## Key Design Decision: Single Relay Address

**Problem**: Manus only accepts emails from pre-approved senders. Adding every fly-bot.net user to Manus approved senders doesn't scale.

**Solution**: One approved sender address (`relay@fly-bot.net`) handles all forwarding.

- You add `relay@fly-bot.net` to Manus approved senders (once, manually)
- All user emails get rewritten to come FROM `relay@fly-bot.net`
- Original sender tracked in your database and optionally in email body/headers
- Manus sees all requests from one trusted address

## Manus Mail Context

### Your Manus Account Setup
You own one Manus account with:
- Main bot address: `flybot@manus.bot` (or whatever prefix you choose)
- Workflow emails you create:
  - `research@manus.bot` - Default prompt: "Research the topic and provide comprehensive analysis"
  - `summarize@manus.bot` - Default prompt: "Summarize the attached document or email content"
  - `newsletter@manus.bot` - Default prompt: "Process this newsletter content and extract key insights"
  - etc.
- Approved senders list containing: `relay@fly-bot.net`

### How Mail Manus Works
- Workflow emails have a "Default Prompt" that automatically applies to incoming emails
- Only emails from approved senders trigger tasks
- When Manus receives an email:
  1. Sends acknowledgment that task has begun
  2. Processes task (analyzes content, attachments, executes default prompt + any additional instructions)
  3. Replies with results (can include attachments)

### What You Cannot Control
- @manus.bot domain is fixed
- Acknowledgment/response emails contain Manus branding
- Approved senders managed via UI only (no API)
- Credits consumed from your Manus account

## Phase 1: Core SMTP Mediator

### Requirements

1. **Inbound email receiving**
   - Receive emails at `*@fly-bot.net`
   - Parse: sender, recipient, subject, body, attachments
   - Extract workflow from recipient: `research@fly-bot.net` → `research`

2. **User authentication/credit check**
   - Database lookup by sender email
   - Reject if: not registered, no credits, or banned
   - Send bounce email explaining rejection reason

3. **Forward to Manus**
   - Rewrite From: `relay@fly-bot.net`
   - Rewrite To: `{workflow}@manus.bot`
   - Prepend original sender to body for your records
   - Store mapping: `{message_id, original_sender, workflow, timestamp}`
   - Send to Manus

4. **Intercept Manus response**
   - Receive at `relay@fly-bot.net`
   - Match to original request via In-Reply-To header or subject parsing
   - Strip Manus branding from subject and body
   - Rewrite From: `{workflow}@fly-bot.net`
   - Relay to original sender
   - Deduct credits

### Tech Stack

**Option A: Webhook-based (Recommended for prototype)**
- Inbound: SendGrid Inbound Parse or Mailgun Routes
- Outbound: Same provider's sending API
- Backend: Node.js or Python web server
- Simpler ops, no SMTP server management

**Option B: Self-hosted SMTP**
- Inbound: `smtp-server` (Node) or `aiosmtpd` (Python)
- Outbound: `nodemailer` or `smtplib`
- More control, more infrastructure work

**Database**: PostgreSQL (or SQLite for initial prototype)

**Recommendation**: Start with SendGrid Inbound Parse. Switch to self-hosted later if needed.

### Database Schema
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    credits INTEGER DEFAULT 0,
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE email_mappings (
    id SERIAL PRIMARY KEY,
    original_message_id VARCHAR(255),
    original_sender VARCHAR(255) NOT NULL,
    workflow VARCHAR(100) NOT NULL,
    manus_message_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending', -- pending, acknowledged, completed, failed
    credits_charged INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    credits_delta INTEGER NOT NULL,
    reason VARCHAR(255),
    email_mapping_id INTEGER REFERENCES email_mappings(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE workflows (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL, -- "research", "summarize", etc.
    manus_address VARCHAR(255) NOT NULL, -- "research@manus.bot"
    description TEXT,
    credits_per_task INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT TRUE
);
```

### Core Logic (Pseudocode)

**Inbound handler:**
```
handle_inbound_email(email):
    sender = email.from
    recipient = email.to  # e.g., research@fly-bot.net
    workflow = extract_workflow(recipient)  # "research"
    
    # Auth check
    user = db.get_user(sender)
    if not user:
        send_bounce(sender, "Not registered. Sign up at fly-bot.net")
        return
    if not user.is_approved:
        send_bounce(sender, "Account pending approval")
        return
    if user.credits < get_workflow_cost(workflow):
        send_bounce(sender, f"Insufficient credits. Balance: {user.credits}")
        return
    
    # Get workflow config
    workflow_config = db.get_workflow(workflow)
    if not workflow_config or not workflow_config.is_active:
        send_bounce(sender, f"Unknown workflow: {workflow}")
        return
    
    # Store mapping
    mapping = db.create_mapping(
        original_message_id=email.message_id,
        original_sender=sender,
        workflow=workflow
    )
    
    # Rewrite and forward
    forwarded_email = {
        "from": "relay@fly-bot.net",
        "to": workflow_config.manus_address,
        "subject": email.subject,
        "body": f"[fly-bot.net request from: {sender}]\n\n{email.body}",
        "attachments": email.attachments,
        "headers": {
            "X-Flybot-Mapping-Id": mapping.id,
            "X-Flybot-Original-Sender": sender
        }
    }
    
    send_email(forwarded_email)
    log(f"Forwarded {mapping.id} to {workflow_config.manus_address}")
```

**Response handler:**
```
handle_manus_response(email):
    # This arrives at relay@fly-bot.net from Manus
    
    # Try to match via In-Reply-To
    in_reply_to = email.headers.get("In-Reply-To")
    mapping = db.get_mapping_by_message_id(in_reply_to)
    
    # Fallback: parse subject or body for mapping ID
    if not mapping:
        mapping = try_extract_mapping_from_content(email)
    
    if not mapping:
        log.error(f"Unmatched Manus response: {email.subject}")
        return
    
    # Check if this is acknowledgment vs completion
    if is_acknowledgment(email):
        db.update_mapping_status(mapping.id, "acknowledged")
        # Optionally forward acknowledgment to user (or suppress)
        return
    
    # Process completion
    user = db.get_user(mapping.original_sender)
    workflow_config = db.get_workflow(mapping.workflow)
    
    # Strip Manus branding
    clean_subject = strip_manus_branding(email.subject)
    clean_body = strip_manus_branding(email.body)
    
    # Compose response
    response = {
        "from": f"{mapping.workflow}@fly-bot.net",
        "to": mapping.original_sender,
        "subject": f"[Fly-Bot] {clean_subject}",
        "body": clean_body,
        "attachments": email.attachments,
        "in_reply_to": mapping.original_message_id
    }
    
    send_email(response)
    
    # Deduct credits
    db.deduct_credits(user.id, workflow_config.credits_per_task)
    db.create_transaction(user.id, -workflow_config.credits_per_task, f"Task: {mapping.workflow}", mapping.id)
    db.update_mapping_status(mapping.id, "completed")
    
    log(f"Completed {mapping.id}, charged {workflow_config.credits_per_task} credits")
```

**Branding stripper:**
```
strip_manus_branding(text):
    # These patterns need to be discovered by examining actual Manus emails
    patterns_to_remove = [
        r"\[Manus\]",
        r"Manus:",
        r"Powered by Manus",
        r"manus\.im",
        r"Your task has been.*?started",  # Acknowledgment text
        # Add more as discovered
    ]
    
    result = text
    for pattern in patterns_to_remove:
        result = re.sub(pattern, "", result, flags=re.IGNORECASE)
    
    return result.strip()

is_acknowledgment(email):
    indicators = [
        "task has been started",
        "working on your request",
        "processing your email"
    ]
    body_lower = email.body.lower()
    return any(ind in body_lower for ind in indicators)
```

## Phase 2: User Management API

Simple REST API at `api.fly-bot.net`:
```
POST /register
    Body: { email, password }
    → Creates user with 0 credits, is_approved=false
    → Sends verification email

POST /login
    Body: { email, password }
    → Returns JWT

GET /me
    Headers: Authorization: Bearer <token>
    → Returns { email, credits, created_at }

GET /usage
    Headers: Authorization: Bearer <token>
    → Returns transaction history

GET /workflows
    → Returns list of available workflows with descriptions and costs

POST /credits/purchase
    Headers: Authorization: Bearer <token>
    Body: { amount, payment_token }
    → Stripe integration
    → Adds credits to account
```

## DNS Configuration for fly-bot.net

### If using SendGrid Inbound Parse:
```
MX  fly-bot.net  →  mx.sendgrid.net  (priority 10)
TXT fly-bot.net  →  v=spf1 include:sendgrid.net ~all
CNAME s1._domainkey.fly-bot.net → s1.domainkey.u12345.wl.sendgrid.net
CNAME s2._domainkey.fly-bot.net → s2.domainkey.u12345.wl.sendgrid.net
```

### If self-hosting SMTP:
```
MX  fly-bot.net  →  mail.fly-bot.net  (priority 10)
A   mail.fly-bot.net  →  <your-server-ip>
TXT fly-bot.net  →  v=spf1 ip4:<your-server-ip> ~all
TXT _dmarc.fly-bot.net  →  v=DMARC1; p=none; rua=mailto:dmarc@fly-bot.net
```
Plus DKIM setup.

## Project Structure
```
fly-bot/
├── src/
│   ├── email/
│   │   ├── inbound.ts       # Webhook handler for incoming emails
│   │   ├── outbound.ts      # Email sending (SendGrid/Mailgun API)
│   │   ├── parser.ts        # MIME parsing utilities
│   │   └── branding.ts      # Manus branding stripper
│   ├── db/
│   │   ├── client.ts        # Database connection
│   │   ├── users.ts         # User queries
│   │   ├── mappings.ts      # Email mapping queries
│   │   └── workflows.ts     # Workflow queries
│   ├── api/
│   │   ├── routes.ts        # REST API routes
│   │   ├── auth.ts          # JWT middleware
│   │   └── stripe.ts        # Payment handling
│   ├── config.ts            # Environment config
│   └── index.ts             # Express app entry
├── migrations/
│   └── 001_initial.sql      # Database schema
├── scripts/
│   └── seed-workflows.ts    # Insert default workflows
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
└── .env.example
```

## Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/flybot

# Email Provider (SendGrid example)
SENDGRID_API_KEY=SG.xxxx
SENDGRID_INBOUND_WEBHOOK_PATH=/webhooks/email/inbound

# Outbound email
FROM_DOMAIN=fly-bot.net
RELAY_ADDRESS=relay@fly-bot.net

# Manus (for reference, not used in code directly)
MANUS_BOT_PREFIX=flybot
# Workflows configured in Manus UI:
# - research@manus.bot
# - summarize@manus.bot
# - etc.

# API
JWT_SECRET=your-secret-here
PORT=3000

# Stripe
STRIPE_SECRET_KEY=sk_test_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx

# Credits
DEFAULT_CREDITS_PER_TASK=10
```

## Pre-Implementation Research Tasks

Before writing code, manually test Manus email behavior:

1. **Send test email to your Manus bot**
   - Note exact subject line format of acknowledgment
   - Note exact subject line format of completion
   - Save full email headers (especially Message-ID, In-Reply-To patterns)
   - Document body structure and where branding appears

2. **Test forwarding behavior**
   - Forward an email to Manus (simulating your relay)
   - Verify Manus correctly parses forwarded content
   - Check if attachments survive forwarding
   - Note how Manus references the forwarded content in reply

3. **Test reply threading**
   - Send follow-up email to same Manus thread
   - Understand how Manus handles conversation context

4. **Document timing**
   - How long for acknowledgment?
   - How long for typical task completion?
   - Any rate limits observed?

## Manual Setup Before Running Prototype

1. **Manus account**
   - Create workflow emails in Settings → Mail Manus → Workflow Emails:
     - `research@manus.bot` with appropriate default prompt
     - `summarize@manus.bot` with appropriate default prompt
   - Add `relay@fly-bot.net` to Settings → Mail Manus → Approved Senders

2. **SendGrid (or chosen provider)**
   - Verify fly-bot.net domain
   - Set up Inbound Parse webhook pointing to your server
   - Configure DNS records

3. **Database**
   - Run migrations
   - Seed workflows table to match Manus workflow emails

## Testing Checklist

- [ ] Send email to `research@fly-bot.net` from registered user with credits
- [ ] Verify email reaches your webhook/SMTP server
- [ ] Verify forwarding to `research@manus.bot` succeeds
- [ ] Verify Manus acknowledgment is received
- [ ] Verify Manus completion is received
- [ ] Verify response is relayed to original sender
- [ ] Verify Manus branding is stripped
- [ ] Verify credits are deducted
- [ ] Test rejection: unregistered sender
- [ ] Test rejection: zero credits
- [ ] Test rejection: unknown workflow
- [ ] Test with PDF attachment
- [ ] Test with image attachment
- [ ] Test with multiple attachments