document.addEventListener('DOMContentLoaded', async () => {
  const candidateStatus = await AuthManager.requireCandidateGuard();
  if (!candidateStatus?.ok) return;
  'use strict';
  const $ = id => document.getElementById(id);
  const waves = [
    'meteor orbit lunar comet solar'.split(' '),
    'gravity asteroid satellite cosmic impact'.split(' '),
    'trajectory atmosphere collision telescope radiation'.split(' '),
    'interstellar gravitational observatory electromagnetic planetary'.split(' ')
  ];
  const expected = waves.flat();
  const committed = [];\n  let committedText = '';
  let startedAt = 0, timer = null, backspaces = 0, finished = false, currentWave = 0, combo = 0, bestCombo = 0, correctTargets = 0, missedTargets = 0;
  const duration = 60, input = $('mission-input');
  const elapsed = () => startedAt ? Math.max(0.001, (performance.now() - startedAt) / 1000) : 0.001;
  function paint() {
    const index = committed.length;
    currentWave = Math.min(3, Math.floor(index / 5));
    $('mission-target').textContent = expected[index] || 'SECTOR SECURED';
    $('mission-wave').textContent = 'WAVE ' + (Math.min(4, currentWave + 1)) + ' / 4';
    $('mission-count').textContent = index + ' / ' + expected.length + ' targets';
    $('mission-progress').style.width = index / expected.length * 100 + '%';
    $('mission-sectors').querySelectorAll('[data-wave]').forEach(node => {
      const wave = Number(node.dataset.wave);
      const complete = index >= expected.length;
      node.dataset.state = wave < currentWave || (complete && wave === 3) ? 'cleared' : wave === currentWave ? 'active' : 'locked';
    });
    const scores = ArcadeScoring.calculate(expected, committedText, input.value, elapsed(), backspaces, false);
    $('mission-gross').textContent = scores.bsf.grossWpm.toFixed(2);
    $('mission-net').textContent = scores.bsf.netWpm.toFixed(2);
    $('mission-accuracy').textContent = scores.bsf.accuracy.toFixed(2) + '%';
    $('mission-errors').textContent = String(scores.bsf.totalErrors);
    $('mission-combo').textContent = String(combo);
    $('mission-best-combo').textContent = String(bestCombo);
  }
  function update() {
    if (finished) return;
    const remaining = Math.max(0, duration - elapsed());
    $('mission-clock').textContent = Math.ceil(remaining) + 's';
    $('mission-console').dataset.critical = remaining <= 15 ? 'true' : 'false';
    if (remaining <= 0) finish('Mission clock expired');
  }
  function commit() {
    const raw = input.value;
    const word = raw.trim();
    input.value = '';
    committedText += raw;
    if (!word) return;
    if (word === expected[committed.length]) {
      combo++;
      bestCombo = Math.max(bestCombo, combo);
      correctTargets++;
    } else {
      combo = 0;
      missedTargets++;
    }
    committed.push(word);
    paint();
    if (committed.length >= expected.length) finish('All four waves neutralized');
  }
  function finish(reason) {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    input.disabled = true;
    const seconds = elapsed();
    const scores = ArcadeScoring.calculate(expected, committed, input.value, seconds, backspaces, true);
    const wavesCleared = Math.floor(committed.length / 5);
    $('mission-console').hidden = true;
    $('mission-results').hidden = false;
    $('mission-result-reason').textContent = reason;
    const fillFormula = (name, score) => {
      $('mission-result-' + name + '-gross').textContent = score.grossWpm.toFixed(2) + ' WPM';
      $('mission-result-' + name + '-net').textContent = score.netWpm.toFixed(2) + ' WPM';
      $('mission-result-' + name + '-accuracy').textContent = score.accuracy.toFixed(2) + '%';
      $('mission-result-' + name + '-errors').textContent = String(score.totalErrors);
      $('mission-result-' + name + '-allowed').textContent = String(score.allowedErrors);
      $('mission-result-' + name + '-excess').textContent = String(score.excessErrors);
      $('mission-result-' + name + '-penalty').textContent = score.penaltyWpm.toFixed(2) + ' WPM';
      $('mission-result-' + name + '-correct').textContent = score.totalCorrectWord.toFixed(2);
      $('mission-result-' + name + '-backspace').textContent = String(score.backspacePresses);
      $('mission-result-' + name + '-keys').textContent = String(score.totalKeystrokes);
    };
    fillFormula('bsf', scores.bsf);
    fillFormula('crpf', scores.crpf);
    $('mission-result-waves').textContent = String(Math.min(4, wavesCleared));
    $('mission-result-time').textContent = seconds.toFixed(1) + ' sec';
    $('mission-result-targets').textContent = committed.length + ' / ' + expected.length;
    $('mission-result-correct').textContent = String(correctTargets);
    $('mission-result-missed').textContent = String(missedTargets);
    $('mission-result-best-combo').textContent = String(bestCombo);
  }
  input.addEventListener('keydown', event => { if (event.key === 'Backspace') backspaces++; });
  input.addEventListener('input', () => {
    if (finished) return;
    if (!startedAt) { startedAt = performance.now(); timer = setInterval(update, 100); }
    if (/\s/u.test(input.value)) commit();
    else paint();
    update();
  });
  $('mission-start').addEventListener('click', () => {
    $('mission-briefing').hidden = true;
    $('mission-console').hidden = false;
    input.disabled = false;
    input.focus();
    paint();
  });
  $('mission-abort').addEventListener('click', () => finish('Mission aborted by operator'));
  $('mission-retry').addEventListener('click', () => location.reload());
  $('mission-back').addEventListener('click', () => { location.href = '/fix-accuracy.html'; });
  paint();
});
