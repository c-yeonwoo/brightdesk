CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(lower(email));

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_profiles select own" ON public.user_profiles;
CREATE POLICY "user_profiles select own" ON public.user_profiles
  FOR SELECT
  USING (auth.uid() = id);

GRANT SELECT ON public.user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO service_role;

CREATE OR REPLACE FUNCTION public.set_user_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_user_profiles_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    display_name = COALESCE(public.user_profiles.display_name, EXCLUDED.display_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.user_profiles.avatar_url),
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user_profile();

INSERT INTO public.user_profiles (id, email, display_name, avatar_url)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'name', raw_user_meta_data->>'full_name'),
  raw_user_meta_data->>'avatar_url'
FROM auth.users
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  display_name = COALESCE(public.user_profiles.display_name, EXCLUDED.display_name),
  avatar_url = COALESCE(EXCLUDED.avatar_url, public.user_profiles.avatar_url),
  updated_at = now();
