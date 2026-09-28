CREATE TABLE chat_conversations(id text PRIMARY KEY,kind text NOT NULL CHECK(kind IN('group','direct')),user_a text REFERENCES users(id),user_b text REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),CHECK((kind='group' AND user_a IS NULL AND user_b IS NULL) OR (kind='direct' AND user_a IS NOT NULL AND user_b IS NOT NULL AND user_a<user_b)),UNIQUE(user_a,user_b));
CREATE UNIQUE INDEX chat_one_department_group ON chat_conversations(kind) WHERE kind='group';
INSERT INTO chat_conversations(id,kind) VALUES('department','group');
CREATE TABLE chat_messages(id text PRIMARY KEY,conversation_id text NOT NULL REFERENCES chat_conversations(id),sender_id text NOT NULL REFERENCES users(id),text text NOT NULL CHECK(char_length(text)>0 AND char_length(text)<=4000),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE INDEX chat_message_window ON chat_messages(conversation_id,created_at DESC,id DESC);
