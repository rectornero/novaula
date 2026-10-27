-- Novaula 2.17.0 · Notifica a tutti
-- Il docente (solo lui) manda un messaggio sul telefono a tutti gli studenti con le notifiche attive,
-- di tutte le classi o di una sola. Non resta in pagina (per quello ci sono gli avvisi di classe).
-- Una sola chiamata alla funzione Edge "notifiche" per ogni invio (tipo 'messaggio'): niente cron, niente polling.
-- Solo aggiunte: si può eseguire più volte.

create or replace function teacher_push_broadcast(p_body text, p_class text default null) returns int
language plpgsql security definer set search_path = public as $$
declare b text := btrim(coalesce(p_body, '')); n int;
begin
  if not current_user_is_teacher() then raise exception 'Solo il docente.'; end if;
  if char_length(b) not between 1 and 300 then raise exception 'Scrivi un messaggio da 1 a 300 caratteri.'; end if;
  if p_class is not null and not exists (select 1 from classes where id = p_class) then raise exception 'Classe non trovata.'; end if;
  select count(distinct p.endpoint) into n from push_subscriptions p join students s on s.id = p.student_id
   where p.disabled_at is null and (p_class is null or s.class_id = p_class);
  if n > 0 then perform push_send(jsonb_build_object('tipo', 'messaggio', 'body', b, 'class_id', p_class)); end if;
  return n;
end $$;
revoke all on function teacher_push_broadcast(text, text) from public, anon;
grant execute on function teacher_push_broadcast(text, text) to authenticated;
