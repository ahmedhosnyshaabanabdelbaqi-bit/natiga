UPDATE users SET username=lower(trim(username));
CREATE UNIQUE INDEX users_username_case_insensitive ON users(lower(username));
