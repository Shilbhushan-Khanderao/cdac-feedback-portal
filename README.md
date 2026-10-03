# C-DAC Module Feedback Portal

Students give module feedback from their phones. Course coordinators schedule feedback per module and download PDF/CSV reports. It replaces the CSV-upload flow of [pie-generator-app](../pie-generator-app).

- **Students** sign in with Google, see pending feedback for their batch and submit an anonymous form.
- **Course coordinators** (one per centre/ATC, optionally per course) create sessions, share the link, track who has not submitted yet, and download reports with pie charts, comments and sentiment analysis.
- **Admins** manage courses, centres (C-DAC centre + ATCs), batches, staff, faculty, modules and the question template.

Hosting: GitHub Pages (static) + Supabase free tier. No VM.

## Local development

Requires Node 22 and Docker.

```bash
npm install
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime,storage-api
cp .env.example .env.local   # paste ANON_KEY from `npx supabase status`
npm run dev                  # http://localhost:5173, use the dev login with *@test.local users
npm test && npm run test:db
```

## Production setup (one time)

1. **Supabase project**: create a free project (region Mumbai). Then link it and apply the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
2. **First admin and faculty**: in the Supabase SQL editor, run:
   ```sql
   insert into staff_roster (email, full_name, role) values ('you@gmail.com', 'Your Name', 'admin');
   ```
   Then run `supabase/private/faculty.sql`. That file is gitignored so real names stay out of this public repo. You can also add faculty under **Setup > Faculty**.
3. **Google sign-in**:
   - In Google Cloud Console, create an OAuth client of type *Web application*.
   - Set its authorized redirect URI to `https://<ref>.supabase.co/auth/v1/callback`.
   - In Supabase, go to **Authentication > Providers > Google** and paste the client ID and secret.
4. **Roster gate**: in Supabase, go to **Authentication > Hooks > Before User Created**. Choose Postgres function `public.hook_restrict_signup_to_roster`.
5. **Redirect URLs**: in Supabase, go to **Authentication > URL Configuration**. Set Site URL to `https://<github-user>.github.io/cdac-feedback-portal/`.
6. **GitHub**:
   - Add repo secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   - In **Settings > Pages**, set Source to *GitHub Actions*.
   - Push to `master` to deploy.

`keepalive.yml` pings the database every 2 days. Without it, a free project pauses after 7 idle days.

## Day-to-day

1. Admin adds centres (C-DAC centre + ATCs) and CCs under **Setup**. Admin also creates each batch once (e.g. `Aug 2026`); every centre and course shares it.
2. Each CC uploads their students under **Students**: pick batch and course (centre is fixed to theirs). The CSV has columns `prn,name,email`, and each email must be the student's Google account.
3. CC creates a session under **Sessions > New session**: batch, course, module, faculty, dates. If a faculty member is missing, type the name and click **Add faculty**. Admin can tick several centres to create one session per centre.
4. CC uses **Copy student link** and shares the link on the batch group. Only students of that centre, course and batch can open and submit it.
5. When the session closes, CC uses **Download PDF**.
