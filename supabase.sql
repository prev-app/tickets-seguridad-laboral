-- Esquema para Supabase. Ejecutar una vez en el SQL Editor del proyecto.
-- Después, crear el usuario administrador en Authentication > Users y ejecutar:
-- insert into public.admin_profiles (user_id) values ('UUID-DEL-USUARIO');

create extension if not exists pgcrypto;

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  instructor text not null check (char_length(instructor) between 2 and 120),
  hours numeric(6,1) not null check (hours > 0 and hours <= 1000),
  modality text not null check (modality in ('Presencial', 'Online', 'Mixto')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  status text not null default 'open' check (status in ('open', 'closed')),
  is_active boolean not null default true,
  objective_question text not null check (char_length(objective_question) between 5 and 240),
  objective_options jsonb not null check (jsonb_typeof(objective_options) = 'array' and jsonb_array_length(objective_options) >= 2),
  correct_answer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists one_active_course on public.courses (is_active) where is_active = true;

create table if not exists public.entrance_responses (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  email text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  responded_at timestamptz not null default now(),
  age smallint not null check (age between 16 and 100),
  education_level text not null check (education_level in ('Primario', 'Secundario', 'Terciario / técnico', 'Universitario', 'Posgrado')),
  employed boolean not null,
  sector text,
  risk_identification smallint not null check (risk_identification between 1 and 5),
  unsafe_action smallint not null check (unsafe_action between 1 and 5),
  objective_answer text not null,
  main_risk text not null check (char_length(main_risk) between 1 and 300),
  unique (course_id, email)
);

create table if not exists public.exit_responses (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  email text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  responded_at timestamptz not null default now(),
  risk_identification smallint not null check (risk_identification between 1 and 5),
  unsafe_action smallint not null check (unsafe_action between 1 and 5),
  objective_answer text not null,
  preventive_measure text not null check (char_length(preventive_measure) between 1 and 300),
  course_usefulness smallint not null check (course_usefulness between 1 and 5),
  unique (course_id, email)
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.admin_profiles where user_id = auth.uid());
$$;

create or replace function public.course_accepting(target_course uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.courses
    where id = target_course and is_active = true and status = 'open'
  );
$$;

create or replace function public.matching_entrance_exists(target_course uuid, target_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.entrance_responses
    where course_id = target_course and email = lower(trim(target_email))
  );
$$;

create or replace function public.get_active_course()
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
  objective_options jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.instructor, c.hours, c.modality, c.start_date, c.end_date,
         c.status, c.is_active, c.objective_question, c.objective_options
  from public.courses c
  where c.is_active = true
  order by c.created_at desc
  limit 1;
$$;

create or replace function public.normalize_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.email := lower(trim(new.email));
  new.responded_at := now();
  return new;
end;
$$;

drop trigger if exists normalize_entrance_response on public.entrance_responses;
create trigger normalize_entrance_response before insert on public.entrance_responses
for each row execute function public.normalize_response();

drop trigger if exists normalize_exit_response on public.exit_responses;
create trigger normalize_exit_response before insert on public.exit_responses
for each row execute function public.normalize_response();

alter table public.admin_profiles enable row level security;
alter table public.courses enable row level security;
alter table public.entrance_responses enable row level security;
alter table public.exit_responses enable row level security;

drop policy if exists "Admins read profiles" on public.admin_profiles;
create policy "Admins read profiles" on public.admin_profiles for select to authenticated using (public.is_admin());

drop policy if exists "Admins manage courses" on public.courses;
create policy "Admins manage courses" on public.courses for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Public submits entrance while open" on public.entrance_responses;
create policy "Public submits entrance while open" on public.entrance_responses for insert to anon, authenticated
with check (public.course_accepting(course_id));

drop policy if exists "Public submits linked exit while open" on public.exit_responses;
create policy "Public submits linked exit while open" on public.exit_responses for insert to anon, authenticated
with check (public.course_accepting(course_id) and public.matching_entrance_exists(course_id, email));

drop policy if exists "Admins manage entrances" on public.entrance_responses;
create policy "Admins manage entrances" on public.entrance_responses for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage exits" on public.exit_responses;
create policy "Admins manage exits" on public.exit_responses for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.admin_profiles, public.courses, public.entrance_responses, public.exit_responses from anon;
revoke all on function public.get_active_course() from public;
revoke all on function public.course_accepting(uuid) from public;
revoke all on function public.matching_entrance_exists(uuid, text) from public;
grant usage on schema public to anon, authenticated;
grant execute on function public.get_active_course() to anon, authenticated;
grant execute on function public.course_accepting(uuid) to anon, authenticated;
grant execute on function public.matching_entrance_exists(uuid, text) to anon, authenticated;
grant insert on public.entrance_responses, public.exit_responses to anon;
grant select, insert, update, delete on public.courses, public.entrance_responses, public.exit_responses to authenticated;
grant select on public.admin_profiles to authenticated;

-- Impide que un INSERT nuevo desactive la unicidad del curso activo por accidente.
-- Para conservar históricos, primero se marca el curso anterior como is_active = false.
