-- Add new columns to workflows for custom workflow support
ALTER TABLE workflows ADD COLUMN type VARCHAR(20) DEFAULT 'community';
ALTER TABLE workflows ADD COLUMN instruction TEXT;
ALTER TABLE workflows ADD COLUMN is_public BOOLEAN DEFAULT TRUE;
ALTER TABLE workflows ADD COLUMN created_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE workflows ADD COLUMN created_at TIMESTAMP DEFAULT NOW();

-- Rename manus_message_id to manus_task_id for clarity (API uses task_id)
ALTER TABLE email_mappings RENAME COLUMN manus_message_id TO manus_task_id;

-- Update existing workflows to native type
UPDATE workflows SET type = 'native', is_public = TRUE
WHERE name IN ('research', 'summarize', 'newsletter');

-- Copy existing workflow descriptions to instruction field for native workflows
UPDATE workflows SET instruction = description WHERE name IN ('research', 'summarize', 'newsletter');

-- Indexes for new columns
CREATE INDEX idx_workflows_public ON workflows(is_public, is_active);
CREATE INDEX idx_workflows_type ON workflows(type);
CREATE INDEX idx_workflows_created_by ON workflows(created_by_user_id);
CREATE INDEX idx_email_mappings_task_id ON email_mappings(manus_task_id);

-- Approved senders table for private workflows
CREATE TABLE workflow_approved_senders (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  added_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(workflow_id, email)
);

CREATE INDEX idx_approved_senders_workflow ON workflow_approved_senders(workflow_id);
CREATE INDEX idx_approved_senders_email ON workflow_approved_senders(email);

-- Add password_hash to users for portal authentication
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
