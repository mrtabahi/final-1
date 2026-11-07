-- Allow signed-in users to update their own profile row.
-- Row-level security remains the ownership boundary; anon receives no UPDATE grant.
GRANT UPDATE ON TABLE public.profiles TO authenticated;
