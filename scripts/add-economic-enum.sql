-- ALTER TYPE persona_type ADD VALUE IF NOT EXISTS 'economic';
-- Run this SQL in your Supabase SQL Editor

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'economic' AND enumtypid = 'persona_type'::regtype) THEN
        ALTER TYPE persona_type ADD VALUE 'economic';
    END IF;
END $$;
