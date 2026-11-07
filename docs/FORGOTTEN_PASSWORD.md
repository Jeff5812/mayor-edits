# Forgotten password

The owner resets it himself: "Forgot your password?" on the sign-in page emails him a link, and the link opens the page for
choosing a new one. Nobody else has to be around.

## The sender, set up once by the developer

Supabase sends that email, but its built-in sender only delivers to members of the Supabase team. So it sends through a Gmail
account instead. It can be any Gmail the developer controls; the owner is not involved, and the email still goes to his own
sign-in address.

1. On that Google account, turn on 2-Step Verification, then create an app password at
   https://myaccount.google.com/apppasswords. Google shows 16 letters once.
2. In Supabase, Authentication, Emails, SMTP Settings, turn on custom SMTP: sender email and username are the Gmail address,
   sender name `Mayor Edits`, host `smtp.gmail.com`, port `465`, password the 16 letters without spaces. Save.

Changing that Gmail's normal password cancels the app password, and the emails stop until a new one is made. If an email does not
arrive, Supabase's Auth logs say why.

## Last resort

If the email cannot be sent, the developer can set a temporary password in the Supabase SQL Editor, and the owner then chooses
his own under Account, Change password:

```sql
update auth.users
set encrypted_password = extensions.crypt('temporary-password-here', extensions.gen_salt('bf'))
where email = 'owner@example.com';
```
