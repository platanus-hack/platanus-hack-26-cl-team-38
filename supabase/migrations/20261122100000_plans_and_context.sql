-- Plans: something a person sets out to do with a few of their accepted connections. Each
-- participant gets an agent, and an orchestrator plus the server code take them to one plan.
-- What an agent knows about its owner lives here too (user_context), not on the phone, so the
-- agent of someone whose app is closed can still take part.
-- Nothing in this file is read with the publishable key: server routes ask for the device key.

-- One row per line, so a line can be cited and searched on its own.
--   red:    read by the owner's agent and, as network context, by the agents of their accepted
--           connections (the detailed profile).
--   propio: read only by the owner's agent (standing restrictions).
create table user_context (
  user_id text not null references users (id) on delete cascade,
  line_id text not null,
  scope text not null check (scope in ('red', 'propio')),
  -- Where it came from: an assistant (claude, chatgpt, gemini), 'persona' or 'seed'.
  source text not null,
  section text not null default '',
  text text not null check (char_length(text) between 1 and 400),
  embedding extensions.vector(384) not null,
  primary key (user_id, line_id)
);

create table plans (
  id text primary key,
  owner_id text not null references users (id) on delete cascade,
  intent text not null check (char_length(intent) between 1 and 400),
  -- There is no failed state: a plan ends agreed by its agents or decided by the orchestrator.
  status text not null default 'deliberando' check (status in ('deliberando', 'consenso', 'decidido')),
  round smallint not null default 0,
  max_rounds smallint not null default 5 check (max_rounds between 1 and 5),
  -- Heartbeat of the process deliberating it. A stale one means the process died and another may resume.
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table plan_members (
  plan_id text not null references plans (id) on delete cascade,
  user_id text not null references users (id) on delete cascade,
  -- What this person asked their agent to keep in mind for this plan. Only their agent reads it.
  restrictions jsonb not null default '[]',
  primary key (plan_id, user_id)
);
create index on plan_members (user_id);

-- The orchestrator's proposal of each round. The one with decided_by set is the plan.
create table plan_versions (
  plan_id text not null references plans (id) on delete cascade,
  version smallint not null,
  content jsonb not null,
  decided_by text check (decided_by in ('consenso', 'orquestador', 'codigo')),
  created_at timestamptz not null default now(),
  primary key (plan_id, version)
);

-- The conversation: what each agent said in each round, and what the code discarded.
create table plan_messages (
  id bigint generated always as identity primary key,
  plan_id text not null references plans (id) on delete cascade,
  round smallint not null,
  agent text not null check (agent in ('orquestador', 'miembro', 'verificador')),
  person_id text,
  content jsonb not null,
  -- Measurement of the model call behind it (model, ms, tokens). Never a prompt.
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on plan_messages (plan_id, id);

alter table user_context enable row level security;
alter table plans enable row level security;
alter table plan_members enable row level security;
alter table plan_versions enable row level security;
alter table plan_messages enable row level security;

-- p_lines: [{ lineId, section, text, embedding }]. Replaces what that source had left in that scope.
create function save_context(p_user text, p_scope text, p_source text, p_lines jsonb)
returns integer
language plpgsql
set search_path = public, extensions
as $$
declare
  v_count integer;
begin
  delete from user_context where user_id = p_user and scope = p_scope and source = p_source;
  insert into user_context (user_id, line_id, scope, source, section, text, embedding)
  select p_user, l->>'lineId', p_scope, p_source, coalesce(l->>'section', ''), l->>'text', (l->>'embedding')::vector
  from jsonb_array_elements(p_lines) l;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- Everything a person's own agent may read about them: public topics and both scopes of context.
create function own_context(p_user text)
returns table (line_id text, kind text, scope text, section text, text text)
language sql
stable
as $$
  select t.topic_id, 'topico', 'red', t.kind, t.name from user_topics t where t.user_id = p_user
  union all
  select c.line_id, 'perfil', c.scope, c.section, c.text from user_context c where c.user_id = p_user
  order by 2 desc, 1
$$;

-- A plan is only with accepted connections of whoever creates it. False when someone is not one.
create function create_plan(p_id text, p_owner text, p_intent text, p_others text[], p_restrictions text[] default '{}', p_max_rounds integer default 5)
returns boolean
language plpgsql
as $$
begin
  if coalesce(array_length(p_others, 1), 0) = 0 or exists (
    select 1 from unnest(p_others) o
    where o = p_owner or not exists (
      select 1 from connections c
      where c.status = 'aceptada' and c.user_a = least(p_owner, o) and c.user_b = greatest(p_owner, o)
    )
  ) then
    return false;
  end if;
  insert into plans (id, owner_id, intent, max_rounds) values (p_id, p_owner, p_intent, p_max_rounds);
  insert into plan_members (plan_id, user_id, restrictions)
  select p_id, p_owner, to_jsonb(p_restrictions)
  union all
  select p_id, o, '[]'::jsonb from (select distinct unnest(p_others) as o) others;
  return true;
end
$$;

-- The neighbourhood of one participant: their accepted connections outside the plan. Every
-- participant is at most one step from the owner, so this never goes past two steps from them.
create function plan_neighbourhood(p_plan text, p_member text)
returns table (contact_id text, contact_name text)
language sql
stable
as $$
  select o.id, o.display_name
  from connections c
  join users o on o.id = case when c.user_a = p_member then c.user_b else c.user_a end
  where c.status = 'aceptada' and p_member in (c.user_a, c.user_b)
    and o.id not in (select m.user_id from plan_members m where m.plan_id = p_plan)
  order by o.id
$$;

-- What those contacts share with their connections (public topics and 'red' lines), best match
-- first against any of p_queries (a JSON array of vectors). Without queries the order is stable
-- and the score is 0, which is all a neighbourhood that fits under p_limit needs.
create function network_context(p_contacts text[], p_queries jsonb, p_limit integer)
returns table (user_id text, line_id text, kind text, section text, text text, score real)
language sql
stable
set search_path = public, extensions
as $$
  with lines as (
    select t.user_id, t.topic_id as line_id, 'topico' as kind, t.kind as section, t.name as text, v.embedding
    from user_topics t
    join topic_vectors v on v.name_key = t.name_key
    where t.user_id = any(p_contacts)
    union all
    select c.user_id, c.line_id, 'perfil', c.section, c.text, c.embedding
    from user_context c
    where c.user_id = any(p_contacts) and c.scope = 'red'
  ),
  queries as (
    select (q::text)::vector as embedding from jsonb_array_elements(coalesce(p_queries, '[]'::jsonb)) q
  )
  select l.user_id, l.line_id, l.kind, l.section, l.text,
    coalesce((select max(1 - (l.embedding <=> q.embedding)) from queries q), 0)::real as score
  from lines l
  order by score desc, l.user_id, l.kind desc, l.line_id
  limit p_limit
$$;

-- The owner, their accepted connections and the connections of those: three levels, no further.
create function plan_graph(p_me text)
returns table (from_id text, to_id text, to_name text, level smallint)
language sql
stable
as $$
  with mine as (
    select case when c.user_a = p_me then c.user_b else c.user_a end as id
    from connections c
    where c.status = 'aceptada' and p_me in (c.user_a, c.user_b)
  ),
  theirs as (
    select m.id as from_id, case when c.user_a = m.id then c.user_b else c.user_a end as id
    from mine m
    join connections c on c.status = 'aceptada' and m.id in (c.user_a, c.user_b)
  )
  select p_me, m.id, u.display_name, 2::smallint from mine m join users u on u.id = m.id
  union all
  select t.from_id, t.id, u.display_name, 3::smallint
  from theirs t
  join users u on u.id = t.id
  where t.id <> p_me and t.id not in (select id from mine)
  order by 4, 1, 2
$$;

-- The whole plan, for the server. Routes cut it down to what one participant may read.
create function plan_snapshot(p_plan text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p.id, 'ownerId', p.owner_id, 'intent', p.intent, 'status', p.status,
    'round', p.round, 'maxRounds', p.max_rounds, 'createdAt', p.created_at, 'updatedAt', p.updated_at,
    'members', (
      select jsonb_agg(
        jsonb_build_object('personId', m.user_id, 'displayName', u.display_name, 'restrictions', m.restrictions)
        order by (m.user_id <> p.owner_id), m.user_id
      )
      from plan_members m join users u on u.id = m.user_id
      where m.plan_id = p.id
    ),
    'versions', coalesce((
      select jsonb_agg(
        jsonb_build_object('version', v.version, 'content', v.content, 'decidedBy', v.decided_by, 'createdAt', v.created_at)
        order by v.version
      )
      from plan_versions v where v.plan_id = p.id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', g.id, 'round', g.round, 'agent', g.agent, 'personId', g.person_id, 'content', g.content, 'createdAt', g.created_at)
        order by g.id
      )
      from plan_messages g where g.plan_id = p.id
    ), '[]'::jsonb)
  )
  from plans p
  where p.id = p_plan
$$;

create function plans_of(p_me text)
returns table (id text, owner_id text, intent text, status text, round smallint, max_rounds smallint, members jsonb, resumen text, updated_at timestamptz)
language sql
stable
as $$
  select p.id, p.owner_id, p.intent, p.status, p.round, p.max_rounds,
    (
      select jsonb_agg(jsonb_build_object('personId', m.user_id, 'displayName', u.display_name) order by (m.user_id <> p.owner_id), m.user_id)
      from plan_members m join users u on u.id = m.user_id
      where m.plan_id = p.id
    ),
    (select v.content->>'resumen' from plan_versions v where v.plan_id = p.id order by v.version desc limit 1),
    p.updated_at
  from plans p
  where exists (select 1 from plan_members m where m.plan_id = p.id and m.user_id = p_me)
  order by p.created_at desc
$$;

-- Taking a plan to deliberate it. True for one caller at a time; a claim older than
-- p_stale_seconds belongs to a process that died.
create function claim_plan(p_plan text, p_stale_seconds integer default 180)
returns boolean
language sql
as $$
  with claimed as (
    update plans set claimed_at = now()
    where id = p_plan and status = 'deliberando'
      and (claimed_at is null or claimed_at < now() - make_interval(secs => p_stale_seconds))
    returning 1
  )
  select exists (select 1 from claimed)
$$;

create function unclaimed_plans(p_stale_seconds integer default 180)
returns table (id text)
language sql
stable
as $$
  select p.id from plans p
  where p.status = 'deliberando'
    and (p.claimed_at is null or p.claimed_at < now() - make_interval(secs => p_stale_seconds))
  order by p.created_at
$$;

-- Every write of a deliberation renews the claim.
create function record_plan_message(p_plan text, p_round integer, p_agent text, p_content jsonb, p_person_id text default null, p_meta jsonb default '{}')
returns bigint
language plpgsql
as $$
declare
  v_id bigint;
begin
  insert into plan_messages (plan_id, round, agent, person_id, content, meta)
  values (p_plan, p_round, p_agent, p_person_id, p_content, p_meta)
  returning id into v_id;
  update plans set updated_at = now(), claimed_at = now() where id = p_plan and status = 'deliberando';
  return v_id;
end
$$;

create function save_plan_version(p_plan text, p_version integer, p_content jsonb)
returns void
language plpgsql
as $$
begin
  insert into plan_versions (plan_id, version, content) values (p_plan, p_version, p_content)
  on conflict (plan_id, version) do update set content = excluded.content;
  update plans set round = greatest(round, p_version), updated_at = now(), claimed_at = now() where id = p_plan;
end
$$;

-- The end of a deliberation: that version is the plan, by consensus or by decision.
create function close_plan(p_plan text, p_version integer, p_decided_by text)
returns boolean
language plpgsql
as $$
begin
  update plan_versions set decided_by = p_decided_by where plan_id = p_plan and version = p_version;
  if not found then return false; end if;
  update plans set
    status = case when p_decided_by = 'consenso' then 'consenso' else 'decidido' end,
    claimed_at = null, updated_at = now()
  where id = p_plan;
  return true;
end
$$;

revoke execute on function
  save_context(text, text, text, jsonb), own_context(text),
  create_plan(text, text, text, text[], text[], integer), plan_neighbourhood(text, text),
  network_context(text[], jsonb, integer), plan_graph(text), plan_snapshot(text), plans_of(text),
  claim_plan(text, integer), unclaimed_plans(integer),
  record_plan_message(text, integer, text, jsonb, text, jsonb),
  save_plan_version(text, integer, jsonb), close_plan(text, integer, text)
from public, anon, authenticated;
grant execute on function
  save_context(text, text, text, jsonb), own_context(text),
  create_plan(text, text, text, text[], text[], integer), plan_neighbourhood(text, text),
  network_context(text[], jsonb, integer), plan_graph(text), plan_snapshot(text), plans_of(text),
  claim_plan(text, integer), unclaimed_plans(integer),
  record_plan_message(text, integer, text, jsonb, text, jsonb),
  save_plan_version(text, integer, jsonb), close_plan(text, integer, text)
to service_role;
