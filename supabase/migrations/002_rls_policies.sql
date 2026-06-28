ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrowers ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by Go API)
-- Dashboard admin reads all (authenticated Supabase user)
CREATE POLICY "admin_read_all_loans" ON loans FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "admin_read_all_borrowers" ON borrowers FOR SELECT
    USING (auth.role() = 'authenticated');

-- Public: no direct table access (all writes go through Go API with service role)
