ALTER TABLE match_tickets
  DROP CONSTRAINT IF EXISTS match_tickets_match_id_seat_key;

CREATE INDEX IF NOT EXISTS idx_match_tickets_match_seat_expiry
  ON match_tickets (match_id, seat, expires_at)
  WHERE revoked = FALSE;
