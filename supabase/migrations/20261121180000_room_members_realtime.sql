-- The room screen shows people arriving, so check-ins have to be pushed too.
alter publication supabase_realtime add table room_members;
