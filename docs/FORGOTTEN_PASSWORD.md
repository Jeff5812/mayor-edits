# Forgotten passwords

The owner signs in with his email and a password, and nothing else is asked of him. If he forgets the password, there are two
ways back.

## 1. "Forgot your password" on the sign-in page

He enters his address and gets an email with a link to choose a new password. Supabase sends it with its built-in email, which
only delivers to addresses on the Supabase organization's team, at 2 emails an hour. So this works when his sign-in address is a
member there (Organization settings, Team). If the email does not come, the page tells him to ask his developer.

Keep "Enable custom SMTP" off (Authentication, Emails, SMTP Settings). Turned on without a working sender, it stops every
sign-in email.

## 2. The developer sets a temporary password

In the Supabase SQL Editor, with his address and a temporary password in place of the placeholders:

```sql
update auth.users
set encrypted_password = extensions.crypt('temporary-password-here', extensions.gen_salt('bf'))
where email = 'owner@example.com';
```

Give him the temporary password privately. He signs in with it, then chooses his own under Account, Change password, which
needs no email.

## Later, only if the email must always reach him

Supabase can send through an ordinary email account instead (Authentication, Emails, SMTP Settings). With Gmail, the sending
account needs 2-Step Verification and an app password from https://myaccount.google.com/apppasswords: host `smtp.gmail.com`,
port `465`, the Gmail address as username, and the app password as password. Changing that Gmail's password cancels the app
password.
