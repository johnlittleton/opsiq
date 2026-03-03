-- Update existing executives in Railway with correct roles
-- Run this in Railway's PostgreSQL console (Database tab > Query)

-- Update executives to have 'executive' role
UPDATE executives SET role = 'executive' WHERE name IN (
  'John Littleton',
  'Ryan Pease',
  'Austin Carlock',
  'John Carlock',
  'Branden Slingshot',
  'Austin Slingshot',
  'John Slingshot',
  'Pat Slingshot'
);

-- Update managers to have 'manager' role (if they exist)
UPDATE executives SET role = 'manager' WHERE name IN (
  'NJ Ship Receive',
  'Sal',
  'Jacob',
  'Ernie'
);

-- Add missing managers if they don't exist
INSERT INTO executives (name, pin, role, is_active)
SELECT 'NJ Ship Receive', '82147', 'manager', true
WHERE NOT EXISTS (SELECT 1 FROM executives WHERE pin = '82147');

INSERT INTO executives (name, pin, role, is_active)
SELECT 'Sal', '75938', 'manager', true
WHERE NOT EXISTS (SELECT 1 FROM executives WHERE pin = '75938');

INSERT INTO executives (name, pin, role, is_active)
SELECT 'Jacob', '84629', 'manager', true
WHERE NOT EXISTS (SELECT 1 FROM executives WHERE pin = '84629');

INSERT INTO executives (name, pin, role, is_active)
SELECT 'Ernie', '91374', 'manager', true
WHERE NOT EXISTS (SELECT 1 FROM executives WHERE pin = '91374');

-- Verify the update
SELECT id, name, pin, role, is_active 
FROM executives 
ORDER BY role DESC, name;
