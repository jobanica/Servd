# Branded auth emails (Servd)

Supabase sends the **signup confirmation email**, so its look is configured in
the Supabase dashboard — not in app code. This folder holds the branded HTML to
paste in.

## Apply the confirmation template

1. Supabase Dashboard → **Authentication → Emails** (Email Templates).
2. Select **"Confirm signup"**.
3. Paste the contents of [`confirm-signup.html`](./confirm-signup.html) into the
   message body and **Save**. It already uses Supabase's `{{ .ConfirmationURL }}`
   variable, so the confirm button works as-is.
4. (Optional) Set the **Subject** to something like:
   `Confirm your email · Servd`

> The same branded layout can be reused for the other templates ("Magic Link",
> "Reset password", "Change email") — just swap the heading/body copy and keep
> the relevant variable (`{{ .ConfirmationURL }}` / `{{ .Token }}`).

## Make the email come "from" your brand (sender name)

By default Supabase emails come from its shared mail server. To send from your
own brand/domain:

1. Supabase Dashboard → **Project Settings → Authentication → SMTP Settings**.
2. Enable **Custom SMTP** and enter your provider's details (e.g. Resend,
   Postmark, SendGrid, Amazon SES).
3. Set **Sender name** to `Servd` and **Sender email** to an address on your
   verified domain (e.g. `no-reply@servd.app`).
4. Save. New confirmation emails now arrive branded and from your domain (and
   are far less likely to land in spam than the default shared sender).

## Notes

- The confirm link redirects to `${NEXT_PUBLIC_APP_URL}/login` (set in the
  signup action), so after confirming, owners land on the login page.
- Custom SMTP also raises Supabase's low default rate limit on auth emails,
  which matters once you have real signup volume.
