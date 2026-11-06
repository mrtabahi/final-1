document.addEventListener('DOMContentLoaded', async () => {
  const candidateStatus = await AuthManager.requireCandidateGuard();
  if (!candidateStatus?.ok) return;
  'use strict';
  const $ = id => document.getElementById(id);
  let expected = ArcadeWordBank.takeWords(90);
  const committed = [];
  let committedText = '';
  let startedAt = 0, timer = null, backspaces = 0, finished = false, duration = 30, nitroStreak = 0, bestNitro = 0, trackMode = 'clean';
  const personalBestKey = 'dch-speed-sprint-best-net-wpm-v1';
  const readPersonalBest = () => { try { return Math.max(0, Number(localStorage.getItem(personalBestKey)) || 0); } catch { return 0; } };
  const input = $('sprint-input');
  const elapsed = () => startedAt ? Math.max(0.001, (performance.now() - startedAt) / 1000) : 0.001;
  const pct = () => Math.min(100, committed.length / expected.length * 100);
  function paint() {
    $('sprint-target').textContent = expected[committed.length] || 'FINISH';
    $('sprint-word-count').textContent = committed.length + ' / ' + expected.length;
    $('sprint-progress').style.width = pct() + '%';
    $('sprint-car').style.left = pct() + '%';
    const best = readPersonalBest();
    const ghostPct = best ? Math.min(100, best * elapsed() / 60 / expected.length * 100) : 0;
    $('sprint-ghost').style.left = ghostPct + '%';
    $('sprint-ghost-gap').textContent = best ? (committed.length - Math.round(best * elapsed() / 60) >= 0 ? 'YOU LEAD BY ' : 'GHOST LEADS BY ') + Math.abs(committed.length - Math.round(best * elapsed() / 60)) + ' WORDS' : 'SET A PERSONAL BEST TO UNLOCK';
  }
  function update() {
    if (finished) return;
    const seconds = elapsed(), remaining = Math.max(0, duration - seconds);
    const scores = ArcadeScoring.calculate(expected, committedText, input.value, seconds, backspaces, false);
    $('sprint-clock').textContent = remaining.toFixed(1);
    $('sprint-gross').textContent = scores.bsf.grossWpm.toFixed(2);
    $('sprint-net').textContent = scores.bsf.netWpm.toFixed(2);
    $('sprint-accuracy').textContent = scores.bsf.accuracy.toFixed(2) + '%';
    $('sprint-errors').textContent = String(scores.bsf.totalErrors);
    $('sprint-nitro').textContent = String(nitroStreak) + ' / BEST ' + bestNitro;
    if (remaining <= 0) finish(duration + '-second finish line reached');
  }
  function commitWord() {
    const raw = input.value;
    const word = raw.trim();
    input.value = '';
    committedText += raw;
    if (!word) return;
    committed.push(word);
    if (word === expected[committed.length - 1]) { nitroStreak++; bestNitro = Math.max(bestNitro,nitroStreak); } else nitroStreak = 0;
    $('sprint-play').dataset.nitro = trackMode === 'nitro' && nitroStreak > 0 ? 'true' : 'false';
    paint();
    if (committed.length >= expected.length) finish('Race course completed');
  }
  function finish(reason) {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    input.disabled = true;
    const seconds = elapsed();
    const scores = ArcadeScoring.calculate(expected, committedText, input.value, seconds, backspaces, true);
    $('sprint-play').hidden = true;
    $('sprint-results').hidden = false;
    $('sprint-finish-reason').textContent = reason;
    const fillFormula = (name, score) => {
      $('sprint-result-' + name + '-gross').textContent = score.grossWpm.toFixed(2) + ' WPM';
      $('sprint-result-' + name + '-net').textContent = score.netWpm.toFixed(2) + ' WPM';
      $('sprint-result-' + name + '-accuracy').textContent = score.accuracy.toFixed(2) + '%';
      $('sprint-result-' + name + '-errors').textContent = String(score.totalErrors);
      $('sprint-result-' + name + '-allowed').textContent = String(score.allowedErrors);
      $('sprint-result-' + name + '-excess').textContent = String(score.excessErrors);
      $('sprint-result-' + name + '-penalty').textContent = score.penaltyWpm.toFixed(2) + ' WPM';
      $('sprint-result-' + name + '-correct').textContent = score.totalCorrectWord.toFixed(2);
      $('sprint-result-' + name + '-backspace').textContent = String(score.backspacePresses);
      $('sprint-result-' + name + '-keys').textContent = String(score.totalKeystrokes);
    };
    fillFormula('bsf', scores.bsf);
    fillFormula('crpf', scores.crpf);
    const previousBest = readPersonalBest();
    const isNewBest = reason !== 'Race aborted by player' && scores.bsf.netWpm > previousBest;
    const personalBest = isNewBest ? scores.bsf.netWpm : previousBest;
    if (isNewBest) { try { localStorage.setItem(personalBestKey, String(personalBest)); } catch {} }
    $('sprint-personal-best').textContent = personalBest.toFixed(2) + ' WPM';
    $('sprint-result-personal-best').textContent = personalBest.toFixed(2) + ' WPM';
    $('sprint-result-best-status').textContent = isNewBest ? 'NEW PERSONAL BEST · SAVED ON THIS DEVICE' : 'PERSONAL BEST · THIS DEVICE';
    $('sprint-result-time').textContent = seconds.toFixed(1) + ' sec';
    $('sprint-result-distance').textContent = committed.length + ' / ' + expected.length + ' words';
  }
  input.addEventListener('keydown', event => { if (event.key === 'Backspace') backspaces++; });
  input.addEventListener('input', () => {
    if (finished) return;
    if (!startedAt) { startedAt = performance.now(); timer = setInterval(update, 100); }
    if (/\s/u.test(input.value)) commitWord();
    update();
  });
  function startRace() {
    clearInterval(timer);
    expected = ArcadeWordBank.takeWords(90);
    committed.length = 0;
    committedText = '';
    startedAt = 0;
    timer = null;
    backspaces = 0;
    finished = false;
    nitroStreak = 0;
    bestNitro = 0;
    duration = Number($('sprint-duration').value) || 30;
    trackMode = $('sprint-track-mode').value;
    if (trackMode === 'technical') expected = expected.map((word,index) => word + (index % 4 === 0 ? ',' : index % 4 === 1 ? '.' : index % 4 === 2 ? ':' : ';'));
    input.value = '';
    input.disabled = false;
    $('sprint-results').hidden = true;
    $('sprint-intro').hidden = true;
    $('sprint-play').hidden = false;
    $('sprint-play').dataset.trackMode = trackMode;
    $('sprint-play').dataset.nitro = 'false';
    $('sprint-clock').textContent = duration.toFixed(1);
    $('sprint-gross').textContent = '0.00';
    $('sprint-net').textContent = '0.00';
    $('sprint-accuracy').textContent = '100.00%';
    $('sprint-errors').textContent = '0';
    $('sprint-nitro').textContent = '0 / BEST 0';
    paint();
    input.focus();
  }
  $('sprint-retry').addEventListener('click', startRace);
  $('sprint-track-mode').addEventListener('change', () => { const notes={clean:'Classic lap. Balanced pace, no modifiers.',nitro:'Every exact checkpoint builds a live combo streak.',technical:'Punctuation is part of every checkpoint. Match it exactly.'}; $('sprint-mode-note').textContent=notes[$('sprint-track-mode').value]; });
  $('sprint-abort').addEventListener('click', () => finish('Race aborted by player'));
  $('sprint-start').addEventListener('click', startRace);
  $('sprint-back').addEventListener('click', () => { location.href = '/fix-accuracy.html'; });
  paint();
});
