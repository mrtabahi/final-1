// Supabase Edge Function: server-authoritative typing attempt creation.
// Deploy with: supabase functions deploy typing-result
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Canonical scoring implementation is shared with the browser at js/typing-master.js.
// The Edge Function adapts database snake_case config to the same master API, then
// persists the server-calculated result so clients cannot submit arbitrary scores.
import "../../../js/typing-master.js";

const TypingMaster = (globalThis as unknown as { TypingMaster?: { calculateScore: (...args: unknown[]) => Record<string, any> } }).TypingMaster;
if (!TypingMaster) throw new Error("Shared typing master engine failed to load.");

function calculateScore(
  passage: string,
  typedText: string,
  seconds: number,
  test: Record<string, unknown>,
  formula = "bsf",
  backspacePresses = 0
) {
  return TypingMaster.calculateScore(
    passage,
    typedText,
    seconds,
    {
      freeErrorPct: Number(test.free_error_pct ?? 0.05),
      penaltyPerError: Number(test.penalty_per_error ?? 10),
      targetWpm: test.target_wpm == null ? null : Number(test.target_wpm),
      minAccuracy: test.min_accuracy == null ? null : Number(test.min_accuracy)
    },
    null,
    formula,
    backspacePresses
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!url || !anonKey || !serviceKey || !token) return reply(401, { error: "Authentication required" });

  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return reply(401, { error: "Invalid session" });
  const user = authData.user;
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const body = await req.json();
    if (body.action === "start") {
      if (typeof body.test_id !== "string") return reply(400, { error: "test_id is required" });
      const { data: test, error: testError } = await db.from("tests").select("id,active,duration_minutes,folder_id").eq("id", body.test_id).eq("active", true).maybeSingle();
      if (testError || !test) return reply(404, { error: "Active test not found" });
      if (test.folder_id) {
        const { data: folder, error: folderError } = await db.from("folders").select("id").eq("id", test.folder_id).eq("active", true).maybeSingle();
        if (folderError || !folder) return reply(404, { error: "This test is currently unavailable because its folder is disabled." });
      }
      const { data: profile, error: profileError } = await db.from("profiles").select("id").eq("id", user.id).maybeSingle();
      if (profileError || !profile) return reply(403, { error: "Candidate profile not found" });
      const { data: session, error } = await db.from("typing_exam_sessions").insert({ user_id: user.id, test_id: test.id }).select("id,started_at").single();
      if (error || !session) return reply(500, { error: "Unable to start a secure typing session" });
      return reply(200, { session_id: session.id, started_at: session.started_at, duration_seconds: Number(test.duration_minutes) * 60 });
    }

    if (body.action === "submit") {
      const sessionId = body.session_id;
      const typedText = body.typed_text;
      const backspacePresses = Number.isFinite(Number(body.backspace_presses)) ? Math.max(0, Math.min(100000, Math.floor(Number(body.backspace_presses)))) : 0;
      const requestedMode = body.mode;
      if (typeof sessionId !== "string" || typeof typedText !== "string") return reply(400, { error: "session_id and typed_text are required" });
      if (requestedMode !== undefined && requestedMode !== "screen" && requestedMode !== "page") return reply(400, { error: "mode must be screen or page" });
      if (typedText.length > 50000) return reply(413, { error: "Typed text is too long" });
      const { data: session, error: sessionError } = await db.from("typing_exam_sessions").select("id,user_id,test_id,started_at,submitted_at").eq("id", sessionId).eq("user_id", user.id).maybeSingle();
      if (sessionError || !session) return reply(404, { error: "Typing session not found" });
      if (session.submitted_at) return reply(409, { error: "This typing session has already been submitted" });
      const { data: test, error: testError } = await db.from("tests").select("id,title,language,mode,duration_minutes,passage,target_wpm,min_accuracy,free_error_pct,penalty_per_error,active").eq("id", session.test_id).maybeSingle();
      if (testError || !test) return reply(404, { error: "Test not found" });
      const { data: profile, error: profileError } = await db.from("profiles").select("id,full_name").eq("id", user.id).maybeSingle();
      if (profileError || !profile) return reply(403, { error: "Candidate profile not found" });
      const now = Date.now();
      const startedAt = new Date(session.started_at).getTime();
      if (!Number.isFinite(startedAt) || startedAt > now + 5000) return reply(400, { error: "Invalid session start time" });
      const actualElapsed = Math.max(1, Math.floor((now - startedAt) / 1000));
      const durationSeconds = Math.min(actualElapsed, Math.max(1, Number(test.duration_minutes) * 60));
      const scoreBsf = calculateScore(String(test.passage || ""), typedText, durationSeconds, test, "bsf", backspacePresses);
      const scoreCrpf = calculateScore(String(test.passage || ""), typedText, durationSeconds, test, "crpf", backspacePresses);
      const score = scoreBsf;
      const { data: attempt, error: insertError } = await db.from("attempts").insert({
        session_id: session.id, user_id: user.id, candidate_name: profile.full_name || "Candidate",
        candidate_id: user.id, test_id: test.id, language: test.language, mode: requestedMode || (test.mode === "page" ? "page" : "screen"),
        duration_seconds: durationSeconds, typed_words: score.totalTypedWords,
        typed_characters: score.totalTypedChars, correct_characters: score.correctChars,
        incorrect_characters: score.incorrectChars, total_errors: score.totalErrors,
        free_errors: score.freeErrors, excess_errors: score.excessErrors, penalty_words: score.penaltyWords,
        gross_wpm: score.grossWpm, net_wpm: score.netWpm, accuracy: score.accuracy,
        suspicious_events: [], typed_content: typedText, result_snapshot: { score, scores: { bsf: scoreBsf, crpf: scoreCrpf }, server_validated: true }
      }).select("id,created_at").single();
      if (insertError || !attempt) {
        if (insertError?.code === "23505") return reply(409, { error: "This typing session has already been submitted" });
        console.error("attempt insert failed", insertError);
        return reply(500, { error: "Unable to save typing result" });
      }
      await db.from("typing_exam_sessions").update({ submitted_at: new Date().toISOString() }).eq("id", session.id).is("submitted_at", null);
      return reply(200, { attempt_id: attempt.id, created_at: attempt.created_at, score, scores: { bsf: scoreBsf, crpf: scoreCrpf }, test: { title: test.title, language: test.language, mode: test.mode }, duration_seconds: durationSeconds });
    }

    return reply(400, { error: "Unsupported action" });
  } catch (error) {
    console.error("typing-result error", error);
    return reply(400, { error: error instanceof Error ? error.message : "Invalid request" });
  }
});
