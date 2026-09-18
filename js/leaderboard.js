document.addEventListener("DOMContentLoaded", async () => {
    const leaderboardBody = document.getElementById("leaderboard-body");
    if (!supabaseClient) return;

    const { data: topAttempts, error } = await supabaseClient
        .from("attempts")
        .select("*")
        .order("net_wpm", { ascending: false })
        .limit(50);

    if (error || !topAttempts || topAttempts.length === 0) {
        leaderboardBody.innerHTML = `<tr><td colspan="6">No entries found on leaderboard.</td></tr>`;
        return;
    }

    leaderboardBody.innerHTML = topAttempts.map((a, idx) => `
        <tr>
            <td><strong>#${idx + 1}</strong></td>
            <td>${a.candidate_name}</td>
            <td>${a.language}</td>
            <td>${a.gross_wpm}</td>
            <td><strong style="color: var(--primary-blue);">${a.net_wpm} WPM</strong></td>
            <td>${a.accuracy}%</td>
        </tr>
    `).join("");
});
