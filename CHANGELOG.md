# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Changed
- Admin panel workflow editing now supports updating workflow name and manus_address fields
- PATCH /admin/api/workflows/:id endpoint accepts name and manus_address updates
- Workflows page displays editable form fields for name and manus_address
- Vite proxy configuration updated to target backend on port 3001

## [1.0.0] - 2026-02-04

### Added
- Full email relay system: user sends to workflow@mail.fly-bot.net, system forwards to Manus, receives response, and relays back to original sender
- SendGrid Inbound Parse webhook integration for receiving emails at mail.fly-bot.net subdomain
- SendGrid domain authentication for mail.fly-bot.net sending domain
- Acknowledgment detection to skip Manus "I have received your task" messages
- Credit system with automatic deduction on task completion
- Multiple workflow support: summarize, research, newsletter
- Email mapping tracking with original_message_id, manus_message_id, and status
- User validation: registered users, approval system, credit balance checks
- Bounce email handling for unregistered users, unapproved users, insufficient credits, and unknown workflows
- Email content rewriting: From field to relay@mail.fly-bot.net, To field to workflow-specific Manus addresses
- Manus branding removal from response subject and body
- Transaction logging for credit operations
- PostgreSQL database schema with users, workflows, email_mappings, and transactions tables
- Docker Compose setup for local development
- Health check endpoint at GET /health
- Workflow seeding script
- Database migration system
- Admin platform with React frontend and JWT authentication
- Admin dashboard with statistics overview
- User management: CRUD operations, credit adjustments, approval toggle
- Workflow management: View and edit workflow settings
- Activity monitoring: Email task history and transaction log

### Changed
- Updated RELAY_ADDRESS from relay@fly-bot.net to relay@mail.fly-bot.net
- Updated FROM_DOMAIN from fly-bot.net to mail.fly-bot.net

### Fixed
- Race condition protection for credit deduction
- Email parsing with stripHtml fallback for body extraction
- SendGrid error logging for debugging

## Technical Details

### Email Flow
1. User sends email to workflow@mail.fly-bot.net (e.g., research@mail.fly-bot.net)
2. SendGrid Inbound Parse webhook delivers to POST /webhooks/email/inbound
3. System validates user (registered, approved, sufficient credits)
4. Email forwarded to Manus workflow (e.g., arksenu-research@manus.bot) with From: relay@mail.fly-bot.net
5. Manus processes task and sends acknowledgment (skipped by system)
6. Manus sends completion response to relay@mail.fly-bot.net
7. System matches response to original request via In-Reply-To header or Mapping ID
8. System strips Manus branding and relays cleaned response to original sender
9. Credits deducted from user account, transaction logged

### Configuration
- Manus approved sender: relay@mail.fly-bot.net
- SendGrid Inbound Parse domain: mail.fly-bot.net
- Webhook URL: https://[ngrok-url]/webhooks/email/inbound (temporary)
- Workflows: research, summarize, newsletter → arksenu-*@manus.bot

### Known Limitations
- Currently deployed via ngrok (temporary webhook URL)
- DEBUG logging still present in parser.ts and outbound.ts
- No webhook signature verification
- No retry logic for failed sends
- No rate limiting
- No user registration API
- No payment integration
- No tests
