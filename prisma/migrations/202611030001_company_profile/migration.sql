-- Optional company identity and contact details; existing tenants remain unchanged.
ALTER TABLE tenants ADD COLUMN profile jsonb;
