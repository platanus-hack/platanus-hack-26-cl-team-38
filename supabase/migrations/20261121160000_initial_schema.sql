-- Everything here is public-layer data for the duration of an event; rooms are wiped when they close.

create table rooms (
  id text primary key,
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table room_members (
  room_id text not null references rooms (id) on delete cascade,
  person_id text not null,
  display_name text not null,
  projection jsonb not null,
  checked_in_at timestamptz not null default now(),
  primary key (room_id, person_id)
);

create table mesas (
  id text primary key,
  room_id text not null references rooms (id) on delete cascade,
  anchor_theme_id text not null,
  members jsonb not null,
  score double precision not null,
  created_at timestamptz not null default now()
);

create table group_nodes (
  id text primary key,
  room_id text not null references rooms (id) on delete cascade,
  mesa_id text references mesas (id) on delete set null,
  theme text not null,
  members jsonb not null,
  comparten jsonb not null default '[]',
  plan text not null,
  punto_de_encuentro text not null,
  aceptado jsonb not null default '{}',
  status text not null default 'propuesta' check (status in ('propuesta', 'activa', 'disuelta')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table deliberation_messages (
  id bigint generated always as identity primary key,
  room_id text not null references rooms (id) on delete cascade,
  mesa_id text not null,
  agent text not null check (agent in ('facilitador', 'miembro', 'verificador')),
  person_id text,
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index on room_members (room_id);
create index on mesas (room_id);
create index on group_nodes (room_id);
create index on deliberation_messages (room_id, created_at);

-- Realtime needs the old row on updates so the room screen can diff acceptances.
alter table group_nodes replica identity full;
alter publication supabase_realtime add table mesas, group_nodes, deliberation_messages;

-- The anon key ships to phones: it can read the room and check in / accept, but mesas and
-- deliberation are written only by server routes with the service role, which bypasses RLS.
alter table rooms enable row level security;
alter table room_members enable row level security;
alter table mesas enable row level security;
alter table group_nodes enable row level security;
alter table deliberation_messages enable row level security;

create policy "public read" on rooms for select using (true);
create policy "public read" on room_members for select using (true);
create policy "public read" on mesas for select using (true);
create policy "public read" on group_nodes for select using (true);
create policy "public read" on deliberation_messages for select using (true);

create policy "check in" on room_members for insert with check (true);
create policy "update own projection" on room_members for update using (true);
create policy "leave room" on room_members for delete using (true);
create policy "accept or reject" on group_nodes for update using (true);
