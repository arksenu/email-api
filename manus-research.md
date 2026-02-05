# Manus.im Research

## Overview

Manus.im is an autonomous AI agent platform developed by Butterfly Effect Pte Ltd (Singapore), launched March 6, 2025. Unlike traditional chatbots, Manus executes multi-step workflows autonomously in a sandbox environment with its own virtual computer. Meta acquired Manus in December 2025 for $2-3 billion.

**Company:**
- Founded: 2022
- Founders: Red Xiao Hong, Red Xiao, Yichao Peak Ji
- Funding: $85M over 3 rounds

## API Documentation

### Base URL
```
https://api.manus.ai
```

### Authentication

- API key via `API_KEY` header
- Keys generated in API Integration settings
- OAuth2.0 + MTLS for connectors (scopes: `agent:execute`, `data:read`, `workflow:modify`)

### Core Endpoints

#### Tasks (`/v1/tasks`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/tasks` | Create new AI task |
| GET | `/v1/tasks` | List all tasks |
| GET | `/v1/tasks/{id}` | Retrieve specific task |
| PATCH | `/v1/tasks/{id}` | Update task |
| DELETE | `/v1/tasks/{id}` | Remove task |

**Create Task Request:**
```json
{
  "prompt": "Write a function to calculate fibonacci numbers",
  "agentProfile": "manus-1.6",
  "attachments": [],
  "taskMode": "agent",
  "connectors": ["connector-uuid"],
  "hideInTaskList": false,
  "createShareableLink": false,
  "taskId": "existing-task-id",
  "locale": "en-US",
  "projectId": "project-id",
  "interactiveMode": false
}
```

**Response:**
```json
{
  "task_id": "string",
  "task_title": "string",
  "task_url": "string",
  "share_url": "string"
}
```

#### Projects (`/v1/projects`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/projects` | Create project |
| GET | `/v1/projects` | List projects |

#### Files (`/v1/files`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/files` | Upload file (returns presigned S3 URL) |
| GET | `/v1/files` | List files |
| GET | `/v1/files/{id}` | Retrieve file details |
| DELETE | `/v1/files/{id}` | Remove file |

**Note:** Files auto-delete after 48 hours.

#### Webhooks (`/v1/webhooks`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/webhooks` | Register webhook |
| DELETE | `/v1/webhooks/{id}` | Remove webhook |

### Agent Profiles

| Profile | Description |
|---------|-------------|
| `manus-1.6` | Standard |
| `manus-1.6-lite` | Speed-optimized |
| `manus-1.6-max` | Quality-focused (higher cost) |

### Task Modes

| Mode | Description |
|------|-------------|
| `chat` | Conversational responses |
| `adaptive` | Automatic mode selection |
| `agent` | Full autonomous agent capabilities |

### Webhook Events

#### `task_created`
```json
{
  "event_id": "string",
  "event_type": "task_created",
  "task_id": "string",
  "task_title": "string",
  "task_url": "string"
}
```

#### `task_progress`
```json
{
  "event_id": "string",
  "event_type": "task_progress",
  "task_id": "string",
  "progress_type": "string",
  "message": "string"
}
```

#### `task_stopped`
```json
{
  "event_id": "string",
  "event_type": "task_stopped",
  "task_id": "string",
  "task_title": "string",
  "task_url": "string",
  "message": "string",
  "stop_reason": "finish | ask",
  "attachments": []
}
```

**Webhook Requirements:**
- Accept POST with JSON payloads
- Respond HTTP 200 within 10 seconds
- Implement signature verification

## Available Connectors

The following connectors are configured for this project:

### My Browser (Browser Operator)

**Critical Feature** - Enables Manus to operate within your local browser environment using existing sessions with active logins and cookies.

**How It Works:**
- Browser extension that uses your authenticated browser sessions
- Powered by browser-use library (depends on Playwright)
- Access authenticated platforms (Crunchbase, PitchBook, SimilarWeb, Financial Times, Semrush, Ahrefs)

**Setup:**
1. Toggle "My Browser" in Connectors section
2. Authorize per task
3. Monitor execution in dedicated tabs

**Browser Support:** Chrome and Edge (recommended)

**Limitations:** Complex interactions (drag-and-drop, multi-step forms) may not work perfectly

### Gmail

| Property | Value |
|----------|-------|
| UUID | `9444d960-ab7e-450f-9cb9-b9467fb0adda` |
| Auth | OAuth 2.0 |

**Capabilities:**
- Email summarization
- Urgency detection
- Inbox management
- Natural language email search

**Example:**
```bash
curl --request POST \
  --url https://api.manus.ai/v1/tasks \
  --header 'API_KEY: <key>' \
  --header 'Content-Type: application/json' \
  --data '{
    "prompt": "Retrieve my emails and identify urgent messages",
    "connectors": ["9444d960-ab7e-450f-9cb9-b9467fb0adda"]
  }'
```

### GitHub

**Capabilities:**
- Read/write code, commit, push/pull
- Handle issues and pull requests
- Automated release notes
- Two-way sync with repositories

**Setup:** Authorize through Settings → GitHub tab

### OpenAI

MCP connector for OpenAI API integration. Enables Manus tasks to leverage OpenAI models for:
- Text generation and completion
- Embeddings
- Image generation (DALL-E)
- Audio transcription (Whisper)

### Google Gemini

MCP connector for Google's Gemini models. Capabilities:
- Multimodal understanding (text, images, video)
- Long context processing
- Code generation and analysis

### Perplexity

MCP connector for Perplexity AI search. Enables:
- Real-time web search with citations
- Research and fact-checking
- Up-to-date information retrieval

### ElevenLabs

MCP connector for ElevenLabs audio API. Capabilities:
- Text-to-speech generation
- Voice cloning
- Audio content creation
- Multiple voice options and languages

### Playwright

Browser automation connector using Playwright framework. Enables:
- Headless browser control
- Web scraping
- Automated testing
- Screenshot capture
- PDF generation

### Serena

Custom MCP connector. Consult internal documentation for capabilities and configuration.

## SDK/Client Libraries

### OpenAI SDK Compatibility

Compatible with OpenAI Python SDK (tested up to v1.100.2):

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://api.manus.im",
    api_key="**",
    default_headers={
        "API_KEY": "your-api-key"
    },
)
```

### Supported File Types

- Documents: PDF, DOCX, TXT, MD
- Spreadsheets: CSV, XLSX
- Code: JSON, YAML, Python, JavaScript, etc.

### Community SDKs

- PHP SDK (Laravel support)
- TypeScript/Node.js via OpenAI SDK

## Pricing

### Plans (2026)

| Plan | Price | Credits | Concurrent Tasks | Scheduled Tasks |
|------|-------|---------|------------------|-----------------|
| Free | $0/month | 300 daily + 1,000 starter | 1 | 1 |
| Basic/Plus | $19/month | 1,900 monthly + 1,900 promo | 2 | 2 |
| Pro | ~$199/month | Increased | Higher | Higher |
| Enterprise | Custom | Custom | Custom | Custom |

**Notes:**
- Annual billing: 17% discount
- No credit rollover
- All paid plans get 300 daily refresh credits
- Additional credits: $0.01-$0.05 per credit
- Typical task: ~150 credits

## Use Cases

**Business:**
- Automated meeting reminders
- Resume/CV/cover letter creation
- Pitch deck generation
- Email management and summarization
- Competitive research

**Technical:**
- Code generation and debugging
- API endpoint auto-generation
- Data analysis and reporting
- Document processing
- Multi-step workflow automation

## Sources

- [Manus Official Documentation](https://manus.im/docs/introduction/welcome)
- [Manus API Documentation](https://open.manus.im/docs)
- [Manus Browser Operator](https://manus.im/docs/integrations/manus-browser-operator)
- [Manus Pricing](https://manus.im/pricing)
- [OpenAI SDK Compatibility](https://open.manus.im/docs/openai-compatibility)
- [Webhooks Documentation](https://open.manus.im/docs/webhooks)
- [Gmail Connector](https://open.manus.im/docs/connectors/gmail)
- [MCP Connectors](https://manus.im/docs/integrations/mcp-connectors)
