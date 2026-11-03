# Velnq

A local music player (plain HTML/CSS/JS, no build step) with optional public sharing of tracks, playlists and albums through Supabase. Local playback works with no setup. **The sharing features have not yet been tested against a real Supabase project.**

## Project layout
```
index.html  style.css  script.js      the app (entry point: index.html)
config.js                             your Supabase URL + anon key (template; empty by default)
supabase/migrations/001_init.sql      tracks table, private "audio" bucket, base policies
supabase/migrations/002_collections.sql  playlists & albums, ordering, publish-aware policies
tests/smoke.test.js                   mocked logic tests (no network), including online search
tests/live-check.mjs                  REAL backend check (needs your project)
```
Requirements: a free Supabase account, any static host (Netlify drag-and-drop works), Node 18+ only if you run the tests.

## Setup (in this order)
1. Create a Supabase project.
2. SQL Editor: run `001_init.sql`, then `002_collections.sql`. Both are safe to re-run.
3. Project Settings > API: copy the **Project URL** and the **anon / publishable** key into `config.js`. The anon key is meant to be public; RLS limits it. **Never** put the `service_role` / secret key in any frontend file. There is no `.env` because there is no build step.
4. Authentication > Providers > Email: for personal use, turn off "Confirm email" (otherwise confirm via the emailed link; set Authentication > URL Configuration > Site URL to your deployed address).
5. Run `node tests/live-check.mjs` (see Testing) before deploying if you can.
6. Deploy: drag the whole folder to https://app.netlify.com/drop (no build command; publish directory = the folder root).
7. Open the site > **Published** > **Create account**. Then in Supabase Authentication settings turn **off** "Allow new users to sign up", so nobody else can use your free storage.

## Search online (play songs from an API)
**Search online** in the sidebar looks songs up through Apple's public iTunes Search API. It needs **no key, no account and no setup**; it works as soon as the site is open. Each result plays a **30-second preview** straight from Apple, with cover art and a link to the song on Apple Music. Results can be queued and played in order like any other track. They are not saved: they are not added to your Library, Favourites or Playlists, and they disappear on refresh.

- Only previews are available. Apple does not provide full songs through this API, and no free API provides full-length popular music. For full-length listening, upload files you own (Library / Published).
- Apple limits searches to roughly 20 a minute per connection. If you hit it, the app says so; wait a minute.
- Keep Apple's attribution on the page (it is already there) and read their terms before using this on a public or commercial site: https://www.apple.com/legal/internet-services/itunes/
- The words typed into the search box are sent to Apple. The Guide page says so.
- If the browser blocks the direct request (CORS), the app retries once using Apple's documented JSONP `callback` option.
- **Unverified here:** the logic is covered by mocked tests and a headless-browser run with a fake Apple response, but this was built without internet access, so it has not been run against Apple's live service. Search once in a real browser after deploying.

## Discover (Dark Violet & Slate redesign)
Discover is built on Apple's iTunes Search API (no key) and the existing player/queue. Sections: welcome, featured, "Selected for discovery", six moods, nine genres, artist spotlight, new releases, hidden gems, plus "Shared on Velnq" (published Supabase content) when `config.js` is filled in.
- Everything is real search data. Moods and genres are **keyword searches** (approximate), "Selected for discovery" rotates a seed term daily (not personalised), "New releases" are the newest release dates found in two searches (not an official list), "Hidden gems" samples less mainstream genre terms (Apple gives no popularity data), and the artist spotlight uses artwork from the artist's releases (no bios or photos exist in the API).
- Only songs with a 30-second preview are shown. Previews can be queued but not favourited: Favourites remain local-library only.
- Requests are cached 10 minutes and de-duplicated; opening Discover makes about 4 requests (Apple allows roughly 20/min).
- Colours are CSS variables at the top of `style.css`.
- `python3 tests/browser-check.py` (needs Playwright + Chromium) runs a real-browser check with *mocked* Apple/audio responses.

## Using it
- **Published > Upload tracks**, or the upload icon on a Library track, sends audio to the private bucket (percentage progress).
- **New playlist / New album**: title, description, album year, add tracks from your uploads, reorder with ↑ ↓. Saved as a private draft; empty drafts are allowed; publishing needs one track.
- **Publish** makes it public and copies `https://your-site/?c=<id>`. Anyone can open that link with no account and press **Play all**. **Unpublish** or delete stops the link working. Single tracks use `?t=<id>`.

## Testing
- `node tests/smoke.test.js`: **mocked** logic and a text lint of the SQL. It proves app logic (ordering, validation, queue, retry, local vs remote playback). It does **not** prove the database, RLS, storage, real playback or layout.
- `VELNQ_EMAIL=... VELNQ_PASSWORD=... node tests/live-check.mjs`: **real** backend check. Uploads two tiny WAVs, builds a playlist, and verifies what an anonymous visitor can/cannot read, stream, edit or upload, before and after publishing and unpublishing. It cleans up after itself. It does not test a second user account or a browser.
- Manual browser checks are still required: open a published link in a private window and on a phone, play every track, let one end, refresh, unpublish and reload.

## Security notes
- The bucket is private. Audio is only streamed through short-lived signed URLs, and storage rules allow anonymous reads only while the file belongs to a published track or collection. Never switch the bucket to public.
- Published collections expose their tracks' metadata (title, file name, size, storage path, owner id).
- A signed URL already handed out stays valid until it expires (6 hours), even after you unpublish. Treat published music as public.
- Uploading and publishing need a signed-in owner; visitors can only read published content.

## Limits and known gaps
- Free-tier figures vary by source (file storage 500 MB to 1 GB, about 5 GB egress a month, 50 MB per file, projects pause after a week idle); check supabase.com/pricing. A paused project makes public links fail.
- A closed tab between file upload and saving details can leave an unreferenced private file; remove it in the Supabase dashboard.
- Custom cover uploads and drag-to-reorder are not built. The track picker lists uploaded tracks, not your local Library.
- Raw-body uploads and signed-URL streaming follow Supabase's documented behaviour but are unverified here. If uploads fail, the toast shows Supabase's message; send it to me.

## Discover (redesign)
Discover now works **without Supabase**: it uses Apple's iTunes Search API (30-second previews, no key) through the same `itunes()` code as Search online, and plays/queues through the same player and queue.
- **Featured, Selected for discovery, Artist spotlight** come from one daily search (the term is shown on the page). It is *not* a personal recommendation system and is labelled that way.
- **Moods and genres** run keyword searches (the term is shown). Matches are approximate. Results open in a results view with a Back button.
- **Explore artist** uses Apple's lookup endpoint, falling back to a name search.
- **New releases**: merges two searches and sorts by release date (dates shown). Not an official list.
- **Hidden gems**: samples searches for less mainstream genres ("Try another" picks the next). No popularity data exists, so nothing is claimed to be underrated.
- **Shared on Velnq**: the original Supabase-published playlists/albums/tracks, kept at the bottom of Discover when `config.js` is filled in.
- Favourites remain library-only (existing behaviour), so Discover cards have no heart. Apple provides no artist photos or biographies, so none are shown.
- Requests are cached for 10 minutes and shared while in flight. Discover load makes about 4 Apple requests (limit is roughly 20 a minute).
- Design tokens are CSS variables at the top of `style.css`.

Extra test: `python3 tests/browser/discover.py` (needs Python Playwright + Chromium). It drives a real headless browser against this folder with **mocked** Apple/audio responses.
