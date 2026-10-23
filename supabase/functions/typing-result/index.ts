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

function tokenize(text: string): string[] {
  return (text.match(/\S+/gu) || []);
}

function alignWords(expected: string[], typed: string[]) {
  // Keep the exact typed prefix tied to the same original positions. A later
  // duplicate word must not cause an earlier correct sequence to be omitted.
  let prefix = 0;
  while (prefix < expected.length && prefix < typed.length && expected[prefix] === typed[prefix]) prefix++;
  const prefixMatches = Array.from({ length: prefix }, (_, i) => ({ type: "match", expected: expected[i], typed: typed[i] }));
  expected = expected.slice(prefix); typed = typed.slice(prefix);
  const n = expected.length, m = typed.length;
  if ((n + 1) * (m + 1) > 2_000_000) throw new Error("Passage or typed text is too long to score safely.");
  // Suffix edit-distance + forward traceback: duplicate words bind to the
  // earliest expected occurrence on an equally optimal alignment, preventing
  // later duplicates from making intervening words look omitted.
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n; i >= 0; i--) dp[i][m] = n - i;
  for (let j = m; j >= 0; j--) dp[n][j] = m - j;
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    if (expected[i] === typed[j]) dp[i][j] = dp[i + 1][j + 1];
    else dp[i][j] = 1 + Math.min(dp[i + 1][j + 1], dp[i + 1][j], dp[i][j + 1]);
  }
  const result: Array<{type:string; expected:string|null; typed:string|null}> = [...prefixMatches];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && expected[i] === typed[j] && dp[i][j] === dp[i + 1][j + 1]) {
      result.push({ type: "match", expected: expected[i], typed: typed[j] }); i++; j++; continue;
    }
    const sub = i < n && j < m ? 1 + dp[i + 1][j + 1] : Infinity;
    const del = i < n ? 1 + dp[i + 1][j] : Infinity;
    const ins = j < m ? 1 + dp[i][j + 1] : Infinity;
    const best = dp[i][j];
    if (sub === best) { result.push({ type: "substitute", expected: expected[i], typed: typed[j] }); i++; j++; }
    else if (del === best) { result.push({ type: "delete", expected: expected[i], typed: null }); i++; }
    else if (ins === best) { result.push({ type: "insert", expected: null, typed: typed[j] }); j++; }
    else throw new Error("Unable to align typed words");
  }
  return result;
}

function editDistance(a: string, b: string): number {
  if (a.length > b.length) return editDistance(b, a);
  let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
  let curr = new Array<number>(a.length + 1);
  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      curr[i] = Math.min(curr[i - 1] + 1, prev[i] + 1, prev[i - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length];
}

function calculateScore(passage: string, typedText: string, seconds: number, test: Record<string, unknown>, formula = "bsf") {
  const expected = tokenize(passage), typed = tokenize(typedText);
  const mode = formula.toLowerCase() === "crpf" ? "crpf" : "bsf";
  let alignment: Array<{type:string; expected:string|null; typed:string|null}> = [];
  let wordErrors = 0, correctWords = 0;
  const doubleSpaceErrors = (typedText.match(/ {2,}/g) || []).length;
  if (mode === "crpf") {
    // CRPF uses strict original-position word comparison; spaces must not create phantom empty words and cascade into false errors.
    const normalized = typedText.trim();
    const slots = normalized.length ? normalized.split(" ") : [];
    for (let i = 0; i < Math.max(expected.length, slots.length); i++) {
      const e = expected[i] ?? null, t = slots[i] ?? null;
      if (t === null) { alignment.push({type:"delete", expected:e, typed:null}); continue; }
      if (t === "") { alignment.push({type:"delete", expected:e, typed:null}); wordErrors++; continue; }
      if (e === null) { alignment.push({type:"insert", expected:null, typed:t}); wordErrors++; }
      else if (e === t) { alignment.push({type:"match", expected:e, typed:t}); correctWords++; }
      else { alignment.push({type:t === "" ? "delete" : "substitute", expected:e, typed:t}); wordErrors++; }
    }
  } else {
    alignment = alignWords(expected, typed);
    for (let i = 0; i < alignment.length; i++) {
      const item = alignment[i];
      if (item.type === "match") { correctWords++; continue; }
      if (item.type === "delete" && !alignment.slice(i + 1).some(next => next.type !== "delete")) continue;
      wordErrors++;
    }
    wordErrors += doubleSpaceErrors;
  }
  const lastReachedAlignmentIndex = alignment.reduce((last, item, i) => item.type !== "delete" ? i : last, -1);
  const totalErrors = wordErrors;
  // Anti-inflation cap mirrors the client: cap each typed word at the original word length at the same index, ignore extra-word characters, and cap spaces to original separators.
  const cappedWordKeystrokes = typed.reduce((sum, word, i) => sum + Math.min(word.length, expected[i]?.length ?? 0), 0);
  const cappedSeparatorKeystrokes = Math.min((typedText.match(/\s/gu) || []).length, Math.max(0, expected.length - 1));
  const measuredKeystrokes = cappedWordKeystrokes + cappedSeparatorKeystrokes;
  const equivalentTypedWords = measuredKeystrokes / 5;
  const freePct = Math.max(0, Math.min(0.2, Number(test.free_error_pct ?? 0.05)));
  const penaltyPerError = Math.max(0, Math.min(100, Number(test.penalty_per_error ?? 10)));
  const freeErrors = equivalentTypedWords * freePct;
  const excessErrors = Math.max(0, totalErrors - freeErrors);
  const penaltyWords = excessErrors * penaltyPerError;
  const netWords = Math.max(0, equivalentTypedWords - penaltyWords);
  const elapsedMinutes = Math.max(seconds, 1) / 60;
  const grossWpm = Number((equivalentTypedWords / elapsedMinutes).toFixed(2));
  const netWpm = Number((netWords / elapsedMinutes).toFixed(2));
  let correctChars = 0, alignedPairs = 0, omittedErrorChars = 0;
  for (let i = 0; i < alignment.length; i++) {
    const item = alignment[i];
    if (item.type === "delete" && item.expected !== null && i > lastReachedAlignmentIndex) continue;
    if (item.type === "delete" && item.expected !== null) { omittedErrorChars += Math.min(5, item.expected.length); continue; }
    if (item.expected === null || item.typed === null) continue;
    correctChars += Math.max(0, item.typed.length - editDistance(item.expected, item.typed));
    alignedPairs++;
  }
  const typedSeparators = (typedText.match(/\s/gu) || []).length;
  correctChars += Math.min(typedSeparators, Math.max(0, typed.length - 1), Math.max(0, alignedPairs - 1));
  correctChars = Math.max(0, Math.min(typedText.length, correctChars - omittedErrorChars));
  const incorrectChars = Math.max(0, typedText.length - correctChars);
  const accuracy = typedText.length ? Number((correctChars / typedText.length * 100).toFixed(2)) : 0;
  // Primary categories are mutually exclusive; repeatedWords is a subset of extraWords.
  const errorBreakdown = { omissions: 0, substitutions: 0, spellingErrors: 0, incompleteWords: 0, extraWords: 0, repeatedWords: 0, spacingErrors: mode === "bsf" ? doubleSpaceErrors : 0, capitalizationErrors: 0, punctuationErrors: 0, notReached: 0 };
  for (let i = 0; i < alignment.length; i++) {
    const item = alignment[i];
    if (item.type === "delete" && item.expected !== null) {
      const trailing = i > lastReachedAlignmentIndex;
      if (trailing) errorBreakdown.notReached++;
      else errorBreakdown.omissions++;
    } else if (item.type === "insert") {
      errorBreakdown.extraWords++;
      if (i > 0 && alignment[i - 1].typed !== null && alignment[i - 1].typed === item.typed) errorBreakdown.repeatedWords++;
    } else if (item.type === "substitute") {
      const e = String(item.expected ?? ""), t = String(item.typed ?? "");
      const lowerE = e.toLocaleLowerCase(), lowerT = t.toLocaleLowerCase();
      const bareE = lowerE.replace(/[^\p{L}\p{N}]/gu, ""), bareT = lowerT.replace(/[^\p{L}\p{N}]/gu, "");
      if (lowerE === lowerT && e !== t) errorBreakdown.capitalizationErrors++;
      else if (bareE === bareT && e !== t) errorBreakdown.punctuationErrors++;
      else if (t.length > 0 && t.length < e.length && lowerE.startsWith(lowerT)) errorBreakdown.incompleteWords++;
      else if (editDistance(lowerE, lowerT) <= Math.max(1, Math.floor(Math.min(e.length, t.length) * 0.25))) errorBreakdown.spellingErrors++;
      else errorBreakdown.substitutions++;
    }
  }
  const targetWpm = test.target_wpm == null ? null : Number(test.target_wpm);
  const minAccuracy = test.min_accuracy == null ? null : Number(test.min_accuracy);
  const passedByWpm = targetWpm === null || netWpm >= targetWpm;
  const passedByAccuracy = minAccuracy === null || accuracy >= minAccuracy;
  return {
    formula: mode, totalTypedWords: typed.length, totalTypedChars: typedText.length, totalKeystrokes: measuredKeystrokes,
    equivalentTypedWords: Number(equivalentTypedWords.toFixed(2)), correctChars, incorrectChars, correctWords,
    wordErrors, doubleSpaceErrors, totalErrors, freeErrors: Number(freeErrors.toFixed(2)), excessErrors: Number(excessErrors.toFixed(2)), penaltyWords: Number(penaltyWords.toFixed(2)),
    netWords: Number(netWords.toFixed(2)), grossWpm, netWpm, accuracy, elapsedMinutes: Number(elapsedMinutes.toFixed(2)), elapsedSeconds: Math.max(seconds, 1), attemptingTimeSeconds: Math.max(seconds, 1), penaltyWpm: Number((penaltyWords / elapsedMinutes).toFixed(2)), allowedErrors: Number(freeErrors.toFixed(2)),
    alignment: mode === "bsf" ? alignment.filter((item, i) => !(item.type === "delete" && i > lastReachedAlignmentIndex)) : alignment.filter((item, i) => !(item.type === "delete" && item.typed === null && i >= typed.length)), errorBreakdown, minAccuracy, targetWpm, passedByWpm, passedByAccuracy, passed: passedByWpm && passedByAccuracy,
  };
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
      const scoreBsf = calculateScore(String(test.passage || ""), typedText, durationSeconds, test, "bsf");
      const scoreCrpf = calculateScore(String(test.passage || ""), typedText, durationSeconds, test, "crpf");
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
