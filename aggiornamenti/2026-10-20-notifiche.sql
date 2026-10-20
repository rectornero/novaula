-- Novaula 2.x · Notifiche sul telefono (Web Push, gratis, nessun servizio esterno)
-- Gli studenti ricevono un avviso per un nuovo voto visibile, un "Da rifare", un nuovo materiale della classe
-- o un materiale personale; il docente per ogni nuova domanda nella scheda Aiuto.
-- I voti proposti da Claude (status 'proposto') non generano mai notifiche.
-- Le scritture restano veloci: i trigger (uno per istruzione, non per riga) fanno solo una chiamata pg_net
-- alla funzione Edge "notifiche", che compone i testi e invia i messaggi cifrati ai browser.
-- Le chiavi VAPID le genera la funzione al primo uso e restano in private_settings (mai nel sito).
-- Solo aggiunte: nessuna tabella o dato esistente viene modificato.

create extension if not exists pg_net;

-- owner = id dello studente (testo) oppure 'docente'. Lo stesso browser può essere iscritto
-- per il docente e per un profilo studente senza che uno cancelli l'altro.
create table if not exists push_subscriptions (
  endpoint    text not null check (endpoint like 'https://%' and char_length(endpoint) < 1000),
  owner       text not null,
  p256dh      text not null check (char_length(p256dh) < 200),
  auth        text not null check (char_length(auth) < 100),
  student_id  uuid,  -- senza chiave esterna: se il profilo viene eliminato la riga resta orfana e non riceve più nulla
  created_at  timestamptz not null default now(),
  last_ok     timestamptz,
  disabled_at timestamptz,
  primary key (endpoint, owner)
);
create index if not exists push_subscriptions_student on push_subscriptions (student_id) where disabled_at is null;
alter table push_subscriptions enable row level security;
revoke all on push_subscriptions from anon, authenticated;

-- La funzione Edge usa la chiave di servizio, che in questo progetto ha permessi tabella per tabella:
-- legge solo le colonne che servono per comporre i testi, e salva le chiavi VAPID al primo uso.
grant select, update on push_subscriptions to service_role;
grant insert on private_settings to service_role;
grant select (id, student_id, class_id, title, label, value, status) on marks to service_role;
grant select (id, class_id, pin_hash) on students to service_role;
grant select (id, class_id, title) on materials to service_role;
grant select (id, student_id, title) on student_materials to service_role;
grant select (id, class_id, author, body, stuck) on helpdesk to service_role;
grant select (id, name) on classes to service_role;

insert into private_settings (key, value) values
  ('push_token', encode(extensions.gen_random_bytes(32), 'hex')),
  ('push_url', 'https://pplpkabznbihovqwzenq.supabase.co/functions/v1/notifiche')
on conflict (key) do nothing;

-- Chiamata alla funzione Edge. Un errore qui non deve mai bloccare un voto o una domanda.
create or replace function push_send(p_body jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare u text; t text;
begin
  select value into u from private_settings where key = 'push_url';
  select value into t from private_settings where key = 'push_token';
  if u is null or t is null then return; end if;
  perform net.http_post(url := u, body := p_body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-novaula-push', t),
    timeout_milliseconds := 15000);
exception when others then
  raise warning 'notifiche: %', sqlerrm;
end $$;

/* ---------- Iscrizione dei dispositivi ---------- */
create or replace function student_push_subscribe(p_student uuid, p_token text, p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not student_token_ok(p_student, p_token) then raise exception 'Sessione scaduta: rientra nel profilo.'; end if;
  insert into push_subscriptions (endpoint, owner, p256dh, auth, student_id)
  values (p_endpoint, p_student::text, p_p256dh, p_auth, p_student)
  on conflict (endpoint, owner) do update set p256dh = excluded.p256dh, auth = excluded.auth, created_at = now(), disabled_at = null;
  perform push_send(jsonb_build_object('tipo', 'prova', 'endpoint', p_endpoint, 'owner', p_student::text));
end $$;

create or replace function teacher_push_subscribe(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not current_user_is_teacher() then raise exception 'Solo il docente.'; end if;
  insert into push_subscriptions (endpoint, owner, p256dh, auth)
  values (p_endpoint, 'docente', p_p256dh, p_auth)
  on conflict (endpoint, owner) do update set p256dh = excluded.p256dh, auth = excluded.auth, created_at = now(), disabled_at = null;
  perform push_send(jsonb_build_object('tipo', 'prova', 'endpoint', p_endpoint, 'owner', 'docente'));
end $$;

-- Disattivare richiede di conoscere l'endpoint, che resta solo nel browser che si è iscritto.
create or replace function push_unsubscribe(p_endpoint text, p_owner text)
returns void language sql security definer set search_path = public as $$
  update push_subscriptions set disabled_at = now() where endpoint = p_endpoint and owner = p_owner;
$$;

revoke all on function push_send(jsonb), student_push_subscribe(uuid, text, text, text, text),
  teacher_push_subscribe(text, text, text), push_unsubscribe(text, text) from public;
grant execute on function student_push_subscribe(uuid, text, text, text, text), push_unsubscribe(text, text) to anon, authenticated;
grant execute on function teacher_push_subscribe(text, text, text) to authenticated;

/* ---------- Trigger: uno per istruzione, così un voto a tutta la classe = una sola chiamata ---------- */
create or replace function marks_push_ins() returns trigger
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  select array_agg(n.id) into ids from nuovi n
  where n.status <> 'proposto'
    and exists (select 1 from push_subscriptions p where p.student_id = n.student_id and p.disabled_at is null);
  if ids is not null then perform push_send(jsonb_build_object('tipo', 'voti', 'ids', to_jsonb(ids))); end if;
  return null;
end $$;

create or replace function marks_push_upd() returns trigger
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  select array_agg(n.id) into ids from nuovi n join vecchi o on o.id = n.id
  where n.status <> 'proposto'
    and (o.status is distinct from n.status or o.label is distinct from n.label or o.value is distinct from n.value)
    and exists (select 1 from push_subscriptions p where p.student_id = n.student_id and p.disabled_at is null);
  if ids is not null then perform push_send(jsonb_build_object('tipo', 'voti', 'ids', to_jsonb(ids))); end if;
  return null;
end $$;

create or replace function materials_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  select array_agg(n.id) into ids from nuovi n
  where exists (select 1 from push_subscriptions p join students s on s.id = p.student_id
                where s.class_id = n.class_id and p.disabled_at is null);
  if ids is not null then perform push_send(jsonb_build_object('tipo', 'materiali', 'ids', to_jsonb(ids))); end if;
  return null;
end $$;

create or replace function student_materials_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  select array_agg(n.id) into ids from nuovi n
  where exists (select 1 from push_subscriptions p where p.student_id = n.student_id and p.disabled_at is null);
  if ids is not null then perform push_send(jsonb_build_object('tipo', 'personali', 'ids', to_jsonb(ids))); end if;
  return null;
end $$;

create or replace function helpdesk_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  if not exists (select 1 from push_subscriptions where owner = 'docente' and disabled_at is null) then return null; end if;
  select array_agg(n.id) into ids from nuovi n;
  if ids is not null then perform push_send(jsonb_build_object('tipo', 'aiuto', 'ids', to_jsonb(ids))); end if;
  return null;
end $$;

revoke all on function marks_push_ins(), marks_push_upd(), materials_push(), student_materials_push(), helpdesk_push() from public;

create or replace trigger marks_push_ins after insert on marks
  referencing new table as nuovi for each statement execute function marks_push_ins();
create or replace trigger marks_push_upd after update on marks
  referencing old table as vecchi new table as nuovi for each statement execute function marks_push_upd();
create or replace trigger materials_push after insert on materials
  referencing new table as nuovi for each statement execute function materials_push();
create or replace trigger student_materials_push after insert on student_materials
  referencing new table as nuovi for each statement execute function student_materials_push();
create or replace trigger helpdesk_push after insert on helpdesk
  referencing new table as nuovi for each statement execute function helpdesk_push();
