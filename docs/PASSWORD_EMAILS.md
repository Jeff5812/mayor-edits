# Password emails

The owner chooses a new password from the sign-in page: "Forgot your password, or never set one?" sends a link, and the link
opens the page for choosing one. Supabase sends that email, and its built-in sender only delivers to members of the Supabase
project's team, at 2 emails an hour. So the site needs its own sender. These steps take about ten minutes, and they need two
logins that only people can do: the Google account that sends, and the Supabase dashboard.

## 1. An app password for the sending Gmail

Use the studio's contact address, the one shown on the site. It belongs to the studio, and it is not the owner's sign-in
address, so the email never goes from an account to itself.

1. Signed in to that Google account, turn on 2-Step Verification (Google Account, Security).
2. Open https://myaccount.google.com/apppasswords, name it `Supabase`, and copy the 16 letters it shows.
3. Give them only to whoever does step 2 below, and never in a group chat. The same page removes the password at any time.

## 2. Supabase: the sender

Open https://supabase.com/dashboard/project/_/auth/smtp, turn on custom SMTP, and fill in:

| Field | Value |
|---|---|
| Sender email | the Gmail address |
| Sender name | `Mayor Edits` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | the Gmail address |
| Password | the 16 letters, without spaces |

Save. Emails now reach any address, up to 30 an hour (https://supabase.com/dashboard/project/_/auth/rate-limits).

## 3. Supabase: where links go

At https://supabase.com/dashboard/project/_/auth/url-configuration:

- Site URL: `https://mayor-edits.vercel.app`
- Redirect URLs: `https://mayor-edits.vercel.app/**` and `http://localhost:3000/**`

If a link still arrives at the plain site address, the site passes it on to the right page by itself.

## 4. Supabase: the email itself

At https://supabase.com/dashboard/project/_/auth/templates, open "Reset password".

Subject:

```text
Choose a new password for Mayor Edits
```

Body:

```html
<div style="margin:0;padding:32px 16px;background-color:#0b0c0f;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px;background-color:#15171c;border:1px solid #2a2e34;border-radius:16px;">
    <p style="margin:0 0 28px;color:#ff7a3d;font-size:13px;font-weight:bold;letter-spacing:3px;text-transform:uppercase;">Mayor Edits</p>
    <h1 style="margin:0 0 16px;color:#ffffff;font-size:24px;line-height:30px;">Choose a new password</h1>
    <p style="margin:0 0 28px;color:#bcbfc6;font-size:16px;line-height:24px;">Someone asked to reset the owner sign-in for Mayor Edits. If that was you, press the button. The link works once.</p>
    <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 28px;border-radius:999px;background-color:#ff7a3d;color:#0b0c0f;font-size:16px;font-weight:bold;text-decoration:none;">Choose a new password</a>
    <p style="margin:28px 0 0;color:#8e929a;font-size:13px;line-height:20px;">If you did not ask for this, ignore this email. Your password stays as it is.</p>
  </div>
</div>
```

"Invite user" can use the same body with the heading "You're invited to Mayor Edits" and the button "Choose your password".

## 5. Test it

On https://mayor-edits.vercel.app/admin/login, choose "Forgot your password, or never set one?" and enter the owner's address.
The email should arrive from Mayor Edits within a minute, and its button should open "Choose your password". If nothing arrives,
check the spam folder, then Supabase's Auth logs. An email app that opens links to scan them can use the link up first: the page
then says so and offers a new one.

## If the owner is locked out before this works

1. Supabase, Authentication, Users: delete the owner's user. Projects and videos are not tied to it; only its admin row is.
2. Add user, Create new user: the same address, a temporary password, "Auto Confirm User" ticked.
3. In the SQL Editor, with the owner's address in place of the placeholder:

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'owner@example.com';
   ```

4. The owner signs in and chooses their own password under Account, Change password, which needs no email.
