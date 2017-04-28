ALTER TABLE subreddits
FOREIGN KEY (moderatorId) REFERENCES users (id) ON DELETE SET NULL;

ALTER TABLE subreddits ADD CONSTRAINT fk_moderator_id FOREIGN KEY (moderatorId) REFERENCES users(id);
