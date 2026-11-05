# HOTEL SECURITY PATROL SYSTEM

Separate Patrol application under `/patrol/` in the existing Contactor-visitor repository. It does not overwrite the Contractor Registration app.

## Current scope
- QR scan per physical patrol point
- 3-hour patrol cycle is the operating target (schedule enforcement / missed-cycle alerts are a next phase)
- Security guard and Security admin roles
- Daily report and CSV export
- Photo evidence in a private Supabase Storage bucket
- PWA manifest

## Setup
1. In Supabase SQL Editor, run `supabase/schema.sql`.
2. Create Auth users in Supabase Authentication.
3. Insert matching rows in `public.patrol_profiles`; set trusted supervisors to role `admin`, guards to `guard`.
4. Deploy GitHub Pages from the repository's existing Pages configuration. Open `/patrol/`.
5. Enter the Supabase project URL and anon/publishable key in the app. Never use service_role in browser code.
6. Generate/print QR labels from each row's `qr_token` as `PATROL:<uuid>` and attach them at the matching physical location.

## Notes
- Seed data currently includes 45 unique locations from the provided list. Confirm exact count and whether Capsule corridor checkpoints should be separate from pump-room checkpoints before printing QR labels.
- Every 3-hour cycle is currently an operational setting; automatic shift-window compliance and missed-patrol alerts are not yet enabled.
- The frontend requires Supabase URL/key and valid Auth profiles before it can sign in.
