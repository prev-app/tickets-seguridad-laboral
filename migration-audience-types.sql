-- Agrega públicos diferenciados y el diagnóstico ADU sin borrar respuestas existentes.
-- Los cursos históricos se conservan como "Trabajadores".

alter table public.courses
  add column if not exists audience_type text not null default 'workers';

do $migration$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'courses_audience_type_check'
  ) then
    alter table public.courses
      add constraint courses_audience_type_check
      check (audience_type in ('workers', 'inspectors', 'internal'));
  end if;
end
$migration$;

alter table public.entrance_responses
  alter column employed drop not null,
  alter column risk_identification drop not null,
  alter column unsafe_action drop not null,
  alter column expectation_text drop not null,
  alter column main_risk drop not null,
  add column if not exists inspector_tenure text,
  add column if not exists adu_comfort smallint,
  add column if not exists adu_checklist_clarity smallint,
  add column if not exists adu_writing_confidence smallint,
  add column if not exists adu_main_difficulty text;

alter table public.exit_responses
  alter column risk_identification drop not null,
  alter column unsafe_action drop not null,
  alter column preventive_measure drop not null,
  alter column expectation_fulfillment drop not null,
  add column if not exists adu_comfort smallint,
  add column if not exists adu_checklist_clarity smallint,
  add column if not exists adu_writing_confidence smallint,
  add column if not exists adu_improvement_needed text;

do $migration$
begin
  if not exists (select 1 from pg_constraint where conname = 'entrance_inspector_tenure_check') then
    alter table public.entrance_responses add constraint entrance_inspector_tenure_check
      check (inspector_tenure in ('Menos de 1 año', '1 a 3 años', '4 a 7 años', '8 años o más'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'entrance_adu_comfort_check') then
    alter table public.entrance_responses add constraint entrance_adu_comfort_check check (adu_comfort between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'entrance_adu_checklist_clarity_check') then
    alter table public.entrance_responses add constraint entrance_adu_checklist_clarity_check check (adu_checklist_clarity between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'entrance_adu_writing_confidence_check') then
    alter table public.entrance_responses add constraint entrance_adu_writing_confidence_check check (adu_writing_confidence between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'entrance_adu_main_difficulty_check') then
    alter table public.entrance_responses add constraint entrance_adu_main_difficulty_check check (char_length(adu_main_difficulty) between 1 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exit_adu_comfort_check') then
    alter table public.exit_responses add constraint exit_adu_comfort_check check (adu_comfort between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exit_adu_checklist_clarity_check') then
    alter table public.exit_responses add constraint exit_adu_checklist_clarity_check check (adu_checklist_clarity between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exit_adu_writing_confidence_check') then
    alter table public.exit_responses add constraint exit_adu_writing_confidence_check check (adu_writing_confidence between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'exit_adu_improvement_needed_check') then
    alter table public.exit_responses add constraint exit_adu_improvement_needed_check check (char_length(adu_improvement_needed) <= 500);
  end if;
end
$migration$;

create or replace function private.validate_entrance_audience()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_audience text;
begin
  select audience_type into selected_audience from public.courses where id = new.course_id;
  if selected_audience = 'inspectors' then
    if new.inspector_tenure is null or new.adu_comfort is null or new.adu_checklist_clarity is null
       or new.adu_writing_confidence is null or new.adu_main_difficulty is null then
      raise exception 'Faltan respuestas obligatorias del diagnóstico ADU';
    end if;
  else
    if new.risk_identification is null or new.unsafe_action is null
       or new.expectation_text is null or new.main_risk is null then
      raise exception 'Faltan respuestas obligatorias del formulario general';
    end if;
    if selected_audience = 'workers' and new.employed is null then
      raise exception 'Falta indicar la situación laboral';
    end if;
    if selected_audience = 'workers' and new.employed and nullif(trim(new.sector), '') is null then
      raise exception 'Falta indicar el sector laboral';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.validate_exit_audience()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_audience text;
begin
  select audience_type into selected_audience from public.courses where id = new.course_id;
  if selected_audience = 'inspectors' then
    if new.adu_comfort is null or new.adu_checklist_clarity is null or new.adu_writing_confidence is null then
      raise exception 'Faltan respuestas obligatorias del diagnóstico ADU';
    end if;
  else
    if new.risk_identification is null or new.unsafe_action is null
       or new.preventive_measure is null or new.expectation_fulfillment is null then
      raise exception 'Faltan respuestas obligatorias del formulario general';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_entrance_audience on public.entrance_responses;
create trigger validate_entrance_audience before insert or update on public.entrance_responses
for each row execute function private.validate_entrance_audience();

drop trigger if exists validate_exit_audience on public.exit_responses;
create trigger validate_exit_audience before insert or update on public.exit_responses
for each row execute function private.validate_exit_audience();

drop function if exists public.get_active_course_with_questions();
create function public.get_active_course_with_questions()
returns table (
  id uuid,
  name text,
  instructor text,
  hours numeric,
  modality text,
  audience_type text,
  start_date date,
  end_date date,
  status text,
  is_active boolean,
  objective_question text,
  objective_options jsonb,
  technical_questions jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.instructor, c.hours, c.modality, c.audience_type, c.start_date, c.end_date,
         c.status, c.is_active, c.objective_question, c.objective_options,
         coalesce(
           (select jsonb_agg(item - 'correct_answer') from jsonb_array_elements(c.technical_questions) item),
           '[]'::jsonb
         )
  from public.courses c
  where c.is_active = true
  order by c.created_at desc
  limit 1;
$$;

revoke all on function public.get_active_course_with_questions() from public;
revoke all on function private.validate_entrance_audience() from public;
revoke all on function private.validate_exit_audience() from public;
grant execute on function public.get_active_course_with_questions() to anon, authenticated;
