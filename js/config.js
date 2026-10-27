// DECODING HCM - environment-aware Supabase initialization.
// Production hostnames use production; non-production Vercel previews use staging.
const PRODUCTION_SUPABASE_URL = "https://nuqfmjgkyfychhwzwnfl.supabase.co";
const PRODUCTION_SUPABASE_ANON_KEY = "sb_publishable_qs5b_5S5CphfZSYxqSiV8A_18XR4Gra";
const STAGING_SUPABASE_URL = "https://lhuqykxddwdkwksdzqth.supabase.co";
const STAGING_SUPABASE_ANON_KEY = "sb_publishable_8HnMuDTqbrml8JfB3JyURA_KHzDU8-u";
const PRODUCTION_HOSTNAMES = new Set([
    "decoding-hcm.vercel.app",
    "final-1-decoding-hcn.vercel.app",
    "final-1-git-main-decoding-hcn.vercel.app"
]);
const currentHostname = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
const useStagingSupabase = currentHostname === "localhost" || currentHostname === "127.0.0.1" ||
    (currentHostname.endsWith(".vercel.app") && !PRODUCTION_HOSTNAMES.has(currentHostname));
const SUPABASE_URL = useStagingSupabase ? STAGING_SUPABASE_URL : PRODUCTION_SUPABASE_URL;
const SUPABASE_ANON_KEY = useStagingSupabase ? STAGING_SUPABASE_ANON_KEY : PRODUCTION_SUPABASE_ANON_KEY;

// Initialize Supabase Client globally loaded via CDN in HTML
let supabaseClient = null;

if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.error("Supabase SDK failed to load. Check CDN connectivity.");
}

const CONFIG = {
    APP_NAME: "Decoding HCM Typing Test Lab",
    OFFICIAL_BRAND: "DECODING HCM",
    EXAM_TARGET: "BSF HCM Typing Practice",
    DEFAULT_FREE_ERROR_PCT: 0.05, // 5% Permissible free errors
    DEFAULT_PENALTY_PER_ERROR: 10 // 10 words deducted per excess error
};
