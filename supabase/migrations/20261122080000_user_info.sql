-- Perfil → Información: what a person fills in about themselves. Personal data: its owner reads
-- it and nobody else. It is not part of the projection, of room_members or of any log, which is
-- why it has its own table instead of columns that a join on users could carry along.
-- Whoever has not filled the form has no row.
create table user_info (
  user_id text primary key references users (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 120),
  age smallint not null check (age between 13 and 120),
  gender text not null check (gender in ('Mujer', 'Hombre', 'No binario', 'Prefiero no decir')),
  phone text not null check (phone ~ '^\+?[0-9 ]{8,16}$'),
  occupation text not null default '' check (char_length(occupation) <= 60),
  updated_at timestamptz not null default now()
);

-- No policies: the publishable key reads none of it. The server route checks the device key.
alter table user_info enable row level security;

-- The form can be filled before the first check-in: the user is created here, with their key.
-- An existing user is left as is.
create function ensure_user(p_id text, p_display_name text, p_key_hash text)
returns void
language sql
as $$
  insert into users (id, display_name, key_hash) values (p_id, p_display_name, p_key_hash) on conflict (id) do nothing
$$;

create function save_user_info(p_id text, p_email text, p_age integer, p_gender text, p_phone text, p_occupation text)
returns setof user_info
language sql
as $$
  insert into user_info (user_id, email, age, gender, phone, occupation)
  values (p_id, p_email, p_age, p_gender, p_phone, p_occupation)
  on conflict (user_id) do update set
    email = excluded.email, age = excluded.age, gender = excluded.gender,
    phone = excluded.phone, occupation = excluded.occupation, updated_at = now()
  returning *
$$;

create function user_info_of(p_id text)
returns setof user_info
language sql
stable
as $$
  select * from user_info where user_id = p_id
$$;

revoke execute on function
  ensure_user(text, text, text), save_user_info(text, text, integer, text, text, text), user_info_of(text)
from public, anon, authenticated;
grant execute on function
  ensure_user(text, text, text), save_user_info(text, text, integer, text, text, text), user_info_of(text)
to service_role;
