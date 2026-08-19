ALTER TABLE match_tickets
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_match_tickets_consumed
  ON match_tickets (ticket_hash, consumed_at)
  WHERE consumed_at IS NOT NULL;
