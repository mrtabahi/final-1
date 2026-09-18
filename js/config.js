// DECODING HCM - SUPABASE ENVIRONMENT INITIALIZATION
const SUPABASE_URL = "https://nuqfmjgkyfychhwzwnfl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_qs5b_5S5CphfZSYxqSiV8A_18XR4Gra";

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
