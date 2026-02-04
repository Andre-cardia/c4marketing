-- Create notices table for Mural de Avisos (Notice Board)
CREATE TABLE IF NOT EXISTS notices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message TEXT NOT NULL,
  author_email TEXT NOT NULL,
  author_name TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('normal', 'importante', 'urgente')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for performance (newest first)
CREATE INDEX IF NOT EXISTS idx_notices_created_at ON notices(created_at DESC);

-- Enable Row Level Security
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read notices
DROP POLICY IF EXISTS "Authenticated users can read notices" ON notices;
CREATE POLICY "Authenticated users can read notices"
ON notices FOR SELECT
TO authenticated
USING (true);

-- Policy: Only gestores can create notices
DROP POLICY IF EXISTS "Gestores can create notices" ON notices;
CREATE POLICY "Gestores can create notices"
ON notices FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM app_users
    WHERE email = author_email
    AND role = 'gestor'
  )
);

-- Policy: Only gestores can delete notices
DROP POLICY IF EXISTS "Gestores can delete notices" ON notices;
CREATE POLICY "Gestores can delete notices"
ON notices FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM app_users
    WHERE email = (SELECT auth.jwt() ->> 'email')
    AND role = 'gestor'
  )
);

-- Grant permissions
GRANT SELECT ON notices TO authenticated;
GRANT INSERT ON notices TO authenticated;
GRANT DELETE ON notices TO authenticated;
