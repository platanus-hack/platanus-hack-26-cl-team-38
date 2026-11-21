-- Users, what they publish, and the connections two of them accepted.
-- Only the public layer lives here: every topic went through the privacy filter at check-in.
-- A vector depends on the topic name alone, so it is stored once per name, and which names match
-- (cosine >= 0.60) is computed once, when a name first appears. Crossing two people is then an
-- index join: no vector is read or compared.

create extension if not exists vector with schema extensions;

create table users (
  -- The personId the phone already uses in room_members.
  id text primary key,
  display_name text not null,
  -- sha256 of the device key, claimed on first use. Never leaves the server.
  key_hash text,
  -- Fingerprint of the published topics: a check-in that changes nothing rewrites nothing.
  profile_hash text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table topic_vectors (
  -- The name as embed() sees it: no accents, lower case.
  name_key text primary key,
  embedding extensions.vector(384) not null
);

-- Both directions and the name with itself, so a crossing is one join.
create table topic_matches (
  name_a text not null references topic_vectors (name_key) on delete cascade,
  name_b text not null references topic_vectors (name_key) on delete cascade,
  cosine real not null,
  primary key (name_a, name_b)
);

create table user_topics (
  user_id text not null references users (id) on delete cascade,
  topic_id text not null,
  name text not null,
  name_key text not null references topic_vectors (name_key),
  kind text not null,
  depth smallint not null check (depth between 1 and 3),
  sources text[] not null,
  primary key (user_id, topic_id)
);

-- What two people share, as last computed. Recomputed on every crossing (it is cheap); kept one
-- week so lists do not recompute, and dropped as soon as either profile changes.
create table user_matches (
  user_a text not null references users (id) on delete cascade,
  user_b text not null references users (id) on delete cascade,
  shared jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index on user_matches (user_b);
create index on user_matches (computed_at);

-- One row per pair, whoever proposed. Rejecting or withdrawing deletes the row.
create table connections (
  user_a text not null references users (id) on delete cascade,
  user_b text not null references users (id) on delete cascade,
  proposed_by text not null,
  accepted_a timestamptz,
  accepted_b timestamptz,
  origin_kind text not null check (origin_kind in ('sala', 'lugar')),
  origin_room_id text references rooms (id) on delete set null,
  -- Room or place name, copied: rooms are wiped when they close.
  origin_label text not null,
  -- What they had in common when the second one accepted: names, kind, depth, cosine. No vectors.
  shared jsonb not null default '[]',
  created_at timestamptz not null default now(),
  -- Derived, so "aceptada" cannot exist without both acceptances.
  status text generated always as (
    case when accepted_a is not null and accepted_b is not null then 'aceptada' else 'propuesta' end
  ) stored,
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (proposed_by in (user_a, user_b)),
  check (case when proposed_by = user_a then accepted_a else accepted_b end is not null)
);
create index on connections (user_b);

-- No policies: the publishable key reads and writes none of this. Server routes use the service
-- role, check the device key, and hand each person only their own rows.
alter table users enable row level security;
alter table topic_vectors enable row level security;
alter table topic_matches enable row level security;
alter table user_topics enable row level security;
alter table user_matches enable row level security;
alter table connections enable row level security;

-- p_topics: [{ id, name, nameKey, kind, depth, sources, embedding }]. True when the profile changed.
create function save_profile(p_id text, p_display_name text, p_topics jsonb, p_hash text, p_key_hash text default null)
returns boolean
language plpgsql
set search_path = public, extensions
as $$
declare
  v_changed boolean := not exists (select 1 from users where id = p_id and profile_hash = p_hash);
  v_fresh text[];
begin
  insert into users (id, display_name, key_hash, profile_hash)
  values (p_id, p_display_name, p_key_hash, p_hash)
  on conflict (id) do update set
    display_name = excluded.display_name,
    key_hash = coalesce(users.key_hash, excluded.key_hash),
    profile_hash = excluded.profile_hash,
    updated_at = now();
  if not v_changed then return false; end if;

  -- One writer of names at a time: two profiles bringing new names at once would not see each
  -- other's and that pair would never be compared.
  perform pg_advisory_xact_lock(hashtext('topic_vectors'));
  with added as (
    insert into topic_vectors (name_key, embedding)
    select distinct on (t->>'nameKey') t->>'nameKey', (t->>'embedding')::vector
    from jsonb_array_elements(p_topics) t
    on conflict do nothing
    returning name_key
  )
  select array_agg(name_key) into v_fresh from added;

  insert into topic_matches (name_a, name_b, cosine)
  select d.name_a, d.name_b, x.cosine
  from (
    select f.name_key as fresh, t.name_key as other, (1 - (f.embedding <=> t.embedding))::real as cosine
    from topic_vectors f cross join topic_vectors t
    where f.name_key = any(v_fresh)
  ) x
  cross join lateral (values (x.fresh, x.other), (x.other, x.fresh)) as d (name_a, name_b)
  where x.cosine >= 0.6
  on conflict do nothing;

  delete from user_topics where user_id = p_id;
  insert into user_topics (user_id, topic_id, name, name_key, kind, depth, sources)
  select p_id, t->>'id', t->>'name', t->>'nameKey', t->>'kind', (t->>'depth')::smallint,
    array(select jsonb_array_elements_text(t->'sources'))
  from jsonb_array_elements(p_topics) t
  on conflict do nothing;

  -- Something may have been unpublished: nothing computed from the old profile stays readable.
  delete from user_matches where p_id in (user_a, user_b);
  return true;
end
$$;

-- Trust on first use: the first key seen for a user becomes theirs. Null when the user does not exist.
create function claim_key(p_id text, p_key_hash text)
returns boolean
language sql
as $$
  update users set key_hash = coalesce(key_hash, p_key_hash) where id = p_id returning key_hash = p_key_hash
$$;

-- The crossing. Each element names both sides by user id, so the same JSON serves either of them:
-- { cosine, topics: { <user id>: { name, kind, depth }, <other id>: { name, kind, depth } } }.
create function shared_topics(p_me text, p_others text[])
returns table (other_id text, shared jsonb)
language sql
stable
as $$
  select b.user_id,
    jsonb_agg(
      jsonb_build_object(
        'cosine', round(m.cosine::numeric, 2),
        'topics', jsonb_build_object(
          p_me, jsonb_build_object('name', a.name, 'kind', a.kind, 'depth', a.depth),
          b.user_id, jsonb_build_object('name', b.name, 'kind', b.kind, 'depth', b.depth)
        )
      )
      order by m.cosine desc, a.name, b.name
    )
  from user_topics a
  join topic_matches m on m.name_a = a.name_key
  join user_topics b on b.name_key = m.name_b
  where a.user_id = p_me and b.user_id = any(p_others) and b.user_id <> p_me
  group by b.user_id
$$;

create type match_view as (other_id text, other_name text, shared jsonb, computed_at timestamptz);

-- Recomputes what p_me shares with each of p_others, refreshes the one-week cache and returns it.
-- Whoever shares nothing gets no row.
create function match_users(p_me text, p_others text[])
returns setof match_view
language plpgsql
as $$
begin
  delete from user_matches where computed_at < now() - interval '7 days';
  delete from user_matches
  where (user_a = p_me and user_b = any(p_others)) or (user_b = p_me and user_a = any(p_others));
  insert into user_matches (user_a, user_b, shared)
  select least(p_me, s.other_id), greatest(p_me, s.other_id), s.shared from shared_topics(p_me, p_others) s;
  return query select * from matches_of(p_me) m where m.other_id = any(p_others);
end
$$;

create function matches_of(p_me text)
returns setof match_view
language sql
stable
as $$
  select o.id, o.display_name, m.shared, m.computed_at
  from user_matches m
  join users o on o.id = case when m.user_a = p_me then m.user_b else m.user_a end
  where p_me in (m.user_a, m.user_b) and m.computed_at >= now() - interval '7 days'
  order by m.computed_at desc
$$;

create type connection_view as (
  other_id text,
  other_name text,
  status text,
  proposed_by_me boolean,
  my_accepted_at timestamptz,
  their_accepted_at timestamptz,
  origin_kind text,
  origin_room_id text,
  origin_label text,
  shared jsonb,
  created_at timestamptz
);

-- The only read path: a connection is returned to one of its two parties, seen from their side.
create function connections_of(p_me text, p_other text default null)
returns setof connection_view
language sql
stable
as $$
  select o.id, o.display_name, c.status, c.proposed_by = p_me,
    case when c.user_a = p_me then c.accepted_a else c.accepted_b end,
    case when c.user_a = p_me then c.accepted_b else c.accepted_a end,
    c.origin_kind, c.origin_room_id, c.origin_label, c.shared, c.created_at
  from connections c
  join users o on o.id = case when c.user_a = p_me then c.user_b else c.user_a end
  where p_me in (c.user_a, c.user_b) and (p_other is null or o.id = p_other)
  order by c.created_at desc
$$;

-- Only whoever did not propose can accept. No row back means there was nothing pending for p_me.
create function accept_connection(p_me text, p_other text)
returns setof connection_view
language plpgsql
as $$
begin
  update connections c set
    accepted_a = case when c.user_a = p_me then now() else c.accepted_a end,
    accepted_b = case when c.user_b = p_me then now() else c.accepted_b end,
    shared = coalesce((select s.shared from shared_topics(p_me, array[p_other]) s), '[]')
  where c.user_a = least(p_me, p_other) and c.user_b = greatest(p_me, p_other)
    and c.status = 'propuesta' and c.proposed_by <> p_me;
  if found then return query select * from connections_of(p_me, p_other); end if;
end
$$;

-- Proposing to someone who already proposed to you is accepting. Proposing twice changes nothing.
-- The origin is a room (its name is copied) or, without one, the place name the phone sends.
create function propose_connection(p_me text, p_other text, p_room_id text default null, p_place text default null)
returns setof connection_view
language plpgsql
as $$
declare
  v_room_id text;
  v_room_name text;
begin
  select id, name into v_room_id, v_room_name from rooms where id = p_room_id;
  insert into connections (user_a, user_b, proposed_by, accepted_a, accepted_b, origin_kind, origin_room_id, origin_label)
  values (
    least(p_me, p_other), greatest(p_me, p_other), p_me,
    case when p_me < p_other then now() end, case when p_me > p_other then now() end,
    case when v_room_id is null then 'lugar' else 'sala' end, v_room_id, coalesce(v_room_name, p_place)
  )
  on conflict (user_a, user_b) do nothing;
  -- Not inserted: the row was already there. If it is the other's proposal, this accepts it.
  if not found then perform accept_connection(p_me, p_other); end if;
  return query select * from connections_of(p_me, p_other);
end
$$;

-- Rejecting a proposal, taking one back and leaving an accepted connection are the same act:
-- the row goes, with its record of what they shared. Either party can propose again later.
create function close_connection(p_me text, p_other text)
returns boolean
language plpgsql
as $$
begin
  delete from connections where user_a = least(p_me, p_other) and user_b = greatest(p_me, p_other);
  return found;
end
$$;

-- Supabase grants execute on new functions to the phone's roles by default.
revoke execute on function
  save_profile(text, text, jsonb, text, text), claim_key(text, text), shared_topics(text, text[]),
  match_users(text, text[]), matches_of(text), connections_of(text, text), accept_connection(text, text),
  propose_connection(text, text, text, text), close_connection(text, text)
from public, anon, authenticated;
grant execute on function
  save_profile(text, text, jsonb, text, text), claim_key(text, text), shared_topics(text, text[]),
  match_users(text, text[]), matches_of(text), connections_of(text, text), accept_connection(text, text),
  propose_connection(text, text, text, text), close_connection(text, text)
to service_role;
