document.addEventListener('DOMContentLoaded', async () => {
  const candidateStatus = await AuthManager.requireCandidateGuard();
  if (!candidateStatus?.ok) return;
  'use strict';
  const $ = id => document.getElementById(id);
  let expected = [];
  function drawTargets(level='easy') {
    const bankWords = ArcadeWordBank.takeWords(20).sort((a,b) => a.length - b.length);
    const waves = Array.from({length:4}, (_, wave) => bankWords.slice(wave * 5, wave * 5 + 5));
    expected = ArcadeCharacterLevels.apply(waves.flat(), level);
  }
  drawTargets();
  const committed = [];
  let committedText = '';
  let startedAt = 0, timer = null, targetDeadline = 0, backspaces = 0, finished = false, currentWave = 0, combo = 0, bestCombo = 0, correctTargets = 0, missedTargets = 0, intensity = 'standard', deadlineMultiplier = 1;
  const duration = 60, input = $('mission-input');
  const elapsed = () => startedAt ? Math.max(0.001, (performance.now() - startedAt) / 1000) : 0.001;
  function armTargetDeadline() {
    const target = expected[committed.length];
    targetDeadline = target ? performance.now() + Math.max(1600, Math.min(7000, (2200 + target.length * 220) * deadlineMultiplier)) : 0;
  }
  function paint() {
    const index = committed.length;
    currentWave = Math.min(3, Math.floor(index / 5));
    $('mission-target').textContent = expected[index] || 'SECTOR SECURED';
    $('mission-target-rank').textContent = index % 5 === 4 ? 'ELITE TARGET // HIGH VALUE' : 'SECTOR ' + String(currentWave+1).padStart(2,'0');
    $('mission-target-clock').textContent = targetDeadline && startedAt ? Math.max(0, (targetDeadline - performance.now()) / 1000).toFixed(1) + 's' : '—';
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
    if (targetDeadline && performance.now() >= targetDeadline && committed.length < expected.length) {
      const typed = input.value.trim();
      input.value = '';
      committedText += (typed || 'timeout') + ' ';
      committed.push(typed || 'timeout');
      missedTargets++;
      combo = 0;
      paint();
      armTargetDeadline();
    }
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
    armTargetDeadline();
    if (committed.length >= expected.length) finish('All four waves neutralized');
  }
  function finish(reason) {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    input.disabled = true;
    const seconds = elapsed();
    const scores = ArcadeScoring.calculate(expected, committedText, input.value, seconds, backspaces, true);
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
  $('mission-intensity').addEventListener('change', () => { const notes={standard:'Standard lock-on windows. Learn the pattern and build a combo.',overdrive:'Target windows are 25% shorter. Combo multiplier pressure is high.',nightmare:'Target windows are 45% shorter. Every hesitation is costly.'}; $('mission-mode-note').textContent=notes[$('mission-intensity').value]; });
  function launchBlitz() {
    clearInterval(timer);
    committed.length = 0;
    committedText = '';
    startedAt = 0;
    timer = null;
    targetDeadline = 0;
    backspaces = 0;
    finished = false;
    currentWave = 0;
    combo = 0;
    bestCombo = 0;
    correctTargets = 0;
    missedTargets = 0;
    intensity = $('mission-intensity').value;
    drawTargets($('mission-difficulty').value || 'easy');
    deadlineMultiplier = intensity === 'overdrive' ? 0.75 : intensity === 'nightmare' ? 0.55 : 1;
    input.value = '';
    input.disabled = false;
    $('mission-results').hidden = true;
    $('mission-briefing').hidden = true;
    $('mission-console').hidden = false;
    $('mission-console').dataset.intensity = intensity;
    $('mission-console').dataset.critical = 'false';
    $('mission-clock').textContent = duration + 's';
    $('mission-combo').textContent = '0';
    $('mission-best-combo').textContent = '0';
    $('mission-gross').textContent = '0.00';
    $('mission-net').textContent = '0.00';
    $('mission-accuracy').textContent = '100.00%';
    $('mission-errors').textContent = '0';
    startedAt = performance.now();
    armTargetDeadline();
    timer = setInterval(update, 100);
    paint();
    input.focus();
  }
  $('mission-start').addEventListener('click', launchBlitz);
  $('mission-abort').addEventListener('click', () => finish('Mission aborted by operator'));
  $('mission-retry').addEventListener('click', launchBlitz);
  $('mission-back').addEventListener('click', () => { location.href = '/fix-accuracy.html'; });
  paint();
});
