-- Velnq 002: playlists & albums ("collections"), ordered tracks, publish-aware access. Run after 001.
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('playlist','album')),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  release_year smallint check (release_year between 1900 and 2100),
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint year_only_for_albums check (kind = 'album' or release_year is null)
);
create table if not exists public.collection_tracks (
  collection_id uuid not null references public.collections(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  position integer not null check (position >= 0),
  primary key (collection_id, track_id)   -- a track appears once per collection; the same file can be in many collections
);
create index if not exists collections_published_idx on public.collections (published_at desc) where is_published;
create index if not exists collections_owner_idx on public.collections (owner_id);
create index if not exists collection_tracks_track_idx on public.collection_tracks (track_id);
drop trigger if exists collections_touch on public.collections;
create trigger collections_touch before update on public.collections for each row execute function public.touch_updated_at();

alter table public.collections enable row level security;
alter table public.collection_tracks enable row level security;
revoke all on public.collections, public.collection_tracks from anon, authenticated;
grant select on public.collections, public.collection_tracks to anon;
grant select, insert, update, delete on public.collections to authenticated;
grant select, insert, delete on public.collection_tracks to authenticated;

drop policy if exists "collections: public read published" on public.collections;
drop policy if exists "collections: owner read" on public.collections;
drop policy if exists "collections: owner insert" on public.collections;
drop policy if exists "collections: owner update" on public.collections;
drop policy if exists "collections: owner delete" on public.collections;
create policy "collections: public read published" on public.collections for select to anon, authenticated using (is_published);
create policy "collections: owner read" on public.collections for select to authenticated using (owner_id = (select auth.uid()));
create policy "collections: owner insert" on public.collections for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "collections: owner update" on public.collections for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "collections: owner delete" on public.collections for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "ct: public read published" on public.collection_tracks;
drop policy if exists "ct: owner read" on public.collection_tracks;
drop policy if exists "ct: owner insert" on public.collection_tracks;
drop policy if exists "ct: owner delete" on public.collection_tracks;
create policy "ct: public read published" on public.collection_tracks for select to anon, authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.is_published));
create policy "ct: owner read" on public.collection_tracks for select to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = (select auth.uid())));
-- owners may only add their own tracks to their own collections
create policy "ct: owner insert" on public.collection_tracks for insert to authenticated
  with check (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = (select auth.uid()))
          and exists (select 1 from public.tracks t where t.id = track_id and t.owner_id = (select auth.uid())));
create policy "ct: owner delete" on public.collection_tracks for delete to authenticated
  using (exists (select 1 from public.collections c where c.id = collection_id and c.owner_id = (select auth.uid())));

-- Tracks inside a published collection become publicly readable (and un-readable again when it is unpublished).
drop policy if exists "tracks: readable via published collection" on public.tracks;
create policy "tracks: readable via published collection" on public.tracks for select to anon, authenticated
  using (exists (select 1 from public.collection_tracks ct join public.collections c on c.id = ct.collection_id
                 where ct.track_id = tracks.id and c.is_published));

-- Audio files: readable by anyone exactly when the caller can read the matching tracks row (RLS applies inside this subquery).
drop policy if exists "audio: public read published" on storage.objects;
create policy "audio: public read published" on storage.objects for select to anon, authenticated
  using (bucket_id = 'audio' and exists (select 1 from public.tracks t where t.audio_path = objects.name));

-- Atomically replace a collection's ordered track list (runs with the caller's RLS).
create or replace function public.set_collection_tracks(p_collection uuid, p_tracks uuid[]) returns void
language plpgsql security invoker set search_path = public as $$
begin
  delete from public.collection_tracks where collection_id = p_collection;
  insert into public.collection_tracks (collection_id, track_id, position)
  select p_collection, u.t, (u.o - 1)::int from unnest(p_tracks) with ordinality as u(t, o);
  update public.collections set updated_at = now() where id = p_collection;
end $$;
revoke all on function public.set_collection_tracks(uuid, uuid[]) from public, anon;
grant execute on function public.set_collection_tracks(uuid, uuid[]) to authenticated;
