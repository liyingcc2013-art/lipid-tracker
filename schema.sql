-- Supabase Database Schema

CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nric TEXT UNIQUE NOT NULL,
  name TEXT,
  dob_or_age TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  test_date DATE,
  metrics JSONB,
  file_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS) on both tables
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;

-- Strict default deny policies for anon / public access
-- Since all backend operations use service_role (which bypasses RLS), denying public/anon ensures client/public key cannot access medical data directly.
CREATE POLICY "Deny public access to patients"
  ON patients
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Deny public access to lab_results"
  ON lab_results
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
