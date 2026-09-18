-- Apply to an existing Decoding HCM database.
ALTER TABLE tests ADD COLUMN IF NOT EXISTS target_wpm NUMERIC(6,2) DEFAULT 35;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS min_accuracy NUMERIC(5,2);
ALTER TABLE tests ADD COLUMN IF NOT EXISTS free_error_pct NUMERIC(5,4) DEFAULT 0.05;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS penalty_per_error INT DEFAULT 10;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS allow_backspace BOOLEAN DEFAULT false;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS leaderboard_enabled BOOLEAN DEFAULT true;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS typed_content TEXT;
ALTER TABLE attempts ADD COLUMN IF NOT EXISTS result_snapshot JSONB;
UPDATE tests SET target_wpm = COALESCE(target_wpm, 35), free_error_pct = COALESCE(free_error_pct, 0.05), penalty_per_error = COALESCE(penalty_per_error, 10);
