document.addEventListener("DOMContentLoaded", async () => {
    const leaderboardBody = document.getElementById("leaderboard-body");
    if (!leaderboardBody) return;

    const escapeHtml = value => String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    if (typeof supabaseClient === "undefined" || !supabaseClient) {
        leaderboardBody.innerHTML = '<tr><td colspan="6">Leaderboard is temporarily unavailable.</td></tr>';
        return;
    }

    try {
        const { data: topAttempts, error } = await supabaseClient
            .from("attempts")
            .select("id, candidate_name, language, gross_wpm, net_wpm, accuracy, test_id, tests!inner(leaderboard_enabled)")
            .eq("tests.leaderboard_enabled", true)
            .order("net_wpm", { ascending: false })
            .limit(50);

        if (error) throw error;

        if (!topAttempts || topAttempts.length === 0) {
            leaderboardBody.innerHTML = '<tr><td colspan="6">No entries found on leaderboard.</td></tr>';
            return;
        }

        leaderboardBody.innerHTML = topAttempts.map((attempt, index) => `
            <tr>
                <td><strong>#${index + 1}</strong></td>
                <td>${escapeHtml(attempt.candidate_name)}</td>
                <td>${escapeHtml(attempt.language)}</td>
                <td>${escapeHtml(attempt.gross_wpm)}</td>
                <td><strong style="color: var(--primary-blue);">${escapeHtml(attempt.net_wpm)} WPM</strong></td>
                <td>${escapeHtml(attempt.accuracy)}%</td>
            </tr>
        `).join("");
    } catch (error) {
        console.error("Unable to load leaderboard:", error);
        leaderboardBody.innerHTML = '<tr><td colspan="6">Unable to load leaderboard. Please try again later.</td></tr>';
    }
});
