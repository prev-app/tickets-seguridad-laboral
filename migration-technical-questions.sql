-- Amplía la evaluación técnica de una a tres preguntas sin borrar datos existentes.

alter table public.courses
  add column if not exists technical_questions jsonb;

update public.courses
set technical_questions = jsonb_build_array(jsonb_build_object(
  'id', 'q1',
  'question', objective_question,
  'options', objective_options,
  'correct_answer', correct_answer
))
where technical_questions is null;

alter table public.courses
  alter column technical_questions set not null;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'courses_technical_questions_check'
  ) then
    alter table public.courses
      add constraint courses_technical_questions_check check (
        jsonb_typeof(technical_questions) = 'array'
        and jsonb_array_length(technical_questions) between 1 and 3
      );
  end if;
end
$migration$;

alter table public.entrance_responses
  add column if not exists technical_answers jsonb;

update public.entrance_responses
set technical_answers = jsonb_build_object('q1', objective_answer)
where technical_answers is null;

alter table public.entrance_responses
  alter column technical_answers set not null;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'entrance_responses_technical_answers_check'
  ) then
    alter table public.entrance_responses
      add constraint entrance_responses_technical_answers_check
      check (jsonb_typeof(technical_answers) = 'object');
  end if;
end
$migration$;

alter table public.exit_responses
  add column if not exists technical_answers jsonb;

update public.exit_responses
set technical_answers = jsonb_build_object('q1', objective_answer)
where technical_answers is null;

alter table public.exit_responses
  alter column technical_answers set not null;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exit_responses_technical_answers_check'
  ) then
    alter table public.exit_responses
      add constraint exit_responses_technical_answers_check
      check (jsonb_typeof(technical_answers) = 'object');
  end if;
end
$migration$;

create or replace function public.get_active_course_with_questions()
returns table (
  id uuid,
  name text,
  instructor text,
  hours numeric,
  modality text,
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
  select c.id, c.name, c.instructor, c.hours, c.modality, c.start_date, c.end_date,
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
grant execute on function public.get_active_course_with_questions() to anon, authenticated;
