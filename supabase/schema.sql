-- DECODING HCM — PRODUCTION SCHEMA
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE IF NOT EXISTS profiles(id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,full_name TEXT NOT NULL,role TEXT DEFAULT 'candidate' CHECK(role IN('candidate','admin')),email TEXT,phone TEXT,phone_verified BOOLEAN DEFAULT false,created_at TIMESTAMPTZ DEFAULT now() NOT NULL,updated_at TIMESTAMPTZ DEFAULT now() NOT NULL);
CREATE TABLE IF NOT EXISTS folders(id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),name TEXT NOT NULL UNIQUE,description TEXT DEFAULT '',sort_order INT DEFAULT 0,active BOOLEAN DEFAULT true,created_at TIMESTAMPTZ DEFAULT now() NOT NULL);
CREATE TABLE IF NOT EXISTS tests(id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,title TEXT NOT NULL,language TEXT NOT NULL CHECK(language IN('English','Hindi')),passage TEXT NOT NULL,mode TEXT DEFAULT 'screen' CHECK(mode IN('screen','page','candidate')),duration_minutes INT DEFAULT 10 CHECK(duration_minutes BETWEEN 1 AND 180),target_wpm NUMERIC(6,2) DEFAULT 35,min_accuracy NUMERIC(5,2),free_error_pct NUMERIC(5,4) DEFAULT .05,penalty_per_error INT DEFAULT 10,allow_backspace BOOLEAN DEFAULT false,leaderboard_enabled BOOLEAN DEFAULT true,active BOOLEAN DEFAULT true,created_at TIMESTAMPTZ DEFAULT now() NOT NULL,updated_at TIMESTAMPTZ DEFAULT now() NOT NULL);
CREATE TABLE IF NOT EXISTS attempts(id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,candidate_name TEXT NOT NULL,candidate_id TEXT,test_id UUID REFERENCES tests(id) ON DELETE CASCADE,language TEXT NOT NULL,mode TEXT NOT NULL,duration_seconds INT NOT NULL,typed_words INT NOT NULL,typed_characters INT NOT NULL,correct_characters INT NOT NULL,incorrect_characters INT NOT NULL,total_errors INT NOT NULL,free_errors INT NOT NULL,excess_errors INT NOT NULL,penalty_words INT NOT NULL,gross_wpm NUMERIC(6,2) NOT NULL,net_wpm NUMERIC(6,2) NOT NULL,accuracy NUMERIC(5,2) NOT NULL,suspicious_events JSONB DEFAULT '[]'::jsonb,typed_content TEXT,result_snapshot JSONB,created_at TIMESTAMPTZ DEFAULT now() NOT NULL);
CREATE INDEX IF NOT EXISTS idx_attempts_user_date ON attempts(user_id,created_at DESC);CREATE INDEX IF NOT EXISTS idx_attempts_net_wpm ON attempts(net_wpm DESC);CREATE INDEX IF NOT EXISTS idx_tests_folder_active ON tests(folder_id,active);
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN INSERT INTO public.profiles(id,full_name,email,phone,phone_verified) VALUES(NEW.id,COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''),'Candidate'),NEW.email,NEW.raw_user_meta_data->>'phone',false) ON CONFLICT(id) DO UPDATE SET full_name=EXCLUDED.full_name,email=EXCLUDED.email,phone=COALESCE(EXCLUDED.phone,profiles.phone); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now();RETURN NEW;END;$$;
DROP TRIGGER IF EXISTS profiles_touch ON profiles;CREATE TRIGGER profiles_touch BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS tests_touch ON tests;CREATE TRIGGER tests_touch BEFORE UPDATE ON tests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Admin-managed manual leaderboard entries (also applied via migration_manual_leaderboard.sql)
CREATE TABLE IF NOT EXISTS public.manual_leaderboard_entries (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 candidate_name TEXT NOT NULL,
 language TEXT NOT NULL DEFAULT '-',
 test_name TEXT NOT NULL DEFAULT '-',
 duration_seconds INT,
 gross_wpm NUMERIC(6,2),
 net_wpm NUMERIC(6,2) NOT NULL DEFAULT 0,
 accuracy NUMERIC(5,2),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
 is_manual BOOLEAN NOT NULL DEFAULT true
);
ALTER TABLE public.manual_leaderboard_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read manual leaderboard entries" ON public.manual_leaderboard_entries;
CREATE POLICY "Public can read manual leaderboard entries" ON public.manual_leaderboard_entries FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins manage manual leaderboard entries" ON public.manual_leaderboard_entries;
CREATE POLICY "Admins manage manual leaderboard entries" ON public.manual_leaderboard_entries FOR ALL
 USING (EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin'))
 WITH CHECK (EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin'));
DROP POLICY IF EXISTS "Admins delete attempts" ON public.attempts;
CREATE POLICY "Admins delete attempts" ON public.attempts FOR DELETE
 USING (EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin'));


-- Public leaderboard projection: a narrow table with RLS, populated only by
-- locked-down triggers. It omits user IDs, typed content, anti-cheat events,
-- and result snapshots while avoiding a SECURITY DEFINER view.
CREATE TABLE IF NOT EXISTS public.public_leaderboard_attempts (
 id UUID PRIMARY KEY, candidate_name TEXT NOT NULL, language TEXT NOT NULL,
 duration_seconds INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL,
 gross_wpm NUMERIC NOT NULL, net_wpm NUMERIC NOT NULL, accuracy NUMERIC NOT NULL,
 test_name TEXT NOT NULL DEFAULT '-'
);
ALTER TABLE public.public_leaderboard_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.public_leaderboard_attempts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.public_leaderboard_attempts TO anon, authenticated, service_role;
CREATE POLICY public_leaderboard_projection_read ON public.public_leaderboard_attempts
 FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.sync_public_leaderboard_attempt_projection()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $
DECLARE v_test_name TEXT := '-'; v_enabled BOOLEAN := true;
BEGIN
 IF TG_OP = 'DELETE' THEN
  DELETE FROM public.public_leaderboard_attempts WHERE id = OLD.id;
  RETURN OLD;
 END IF;
 IF NEW.test_id IS NOT NULL THEN
  SELECT t.title, COALESCE(t.leaderboard_enabled,true) INTO v_test_name,v_enabled
  FROM public.tests t WHERE t.id=NEW.test_id;
  IF NOT FOUND THEN v_test_name:='-'; v_enabled:=true; END IF;
 END IF;
 IF v_enabled THEN
  INSERT INTO public.public_leaderboard_attempts
   (id,candidate_name,language,duration_seconds,created_at,gross_wpm,net_wpm,accuracy,test_name)
  VALUES (NEW.id,NEW.candidate_name,NEW.language,NEW.duration_seconds,NEW.created_at,NEW.gross_wpm,NEW.net_wpm,NEW.accuracy,COALESCE(v_test_name,'-'))
  ON CONFLICT (id) DO UPDATE SET candidate_name=EXCLUDED.candidate_name,language=EXCLUDED.language,
   duration_seconds=EXCLUDED.duration_seconds,created_at=EXCLUDED.created_at,gross_wpm=EXCLUDED.gross_wpm,
   net_wpm=EXCLUDED.net_wpm,accuracy=EXCLUDED.accuracy,test_name=EXCLUDED.test_name;
 ELSE
  DELETE FROM public.public_leaderboard_attempts WHERE id=NEW.id;
 END IF;
 RETURN NEW;
END; $;
REVOKE ALL ON FUNCTION public.sync_public_leaderboard_attempt_projection() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_public_leaderboard_test_projection()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $
BEGIN
 IF NEW.leaderboard_enabled THEN
  INSERT INTO public.public_leaderboard_attempts
   (id,candidate_name,language,duration_seconds,created_at,gross_wpm,net_wpm,accuracy,test_name)
  SELECT a.id,a.candidate_name,a.language,a.duration_seconds,a.created_at,a.gross_wpm,a.net_wpm,a.accuracy,NEW.title
  FROM public.attempts a WHERE a.test_id=NEW.id
  ON CONFLICT (id) DO UPDATE SET candidate_name=EXCLUDED.candidate_name,language=EXCLUDED.language,
   duration_seconds=EXCLUDED.duration_seconds,created_at=EXCLUDED.created_at,gross_wpm=EXCLUDED.gross_wpm,
   net_wpm=EXCLUDED.net_wpm,accuracy=EXCLUDED.accuracy,test_name=EXCLUDED.test_name;
 ELSE
  DELETE FROM public.public_leaderboard_attempts p
  WHERE p.id IN (SELECT a.id FROM public.attempts a WHERE a.test_id=NEW.id);
 END IF;
 RETURN NEW;
END; $;
REVOKE ALL ON FUNCTION public.sync_public_leaderboard_test_projection() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER attempts_sync_public_leaderboard_projection
 AFTER INSERT OR UPDATE OR DELETE ON public.attempts
 FOR EACH ROW EXECUTE FUNCTION public.sync_public_leaderboard_attempt_projection();
CREATE TRIGGER tests_sync_public_leaderboard_projection
 AFTER UPDATE OF title, leaderboard_enabled ON public.tests
 FOR EACH ROW EXECUTE FUNCTION public.sync_public_leaderboard_test_projection();

INSERT INTO public.public_leaderboard_attempts
 (id,candidate_name,language,duration_seconds,created_at,gross_wpm,net_wpm,accuracy,test_name)
SELECT a.id,a.candidate_name,a.language,a.duration_seconds,a.created_at,a.gross_wpm,a.net_wpm,a.accuracy,COALESCE(t.title,'-')
FROM public.attempts a LEFT JOIN public.tests t ON t.id=a.test_id
WHERE COALESCE(t.leaderboard_enabled,true)=true
ON CONFLICT (id) DO UPDATE SET candidate_name=EXCLUDED.candidate_name,language=EXCLUDED.language,
 duration_seconds=EXCLUDED.duration_seconds,created_at=EXCLUDED.created_at,gross_wpm=EXCLUDED.gross_wpm,
 net_wpm=EXCLUDED.net_wpm,accuracy=EXCLUDED.accuracy,test_name=EXCLUDED.test_name;


-- Homepage notices, timed offers and admin-managed promotional content
CREATE TABLE IF NOT EXISTS public.site_announcements (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', image_url TEXT,
 content_type TEXT NOT NULL DEFAULT 'notice' CHECK (content_type IN ('notice','offer','announcement','event','maintenance','featured')),
 theme TEXT NOT NULL DEFAULT 'aurora' CHECK (theme IN ('aurora','gold','blue','rose','green')),
 cta_label TEXT, cta_url TEXT, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
 is_active BOOLEAN NOT NULL DEFAULT true, is_public BOOLEAN NOT NULL DEFAULT true, sort_order INTEGER NOT NULL DEFAULT 0,
 created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.site_announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read active site announcements" ON public.site_announcements;
CREATE POLICY "Public can read active site announcements" ON public.site_announcements FOR SELECT TO anon, authenticated USING (is_active = true AND is_public = true);
DROP POLICY IF EXISTS "Admins can manage site announcements" ON public.site_announcements;
CREATE POLICY "Admins can manage site announcements" ON public.site_announcements FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE INDEX IF NOT EXISTS site_announcements_public_sort ON public.site_announcements (is_active, is_public, sort_order, starts_at, ends_at);
