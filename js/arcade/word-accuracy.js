document.addEventListener('DOMContentLoaded', async () => {\n  const candidateStatus = await AuthManager.requireCandidateGuard();\n  if (!candidateStatus?.ok) return;
  'use strict';
  const $ = id => document.getElementById(id);
  const expected = 'administration discipline responsibility efficiency accuracy candidate examination recruitment documentation communication government procedure commitment integrity punctuality knowledge assessment verification preparation consistency thoroughness proficiency adaptability perseverance resilience'.split(' ');
  const committed = [];
  let startedAt = 0, backspaces = 0, shields = 3, streak = 0, bestStreak = 0, correctWords = 0, finished = false;
  const input = $('precision-input');
  const elapsed = () => startedAt ? Math.max(0.001, (performance.now() - startedAt) / 1000) : 0.001;
  function paint() {
    const next = expected[committed.length];
    $('precision-target').textContent = next || 'CALIBRATION COMPLETE';
    $('precision-index').textContent = Math.min(expected.length, committed.length + 1) + ' / ' + expected.length;
    $('precision-correct').textContent = String(correctWords);
    $('precision-streak').textContent = String(streak);
    $('precision-best').textContent = String(bestStreak);
    $('precision-shields').textContent = '● '.repeat(shields) + '○ '.repeat(3 - shields);
    $('precision-progress').style.width = committed.length / expected.length * 100 + '%';
    const scores = ArcadeScoring.calculate(expected, committed, input.value, elapsed(), backspaces, false);
    $('precision-live-accuracy').textContent = scores.bsf.accuracy.toFixed(2) + '%';
    $('precision-live-net').textContent = scores.bsf.netWpm.toFixed(2);
    $('precision-live-errors').textContent = String(scores.bsf.totalErrors);
    if (!$('precision-feedback').dataset.state) $('precision-feedback').textContent = 'Match every character, then press Space to lock the word.';
  }
  function updateScore() {
    const scores = ArcadeScoring.calculate(expected, committed, input.value, elapsed(), backspaces, false);
    $('precision-live-accuracy').textContent = scores.bsf.accuracy.toFixed(2) + '%';
    $('precision-live-net').textContent = scores.bsf.netWpm.toFixed(2);
    $('precision-live-errors').textContent = String(scores.bsf.totalErrors);
  }
  function commit() {
    const word = input.value.trim();
    input.value = '';
    if (!word) return;
    const target = expected[committed.length];
    committed.push(word);
    if (word === target) {
      correctWords++;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      $('precision-feedback').textContent = 'Exact match. Precision maintained.';
      $('precision-feedback').dataset.state = 'correct';
    } else {
      shields = Math.max(0, shields - 1);
      streak = 0;
      $('precision-feedback').textContent = 'Mismatch. One shield lost. Next target is ready.';
      $('precision-feedback').dataset.state = 'wrong';
    }
    paint();
    if (shields <= 0) finish('All precision shields depleted');
    else if (committed.length >= expected.length) finish('All 25 target words calibrated');
  }
  function finish(reason) {
    if (finished) return;
    finished = true;
    input.disabled = true;
    const seconds = elapsed();
    const scores = ArcadeScoring.calculate(expected, committed, input.value, seconds, backspaces, true);
    $('precision-arena').hidden = true;
    $('precision-results').hidden = false;
    $('precision-result-reason').textContent = reason;
    const fillFormula = (name, score) => {
      $('precision-result-' + name + '-gross').textContent = score.grossWpm.toFixed(2) + ' WPM';
      $('precision-result-' + name + '-net').textContent = score.netWpm.toFixed(2) + ' WPM';
      $('precision-result-' + name + '-accuracy').textContent = score.accuracy.toFixed(2) + '%';
      $('precision-result-' + name + '-errors').textContent = String(score.totalErrors);
      $('precision-result-' + name + '-allowed').textContent = String(score.allowedErrors);
      $('precision-result-' + name + '-excess').textContent = String(score.excessErrors);
      $('precision-result-' + name + '-penalty').textContent = score.penaltyWpm.toFixed(2) + ' WPM';
      $('precision-result-' + name + '-correct').textContent = score.totalCorrectWord.toFixed(2);
      $('precision-result-' + name + '-backspace').textContent = String(score.backspacePresses);
      $('precision-result-' + name + '-keys').textContent = String(score.totalKeystrokes);
    };
    fillFormula('bsf', scores.bsf);
    fillFormula('crpf', scores.crpf);
    $('precision-result-correct').textContent = String(correctWords);
    $('precision-result-wrong').textContent = String(committed.length - correctWords);
    $('precision-result-streak').textContent = String(bestStreak);
    $('precision-result-time').textContent = seconds.toFixed(1) + ' sec';
  }
  input.addEventListener('keydown', event => { if (event.key === 'Backspace') backspaces++; });
  input.addEventListener('input', () => {
    if (finished) return;
    if (!startedAt) startedAt = performance.now();
    if (/\s/u.test(input.value)) commit();
    else updateScore();
  });
  $('precision-start').addEventListener('click', () => {
    $('precision-briefing').hidden = true;
    $('precision-arena').hidden = false;
    input.disabled = false;
    input.focus();
    paint();
  });
  $('precision-finish').addEventListener('click', () => finish('Precision drill ended by player'));
  $('precision-retry').addEventListener('click', () => location.reload());
  $('precision-back').addEventListener('click', () => { location.href = '/fix-accuracy.html'; });
  paint();
});
