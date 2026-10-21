-- Novaula · aggiornamento del 21/10/2026: consegne dalle slide di laboratorio ("Al computer").
-- Ogni slide di laboratorio diventa, alla prima consegna, un "Lavoro in classe" nascosto
-- (assignments.deck + assignments.slide): così le consegne finiscono in "Consegne ricevute",
-- nelle correzioni di Claude, nei voti e nella pagella come gli altri compiti.
-- Lo studente consegna dal suo profilo (con PIN, se l'ha messo) oppure scrivendo nome e cognome.
-- Si possono allegare più file (submissions.files); file_path resta il primo file.
-- Si può eseguire più volte. Serve dopo 2026-10-19-profili.sql.

alter table assignments add column if not exists deck text;
alter table assignments add column if not exists slide int;
create unique index if not exists assignments_deck_slide on assignments (class_id, deck, slide) where deck is not null;

-- Tutti i file della consegna: [{"path": "...", "name": "...", "size": 123, "sha": "..."}]
alter table submissions add column if not exists files jsonb;

-- Consegna dalla slide. I file sono già nel bucket "consegne" in <classe>/slide/<lezione>-<slide>/.
-- Con p_student + p_token consegna a nome del profilo; altrimenti con nome e cognome.
-- Un nome che ha già un profilo senza PIN viene collegato al profilo; con il PIN serve entrare.
create or replace function slide_submit(p_class text, p_deck text, p_slide int, p_title text, p_text text,
  p_student uuid, p_token text, p_first text, p_last text, p_note text, p_files jsonb, p_device text)
returns json language plpgsql security definer set search_path = public as $$
declare a_id uuid; st record; who text; sid uuid; new_id uuid; n int; f jsonb; prefix text;
begin
  if not exists (select 1 from classes where id = p_class) then raise exception 'Classe non trovata.'; end if;
  if coalesce(p_deck, '') !~ '^[a-z0-9-]{1,80}$' or coalesce(p_slide, 0) not between 1 and 300 then raise exception 'Slide non valida.'; end if;
  p_files := coalesce(p_files, '[]'::jsonb);
  if jsonb_typeof(p_files) <> 'array' or jsonb_array_length(p_files) > 10 then raise exception 'Al massimo 10 file per consegna.'; end if;
  if jsonb_array_length(p_files) = 0 and char_length(trim(coalesce(p_note, ''))) = 0 then raise exception 'Allega un file oppure scrivi la risposta.'; end if;
  if char_length(coalesce(p_note, '')) > 2000 then raise exception 'Il testo è troppo lungo (massimo 2000 caratteri).'; end if;
  prefix := p_class || '/slide/' || p_deck || '-' || p_slide || '/';
  for f in select * from jsonb_array_elements(p_files) loop
    if coalesce(f->>'path', '') !~ ('^' || prefix || '[A-Za-z0-9._-]+$') then raise exception 'File non valido.'; end if;
  end loop;

  -- Chi consegna
  if p_student is not null then
    if not student_token_ok(p_student, p_token) then raise exception 'Sessione scaduta: rientra nel profilo.'; end if;
    select * into st from students where id = p_student;
    if st.class_id <> p_class then raise exception 'Il tuo profilo è di un''altra classe.'; end if;
    sid := st.id; who := st.first_name || ' ' || st.last_name;
  else
    if char_length(trim(coalesce(p_first, ''))) < 2 or char_length(trim(coalesce(p_last, ''))) < 2 then raise exception 'Scrivi nome e cognome per intero.'; end if;
    select * into st from students where class_id = p_class and name_key = name_key(p_first, p_last);
    if found then
      if st.pin_hash is not null then raise exception 'Questo nome ha un profilo con PIN: scrivi il tuo PIN.'; end if;
      sid := st.id; who := st.first_name || ' ' || st.last_name;
    else
      who := initcap(trim(p_first)) || ' ' || initcap(trim(p_last));
    end if;
  end if;

  -- Il lavoro in classe della slide (creato alla prima consegna)
  select id into a_id from assignments where class_id = p_class and deck = p_deck and slide = p_slide;
  if a_id is null then
    insert into assignments (class_id, title, description, kind, deck, slide)
    values (p_class, left(coalesce(nullif(trim(p_title), ''), p_deck || ' · slide ' || p_slide), 200),
            nullif(left(trim(coalesce(p_text, '')), 4000), ''), 'classe', p_deck, p_slide)
    on conflict (class_id, deck, slide) where deck is not null do nothing
    returning id into a_id;
    if a_id is null then select id into a_id from assignments where class_id = p_class and deck = p_deck and slide = p_slide; end if;
  end if;

  if exists (select 1 from submissions where assignment_id = a_id and created_at > now() - interval '20 seconds'
             and (student_id = sid or (sid is null and student_name = left(who, 80)))) then
    raise exception 'Hai appena consegnato: aspetta qualche secondo.';
  end if;
  select count(*) into n from submissions where assignment_id = a_id and (student_id = sid or (sid is null and student_name = left(who, 80)));
  insert into submissions (assignment_id, student_name, note, file_path, file_name, file_sha256, files, student_id, attempt, device_hash)
  values (a_id, left(who, 80), nullif(trim(coalesce(p_note, '')), ''),
          p_files->0->>'path', left(p_files->0->>'name', 200), nullif(left(coalesce(p_files->0->>'sha', ''), 64), ''),
          case when jsonb_array_length(p_files) > 0 then p_files end, sid, n + 1, nullif(left(coalesce(p_device, ''), 64), ''))
  returning id into new_id;
  if sid is not null then insert into submission_members values (new_id, sid); end if;
  return json_build_object('id', new_id, 'name', who, 'profile', sid is not null, 'attempt', n + 1);
end $$;

-- Quante volte questo profilo (o questo nome) ha già consegnato le slide di una lezione
create or replace function slide_status(p_class text, p_deck text, p_student uuid, p_token text)
returns table (slide int, created_at timestamptz, attempt int, status text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not student_token_ok(p_student, p_token) then return; end if;
  return query select a.slide, s.created_at, s.attempt, s.status from assignments a
    join submissions s on s.assignment_id = a.id
    join submission_members m on m.submission_id = s.id and m.student_id = p_student
    where a.class_id = p_class and a.deck = p_deck order by s.created_at;
end $$;

grant execute on function slide_submit(text, text, int, text, text, uuid, text, text, text, text, jsonb, text) to anon, authenticated;
grant execute on function slide_status(text, text, uuid, text) to anon, authenticated;
