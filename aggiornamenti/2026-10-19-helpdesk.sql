-- Novaula · aggiornamento del 19/10/2026: sportello "Aiuto" (domande veloci in classe), bacheca FAQ,
-- immagini allegate alle domande e commenti dei compagni.
-- Incollare tutto nel SQL Editor di Supabase ed eseguire. Si può rieseguire: non crea doppioni.
-- Non dipende dagli altri aggiornamenti (serve solo setup.sql).

-- Domande allo sportello ----------------------------------------------------------
-- stato: nuova = in attesa del docente, arrivo = il docente sta arrivando,
--        sospesa = in sospeso (ne parliamo dopo), risolta = risolta
create table if not exists helpdesk (
  id          uuid primary key default gen_random_uuid(),
  class_id    text not null references classes on delete cascade,
  author      text not null check (char_length(author) between 2 and 40),
  body        text not null check (char_length(body) between 3 and 1000),
  tag         text not null default 'altro' check (tag in ('esercizio', 'pc', 'teoria', 'compiti', 'altro')),
  stuck       boolean not null default false,
  seat        text check (char_length(seat) <= 20),
  status      text not null default 'nuova' check (status in ('nuova', 'arrivo', 'sospesa', 'risolta')),
  answer      text check (char_length(answer) <= 2000),
  pinned      boolean not null default false,
  metoo       int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists helpdesk_class_time on helpdesk (class_id, created_at desc);
-- Screenshot o foto allegata alla domanda (percorso nel bucket "aiuto")
alter table helpdesk add column if not exists image_path text check (char_length(image_path) <= 300);

-- Commenti dei compagni (e del docente) sotto ogni domanda
create table if not exists helpdesk_replies (
  id          bigint generated always as identity primary key,
  ticket_id   uuid not null references helpdesk on delete cascade,
  class_id    text not null references classes on delete cascade,
  author      text not null check (char_length(author) between 2 and 40),
  body        text not null check (char_length(body) between 1 and 600),
  is_teacher  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists helpdesk_replies_ticket on helpdesk_replies (ticket_id, created_at);

-- Chiave segreta di chi ha fatto la domanda (solo l'hash): serve per ritirarla o segnarla risolta
create table if not exists helpdesk_keys (
  ticket_id uuid primary key references helpdesk on delete cascade,
  key_hash  text not null
);

create or replace function helpdesk_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists helpdesk_touch on helpdesk;
create trigger helpdesk_touch before update on helpdesk for each row execute function helpdesk_touch();

alter table helpdesk enable row level security;
alter table helpdesk_keys enable row level security;
alter table helpdesk_replies enable row level security;
grant select, insert on helpdesk_replies to anon, authenticated;
grant delete on helpdesk_replies to authenticated;
grant usage on all sequences in schema public to anon, authenticated;
drop policy if exists "helpdesk replies read" on helpdesk_replies;
drop policy if exists "helpdesk replies insert" on helpdesk_replies;
drop policy if exists "helpdesk replies delete" on helpdesk_replies;
create policy "helpdesk replies read" on helpdesk_replies for select using (true);
-- Si commenta solo una domanda della stessa classe; solo il docente scrive come docente
create policy "helpdesk replies insert" on helpdesk_replies for insert with check (
  (is_teacher = false or current_user_is_teacher())
  and exists (select 1 from helpdesk t where t.id = ticket_id and t.class_id = helpdesk_replies.class_id)
);
create policy "helpdesk replies delete" on helpdesk_replies for delete using (current_user_is_teacher());
grant select on helpdesk to anon, authenticated;
grant insert, update, delete on helpdesk to authenticated;
drop policy if exists "helpdesk read" on helpdesk;
drop policy if exists "helpdesk teacher" on helpdesk;
create policy "helpdesk read"    on helpdesk for select using (true);
create policy "helpdesk teacher" on helpdesk for all using (current_user_is_teacher()) with check (current_user_is_teacher());
-- helpdesk_keys: nessun permesso diretto, la usano solo le funzioni qui sotto

-- Lo studente fa una domanda (senza account): restituisce l'id della domanda
drop function if exists helpdesk_ask(text, text, text, text, boolean, text, text);
create or replace function helpdesk_ask(p_class text, p_author text, p_body text, p_tag text, p_stuck boolean, p_seat text, p_key text, p_image text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if char_length(coalesce(p_key, '')) < 16 then raise exception 'chiave non valida'; end if;
  if exists (select 1 from helpdesk where class_id = p_class and author = trim(p_author) and created_at > now() - interval '15 seconds') then
    raise exception 'Aspetta qualche secondo prima di fare un''altra domanda.';
  end if;
  if (select count(*) from helpdesk where class_id = p_class and author = trim(p_author) and status <> 'risolta') >= 5 then
    raise exception 'Hai già 5 domande aperte: segna come risolte quelle che non ti servono più.';
  end if;
  if p_image is not null and p_image !~ ('^' || p_class || '/[A-Za-z0-9_-]+\.(jpg|png)$') then raise exception 'immagine non valida'; end if;
  insert into helpdesk (class_id, author, body, tag, stuck, seat, image_path)
  values (p_class, trim(p_author), trim(p_body), coalesce(p_tag, 'altro'), coalesce(p_stuck, false), nullif(trim(coalesce(p_seat, '')), ''), p_image)
  returning id into new_id;
  insert into helpdesk_keys values (new_id, md5(p_key));
  return new_id;
end $$;

-- Lo studente segna la sua domanda come risolta ("ho risolto da solo")
create or replace function helpdesk_resolve_own(p_id uuid, p_key text) returns void
language sql security definer set search_path = public as $$
  update helpdesk set status = 'risolta'
  where id = p_id and exists (select 1 from helpdesk_keys k where k.ticket_id = p_id and k.key_hash = md5(p_key));
$$;

-- Lo studente ritira la sua domanda (solo se il docente non ha ancora risposto)
create or replace function helpdesk_withdraw(p_id uuid, p_key text) returns void
language sql security definer set search_path = public as $$
  delete from helpdesk
  where id = p_id and answer is null and not pinned
    and exists (select 1 from helpdesk_keys k where k.ticket_id = p_id and k.key_hash = md5(p_key));
$$;

-- "Anch'io": un compagno ha lo stesso dubbio
create or replace function helpdesk_metoo(p_id uuid, p_delta int) returns void
language sql security definer set search_path = public as $$
  update helpdesk set metoo = greatest(0, metoo + sign(p_delta)::int) where id = p_id and status <> 'risolta';
$$;

revoke all on function helpdesk_ask(text, text, text, text, boolean, text, text, text) from public;
revoke all on function helpdesk_resolve_own(uuid, text) from public;
revoke all on function helpdesk_withdraw(uuid, text) from public;
revoke all on function helpdesk_metoo(uuid, int) from public;
grant execute on function helpdesk_ask(text, text, text, text, boolean, text, text, text) to anon, authenticated;
grant execute on function helpdesk_resolve_own(uuid, text) to anon, authenticated;
grant execute on function helpdesk_withdraw(uuid, text) to anon, authenticated;
grant execute on function helpdesk_metoo(uuid, int) to anon, authenticated;

-- Aggiornamenti in tempo reale sulla LIM e sui telefoni
do $$ begin
  alter publication supabase_realtime add table helpdesk;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table helpdesk_replies;
exception when duplicate_object then null; end $$;

-- Immagini delle domande: bucket pubblico in lettura, solo immagini fino a 5 MB ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('aiuto', 'aiuto', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png'];
drop policy if exists "aiuto upload" on storage.objects;
drop policy if exists "aiuto teacher delete" on storage.objects;
create policy "aiuto upload" on storage.objects for insert
  with check (bucket_id = 'aiuto');
create policy "aiuto teacher delete" on storage.objects for delete
  using (bucket_id = 'aiuto' and current_user_is_teacher());
