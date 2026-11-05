document.addEventListener('DOMContentLoaded', async () => {
  const candidateStatus = await AuthManager.requireCandidateGuard();
  if (!candidateStatus?.ok) return;
  'use strict';
  const $ = id => document.getElementById(id);
  const pool = 'rapid engine velocity highway turbo momentum accelerate overtake traction racing circuit throttle gearbox steering finish straightaway velocity pursuit dynamic power launch apex acceleration'.split(' ');
  const expected = Array.from({length:90}, () => pool[Math.floor(Math.random() * pool.length)]);
  const committed = [];
  let committedText = '';
  let startedAt = 0, timer = null, backspaces = 0, finished = false;
  const duration = 30;
  const input = $('sprint-input');
  const elapsed = () => startedAt ? Math.max(0.001, (performance.now() - startedAt) / 1000) : 0.001;
  const pct = () => Math.min(100, committed.length / expected.length * 100);
  function paint() {
    $('sprint-target').textContent = expected[committed.length] || 'FINISH';
    $('sprint-word-count').textContent = committed.length + ' / ' + expected.length;
    $('sprint-progress').style.width = pct() + '%';
    $('sprint-car').style.left = pct() + '%';
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
    if (remaining <= 0) finish('30-second finish line reached');
  }
  function commitWord() {
    const raw = input.value;
    const word = raw.trim();
    input.value = '';
    committedText += raw;
    if (!word) return;
    committed.push(word);
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
  $('sprint-retry').addEventListener('click', () => location.reload());
  $('sprint-abort').addEventListener('click', () => finish('Race aborted by player'));
  $('sprint-start').addEventListener('click', () => {
    $('sprint-intro').hidden = true;
    $('sprint-play').hidden = false;
    input.disabled = false;
    input.focus();
    paint();
  });
  $('sprint-back').addEventListener('click', () => { location.href = '/fix-accuracy.html'; });
  paint();
});
