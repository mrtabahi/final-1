/* Shared, presentation-only controls for typing workspaces. */
(function (root) {
  'use strict';

  function bindFontControls(options) {
    const config = options || {};
    const targets = (config.targets || []).filter(Boolean);
    let size = Number(config.initialSize) || 18;
    const min = Number.isFinite(config.min) ? config.min : 14;
    const max = Number.isFinite(config.max) ? config.max : 32;
    const step = Number.isFinite(config.step) ? config.step : 1;

    function apply() {
      targets.forEach(target => { target.style.fontSize = size + 'px'; });
      if (typeof config.onChange === 'function') config.onChange(size);
      return size;
    }
    function set(next) {
      const value = Number(next);
      if (!Number.isFinite(value)) return size;
      size = Math.min(max, Math.max(min, value));
      return apply();
    }

    if (config.downButton) config.downButton.addEventListener('click', () => set(size - step));
    if (config.upButton) config.upButton.addEventListener('click', () => set(size + step));
    apply();
    return Object.freeze({ get: () => size, set });
  }

  function setHidden(target, hidden) {
    if (!target) return Boolean(hidden);
    target.hidden = Boolean(hidden);
    return target.hidden;
  }

  function setDisplay(target, visible, displayValue) {
    if (!target || !target.style) return Boolean(visible);
    target.style.display = visible ? (displayValue || 'block') : 'none';
    return Boolean(visible);
  }

  function setClassState(target, className, enabled) {
    if (!target || !target.classList || !className) return Boolean(enabled);
    target.classList.toggle(className, Boolean(enabled));
    return Boolean(enabled);
  }

  root.TypingWorkspaceControls = Object.freeze({
    bindFontControls, setHidden, setDisplay, setClassState
  });
})(typeof window !== 'undefined' ? window : globalThis);
