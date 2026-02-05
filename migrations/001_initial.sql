CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    credits INTEGER DEFAULT 0 CHECK (credits >= 0),
    is_approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE workflows (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    manus_address VARCHAR(255) NOT NULL,
    description TEXT,
    credits_per_task INTEGER DEFAULT 10,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE email_mappings (
    id SERIAL PRIMARY KEY,
    original_message_id VARCHAR(255),
    original_sender VARCHAR(255) NOT NULL,
    workflow VARCHAR(100) NOT NULL,
    manus_message_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
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

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_email_mappings_message_id ON email_mappings(original_message_id);
CREATE INDEX idx_email_mappings_sender ON email_mappings(original_sender);
CREATE INDEX idx_email_mappings_status ON email_mappings(status);
CREATE INDEX idx_workflows_name ON workflows(name);
