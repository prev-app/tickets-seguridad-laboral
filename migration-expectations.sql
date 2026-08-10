-- Migración para una instalación existente.
-- Conserva las respuestas y completa la muestra sintética ya cargada.

alter table public.entrance_responses
  add column if not exists expectation_text text;

alter table public.exit_responses
  add column if not exists expectation_fulfillment text;

with ranked as (
  select id, row_number() over (partition by course_id order by email) as participant_number
  from public.entrance_responses
)
update public.entrance_responses as entrance
set expectation_text = case
  when ranked.participant_number <= 100 then case ranked.participant_number % 3
    when 0 then 'Mejorar mis capacidades para identificar riesgos y actuar con mayor seguridad.'
    when 1 then 'Fortalecer mis habilidades para reconocer peligros en el trabajo.'
    else 'Desarrollar competencias para tomar decisiones seguras.'
  end
  when ranked.participant_number <= 150 then case ranked.participant_number % 3
    when 0 then 'Lograr los objetivos de seguridad previstos para mi puesto.'
    when 1 then 'Alcanzar metas concretas de prevención en mi trabajo.'
    else 'Cumplir los resultados esperados de la capacitación.'
  end
  when ranked.participant_number <= 300 then case ranked.participant_number % 3
    when 0 then 'Obtener herramientas prácticas para trabajar de manera segura.'
    when 1 then 'Aplicar procedimientos seguros en las tareas diarias.'
    else 'Incorporar prácticas concretas de prevención en el trabajo.'
  end
  when ranked.participant_number <= 400 then case ranked.participant_number % 3
    when 0 then 'Prevenir riesgos y evitar accidentes durante las tareas habituales.'
    when 1 then 'Reducir los incidentes mediante controles simples y efectivos.'
    else 'Minimizar riesgos antes de comenzar cada actividad.'
  end
  when ranked.participant_number <= 440 then case ranked.participant_number % 3
    when 0 then 'Conocer la normativa de seguridad aplicable a mi actividad.'
    when 1 then 'Comprender los requisitos y reglamentos del puesto.'
    else 'Actualizar conocimientos sobre leyes de seguridad laboral.'
  end
  when ranked.participant_number <= 470 then case ranked.participant_number % 3
    when 0 then 'Promover una cultura de seguridad dentro del equipo.'
    when 1 then 'Concientizar al grupo sobre la importancia de la prevención.'
    else 'Sensibilizar a mis compañeros para fortalecer la seguridad.'
  end
  else case ranked.participant_number % 3
    when 0 then 'Actualizar conocimientos generales y resolver dudas del trabajo.'
    when 1 then 'Refrescar conceptos aprendidos anteriormente.'
    else 'Aclarar dudas sobre cómo actuar ante situaciones inseguras.'
  end
end
from ranked
where entrance.id = ranked.id
  and entrance.expectation_text is null;

update public.exit_responses as exit
set expectation_fulfillment = case
  when exit.course_usefulness >= 4
       and (exit.risk_identification > entrance.risk_identification
            or exit.unsafe_action > entrance.unsafe_action)
       and exit.objective_answer = course.correct_answer
    then 'Totalmente'
  when exit.course_usefulness <= 2
       or (exit.risk_identification < entrance.risk_identification
           and exit.unsafe_action < entrance.unsafe_action)
    then 'No cumplió'
  else 'Parcialmente'
end
from public.entrance_responses as entrance
join public.courses as course on course.id = entrance.course_id
where exit.course_id = entrance.course_id
  and lower(trim(exit.email)) = lower(trim(entrance.email))
  and exit.expectation_fulfillment is null;

alter table public.entrance_responses
  alter column expectation_text set not null;

alter table public.exit_responses
  alter column expectation_fulfillment set not null;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'entrance_responses_expectation_text_check'
      and conrelid = 'public.entrance_responses'::regclass
  ) then
    alter table public.entrance_responses
      add constraint entrance_responses_expectation_text_check
      check (char_length(trim(expectation_text)) between 5 and 500);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'exit_responses_expectation_fulfillment_check'
      and conrelid = 'public.exit_responses'::regclass
  ) then
    alter table public.exit_responses
      add constraint exit_responses_expectation_fulfillment_check
      check (expectation_fulfillment in ('Totalmente', 'Parcialmente', 'No cumplió'));
  end if;
end
$migration$;

-- Resumen de control para la muestra cargada.
select expectation_text, count(*)
from public.entrance_responses
group by expectation_text
order by count(*) desc, expectation_text;

select expectation_fulfillment, count(*)
from public.exit_responses
group by expectation_fulfillment
order by count(*) desc;
