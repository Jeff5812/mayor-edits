# Forgotten password

The site has one owner. He signs in with his email and a password, and nothing else is asked of him. If he forgets the
password, the sign-in page tells him to ask his developer, and the developer resets it.

## Resetting it

In the Supabase SQL Editor, with his address and a temporary password in place of the placeholders:

```sql
update auth.users
set encrypted_password = extensions.crypt('temporary-password-here', extensions.gen_salt('bf'))
where email = 'owner@example.com';
```

Give him the temporary password privately. He signs in with it, then chooses his own under Account, Change password.

Keep "Enable custom SMTP" off in Supabase (Authentication, Emails, SMTP Settings). Turned on without a working sender, it stops
every sign-in email Supabase sends.
