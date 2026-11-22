-- A mesa keeps who is in it (mesas.members) and what mattered inside it: the main decisions of
-- its agents, which are the rows of deliberation_messages. Everything else an agent or a person
-- did goes to logs. Mesas, plans and decisions are read by the whole room, as before; logs are not.

-- "My mesas": mesas.members @> '[{"personId": "…"}]'.
create index mesas_members_idx on mesas using gin (members jsonb_path_ops);

-- Append-only. A row is the measurement of something that happened (who, in which mesa, when,
-- a short code), never the prompt, the day's intent or what a member agent wrote.
create table logs (
  id bigint generated always as identity primary key,
  -- Whose agent or which person. Null for the facilitator, the verifier and the room engine.
  user_id text references users (id) on delete cascade,
  mesa_id text references mesas (id) on delete cascade,
  actor text not null check (actor in ('facilitador', 'miembro', 'verificador', 'motor', 'persona')),
  event text not null check (char_length(event) between 1 and 40),
  detail jsonb not null default '{}' check (octet_length(detail::text) <= 4096),
  created_at timestamptz not null default now(),
  check (user_id is not null or mesa_id is not null)
);
create index on logs (mesa_id, created_at);
create index on logs (user_id, created_at);

-- No policies and not in Realtime: a person reads the rows of their own agent through a server
-- route; the rest is for the server.
alter table logs enable row level security;

-- A decision belongs to a mesa and goes when the mesa goes. It points to the log of the agent
-- call that produced it, which holds the measurement and expires on its own.
alter table deliberation_messages
  add constraint deliberation_messages_mesa_id_fkey foreign key (mesa_id) references mesas (id) on delete cascade,
  add column log_id bigint references logs (id) on delete set null;
create index on deliberation_messages (mesa_id, created_at);

-- shortcut: expired logs are swept on every insert with a scan, fine for the few thousand rows
-- of an event. Move it to a scheduled job if the table ever gets large.
create function write_log(p_actor text, p_event text, p_detail jsonb default '{}', p_user_id text default null, p_mesa_id text default null)
returns bigint
language plpgsql
as $$
declare
  v_id bigint;
begin
  delete from logs where created_at < now() - interval '7 days';
  insert into logs (user_id, mesa_id, actor, event, detail)
  values (p_user_id, p_mesa_id, p_actor, p_event, p_detail)
  returning id into v_id;
  return v_id;
end
$$;

-- The room comes from the mesa, so a decision cannot be filed under another room.
-- Null when the mesa does not exist.
create function record_decision(p_mesa_id text, p_agent text, p_content jsonb, p_person_id text default null, p_log_id bigint default null)
returns bigint
language sql
as $$
  insert into deliberation_messages (room_id, mesa_id, agent, person_id, content, log_id)
  select m.room_id, m.id, p_agent, p_person_id, p_content, p_log_id from mesas m where m.id = p_mesa_id
  returning id
$$;

-- Only the rows of that person's own agent, newest first.
create function logs_of(p_me text, p_mesa_id text default null)
returns table (id bigint, mesa_id text, actor text, event text, detail jsonb, created_at timestamptz)
language sql
stable
as $$
  select l.id, l.mesa_id, l.actor, l.event, l.detail, l.created_at
  from logs l
  where l.user_id = p_me and (p_mesa_id is null or l.mesa_id = p_mesa_id)
    and l.created_at >= now() - interval '7 days'
  order by l.created_at desc, l.id desc
  limit 200
$$;

revoke execute on function
  write_log(text, text, jsonb, text, text), record_decision(text, text, jsonb, text, bigint), logs_of(text, text)
from public, anon, authenticated;
grant execute on function
  write_log(text, text, jsonb, text, text), record_decision(text, text, jsonb, text, bigint), logs_of(text, text)
to service_role;
