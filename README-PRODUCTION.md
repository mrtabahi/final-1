# Decoding HCM Typing Lab — Account/Folders Edition

## Candidate flow
1. Candidate creates an account with **name + email + mobile + password only**.
2. Email confirmation must be completed.
3. Candidate signs in and completes SMS OTP verification.
4. Candidate sees the Typing Test Menu grouped into admin-created folders.
5. Candidate clicks **Attempt**; no candidate-name or roll-number field is shown. The verified profile name is stored automatically.
6. Candidate can edit name/email from My Account and change password. Phone changes require OTP.
7. Forgot Password supports email reset links and a phone OTP reset flow.

## Supabase settings required
- Enable Email provider.
- Turn on email confirmations if you want mandatory email verification.
- Enable Phone provider + SMS OTP (Twilio or another supported provider).
- Set the Site URL to your deployed site and allow `/login.html` and `/reset.html` redirect URLs.
- Run `supabase/schema.sql` + `supabase/rls.sql` on a fresh database.
- Existing database: run `supabase/migration_account_folders.sql`, then `supabase/rls.sql`, after taking a backup.
- Create a candidate account, then set that profile's role to `admin` in Supabase SQL Editor for the first administrator.

## Important security note
The browser is not a trusted execution environment. RLS now blocks cross-user history and anonymous attempts, but a truly tamper-resistant exam score should be calculated/validated server-side (Edge Function/RPC) before treating results as authoritative.
