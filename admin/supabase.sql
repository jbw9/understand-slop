-- Bluprint admin: installs, landing visits and map runs, for blpr.dev/admin.
-- Run once in Supabase → SQL Editor. Safe to run again.
-- It shares the movies site's Supabase project, so every table and function here is prefixed bp_.
--
-- Everything outside talks only to the functions below. Every table has row level security on and
-- no policies, so the public key can write through the functions and read nothing. The dashboard
-- reads through bp_admin_overview / bp_admin_run, which check one fixed password against a bcrypt hash.
--
-- Setting (or changing) the password:
--   insert into public.bp_admin (id, pw_hash) values (1, extensions.crypt('#Bananacake69', extensions.gen_salt('bf', 10)))
--   on conflict (id) do update set pw_hash = excluded.pw_hash;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.bp_admin (
    id int primary key check (id = 1),
    pw_hash text not null
);

-- One row per run of install.sh, written as it exits.
create table if not exists public.bp_installs (
    id bigint generated always as identity primary key,
    at timestamptz not null default now(),
    os text,
    arch text,
    ok boolean not null
);

-- One row per browser per day on blpr.dev.
create table if not exists public.bp_visits (
    visitor uuid not null,
    day date not null default current_date,
    views int not null default 1,
    path text,
    referrer text,
    country text,
    first_at timestamptz not null default now(),
    last_at timestamptz not null default now(),
    primary key (visitor, day)
);

-- One row per finished map run on anyone's machine that has run reports on.
create table if not exists public.bp_runs (
    id bigint generated always as identity primary key,
    at timestamptz not null default now(),
    install_id uuid,
    mapper_version int,
    kind text,
    status text not null,
    repo text,
    repo_commit text,
    backend text,
    mode text,
    files int,
    quick_s numeric,
    total_s numeric,
    usd numeric,
    models jsonb,
    report jsonb,
    log_tail text
);
create index if not exists bp_runs_at on public.bp_runs (at desc);

alter table public.bp_admin enable row level security;
alter table public.bp_installs enable row level security;
alter table public.bp_visits enable row level security;
alter table public.bp_runs enable row level security;

create or replace function public.bp_track_install(os text default null, arch text default null, ok boolean default true)
returns void language sql security definer set search_path = public, extensions as $$
    insert into bp_installs (os, arch, ok) values (left(os, 40), left(arch, 40), coalesce(ok, false));
$$;

create or replace function public.bp_track_visit(vid uuid, path text default null, referrer text default null, country text default null)
returns void language sql security definer set search_path = public, extensions as $$
    insert into bp_visits as v (visitor, path, referrer, country)
    values (vid, left(path, 200), left(referrer, 300), left(country, 80))
    on conflict (visitor, day) do update set
        views = v.views + 1,
        last_at = now(),
        country = coalesce(v.country, excluded.country);
$$;

-- What the app sends is whatever its report says; anything oversized is dropped rather than refused,
-- so a run is still counted.
create or replace function public.bp_record_run(r jsonb) returns void
language sql security definer set search_path = public, extensions as $$
    insert into bp_runs (install_id, mapper_version, kind, status, repo, repo_commit, backend, mode, files,
        quick_s, total_s, usd, models, report, log_tail)
    values (
        case when r ->> 'install_id' ~ '^[0-9a-f-]{36}$' then (r ->> 'install_id')::uuid end,
        case when jsonb_typeof(r -> 'mapper_version') = 'number' then (r ->> 'mapper_version')::int end,
        left(r ->> 'kind', 20),
        coalesce(left(r ->> 'status', 20), 'unknown'),
        left(r ->> 'repo', 200),
        left(r ->> 'repo_commit', 64),
        left(r ->> 'backend', 40),
        left(r ->> 'mode', 80),
        case when jsonb_typeof(r -> 'files') = 'number' then (r ->> 'files')::int end,
        case when jsonb_typeof(r -> 'quick_s') = 'number' then (r ->> 'quick_s')::numeric end,
        case when jsonb_typeof(r -> 'total_s') = 'number' then (r ->> 'total_s')::numeric end,
        case when jsonb_typeof(r -> 'usd') = 'number' then (r ->> 'usd')::numeric end,
        case when octet_length((r -> 'models')::text) < 4096 then r -> 'models' end,
        case when octet_length((r -> 'report')::text) < 262144 then r -> 'report' end,
        right(r ->> 'log_tail', 65536)
    );
$$;

create or replace function public.bp_admin_ok(pw text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
    select exists (select 1 from bp_admin where id = 1 and pw_hash = crypt(coalesce(pw, ''), pw_hash));
$$;
revoke execute on function public.bp_admin_ok(text) from public, anon, authenticated;

-- The updates a new map went on to get: same machine, same repo, until that repo was mapped anew there.
create or replace function public.bp_updates_of(g public.bp_runs) returns setof public.bp_runs
language sql stable security definer set search_path = public, extensions as $$
    select u.* from bp_runs u
    where u.kind = 'update' and u.install_id is not distinct from g.install_id and u.repo is not distinct from g.repo
        and u.at > g.at
        and u.at < coalesce((select min(n.at) from bp_runs n where n.kind is distinct from 'update'
            and n.install_id is not distinct from g.install_id and n.repo is not distinct from g.repo and n.at > g.at), 'infinity');
$$;
revoke execute on function public.bp_updates_of(public.bp_runs) from public, anon, authenticated;

-- Everything on the dashboard but each run's report and log, which bp_admin_run fetches one at a time.
create or replace function public.bp_admin_overview(pw text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
    if not bp_admin_ok(pw) then
        raise exception 'Not allowed';
    end if;
    return jsonb_build_object(
        'installs', (select count(*) from bp_installs where ok),
        'installs_30', (select count(*) from bp_installs where ok and at > now() - interval '30 days'),
        'installs_failed_30', (select count(*) from bp_installs where not ok and at > now() - interval '30 days'),
        'visitors_30', (select count(distinct visitor) from bp_visits where day > current_date - 30),
        'views_30', (select coalesce(sum(views), 0) from bp_visits where day > current_date - 30),
        'daily', (select coalesce(jsonb_agg(to_jsonb(d) order by d.day), '[]') from (
            select g.day::date as day,
                (select count(*) from bp_installs i where i.ok and i.at::date = g.day) as installs,
                (select count(*) from bp_installs i where not i.ok and i.at::date = g.day) installs_failed,
                (select count(*) from bp_visits v where v.day = g.day) visitors,
                (select coalesce(sum(views), 0) from bp_visits v where v.day = g.day) views,
                (select count(*) from bp_runs r where r.kind is distinct from 'update' and r.status = 'ok' and r.at::date = g.day) runs_ok,
                (select count(*) from bp_runs r where r.kind is distinct from 'update' and r.status <> 'ok' and r.at::date = g.day) runs_failed
            from generate_series(current_date - 29, current_date, interval '1 day') g(day)) d),
        'referrers', (select coalesce(jsonb_agg(to_jsonb(x) order by x.visitors desc), '[]') from (
            select coalesce(nullif(referrer, ''), 'direct') referrer, count(distinct visitor) visitors
            from bp_visits where day > current_date - 30 group by 1 order by 2 desc limit 15) x),
        'countries', (select coalesce(jsonb_agg(to_jsonb(x) order by x.visitors desc), '[]') from (
            select coalesce(country, 'unknown') country, count(distinct visitor) visitors
            from bp_visits where day > current_date - 30 group by 1 order by 2 desc limit 15) x),
        'os', (select coalesce(jsonb_agg(to_jsonb(x) order by x.installs desc), '[]') from (
            select coalesce(os, '?') || ' ' || coalesce(arch, '') os, count(*) filter (where ok) installs,
                count(*) filter (where not ok) failed
            from bp_installs group by 1) x),
        'versions', (select coalesce(jsonb_agg(to_jsonb(x) order by x.mapper_version desc nulls last), '[]') from (
            select mapper_version, count(*) runs,
                count(*) filter (where status <> 'ok') failed,
                min(at) first_at, max(at) last_at,
                percentile_cont(0.5) within group (order by quick_s) filter (where status = 'ok') quick_s,
                percentile_cont(0.5) within group (order by total_s) filter (where status = 'ok') total_s,
                avg(usd) filter (where status = 'ok') usd,
                avg(files) filter (where status = 'ok') files,
                avg(jsonb_array_length(report -> 'check' -> 'problems')) filter (where status = 'ok'
                    and jsonb_typeof(report -> 'check' -> 'problems') = 'array') problems
            from bp_runs where kind is distinct from 'update' group by mapper_version) x),
        'runs_30', (select count(*) from bp_runs where kind is distinct from 'update' and at > now() - interval '30 days'),
        'runs_failed_30', (select count(*) from bp_runs where kind is distinct from 'update' and status <> 'ok' and at > now() - interval '30 days'),
        'updates_30', (select count(*) from bp_runs where kind = 'update' and at > now() - interval '30 days'),
        'usd_30', (select coalesce(sum(usd), 0) from bp_runs where at > now() - interval '30 days'),
        'machines', (select count(distinct install_id) from bp_runs),
        -- New maps only; each one's updates are counted here and listed by bp_admin_run.
        'recent', (select coalesce(jsonb_agg(to_jsonb(r) order by r.at desc), '[]') from (
            select g.id, g.at, g.install_id, g.mapper_version, g.kind, g.status, g.repo, g.repo_commit, g.backend, g.mode,
                g.files, g.quick_s, g.total_s, g.usd,
                (select count(*) from bp_updates_of(g) u) updates,
                (select coalesce(sum(u.usd), 0) from bp_updates_of(g) u) updates_usd
            from bp_runs g where g.kind is distinct from 'update' order by g.at desc limit 200) r));
end $$;

-- One map's report and log, and its updates (with a log only for those that failed).
create or replace function public.bp_admin_run(pw text, run_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
    g bp_runs;
begin
    if not bp_admin_ok(pw) then
        raise exception 'Not allowed';
    end if;
    select * into g from bp_runs where id = run_id;
    if g.id is null then
        return null;
    end if;
    return jsonb_build_object('models', g.models, 'report', g.report, 'log_tail', g.log_tail,
        'updates', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'at', u.at, 'status', u.status,
                'mapper_version', u.mapper_version, 'total_s', u.total_s, 'usd', u.usd, 'report', u.report,
                'log_tail', case when u.status <> 'ok' then u.log_tail end) order by u.at desc), '[]')
            from bp_updates_of(g) u));
end $$;

-- Every new map of one repo, oldest first, with what the dashboard compares across mapping versions.
create or replace function public.bp_admin_repo(pw text, repo_name text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
    if not bp_admin_ok(pw) then
        raise exception 'Not allowed';
    end if;
    return (select coalesce(jsonb_agg(to_jsonb(r) order by r.at), '[]') from (
        select g.id, g.at, g.install_id, g.mapper_version, g.status, g.repo_commit, g.files, g.quick_s, g.total_s, g.usd,
            (select sum(coalesce((b ->> 'input')::numeric, 0) + coalesce((b ->> 'output')::numeric, 0) + coalesce((b ->> 'cacheRead')::numeric, 0))
                from jsonb_each(case when jsonb_typeof(g.report -> 'bill') = 'object' then g.report -> 'bill' else '{}' end) e(k, b)) tokens,
            case when jsonb_typeof(g.report -> 'quickCheck' -> 'problems') = 'array' then jsonb_array_length(g.report -> 'quickCheck' -> 'problems') end quick_problems,
            case when jsonb_typeof(g.report -> 'check' -> 'problems') = 'array' then jsonb_array_length(g.report -> 'check' -> 'problems') end problems,
            case when jsonb_typeof(g.report -> 'deepened') = 'array' then jsonb_array_length(g.report -> 'deepened') end sections,
            case when jsonb_typeof(g.report -> 'deepened') = 'array' then (select count(*) from jsonb_array_elements(g.report -> 'deepened') s where (s ->> 'accepted')::boolean) end accepted,
            (select count(*) from bp_updates_of(g) u) updates
        from bp_runs g where g.kind is distinct from 'update' and g.repo = repo_name) r);
end $$;
