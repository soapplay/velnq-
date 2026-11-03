-- Velnq 001: tracks table, private "audio" bucket, RLS and storage policies.
-- Run once in Supabase Dashboard > SQL Editor.
create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  file_name text not null,
  audio_path text not null unique,
  mime_type text,
  size_bytes bigint not null check (size_bytes > 0),
  duration_s real,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  -- a row can only point at a file inside its owner's folder
  constraint audio_path_in_owner_folder check (split_part(audio_path, '/', 1) = owner_id::text)
);
create index if not exists tracks_published_idx on public.tracks (published_at desc) where is_published;

alter table public.tracks enable row level security;
revoke all on public.tracks from anon, authenticated;
grant select on public.tracks to anon;
grant select, insert, update, delete on public.tracks to authenticated;

drop policy if exists "tracks: public read published" on public.tracks;
drop policy if exists "tracks: owner read" on public.tracks;
drop policy if exists "tracks: owner insert" on public.tracks;
drop policy if exists "tracks: owner update" on public.tracks;
drop policy if exists "tracks: owner delete" on public.tracks;
create policy "tracks: public read published" on public.tracks for select to anon, authenticated using (is_published);
create policy "tracks: owner read" on public.tracks for select to authenticated using (owner_id = (select auth.uid()));
create policy "tracks: owner insert" on public.tracks for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "tracks: owner update" on public.tracks for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "tracks: owner delete" on public.tracks for delete to authenticated using (owner_id = (select auth.uid()));

-- Private bucket, 50 MB per file, audio types only. Files are streamed through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', false, 52428800, array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/wav','audio/x-wav','audio/ogg','audio/opus','audio/flac','audio/x-flac','audio/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "audio: owner read" on storage.objects;
drop policy if exists "audio: owner upload" on storage.objects;
drop policy if exists "audio: owner update" on storage.objects;
drop policy if exists "audio: owner delete" on storage.objects;
drop policy if exists "audio: public read published" on storage.objects;
create policy "audio: owner read" on storage.objects for select to authenticated using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "audio: owner upload" on storage.objects for insert to authenticated with check (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "audio: owner update" on storage.objects for update to authenticated using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "audio: owner delete" on storage.objects for delete to authenticated using (bucket_id = 'audio' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Anyone (no account) may read a file only while a published track points at it.
create policy "audio: public read published" on storage.objects for select to anon, authenticated
  using (bucket_id = 'audio' and exists (select 1 from public.tracks t where t.audio_path = objects.name and t.is_published));
