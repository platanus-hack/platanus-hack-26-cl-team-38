-- Check-in goes through POST /api/checkin, which runs the privacy filter and writes with the
-- service role. With these two policies the publishable key that ships to every phone could
-- insert or rewrite anyone's projection without any check.
drop policy "check in" on room_members;
drop policy "update own projection" on room_members;
