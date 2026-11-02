ALTER POLICY membership_read ON memberships USING (
 tenant_id::text = current_setting('app.tenant_id', true)
 AND user_id::text = current_setting('app.user_id', true)
 AND active
 AND EXISTS (SELECT 1 FROM users u WHERE u.id = memberships.user_id AND u.active)
);
