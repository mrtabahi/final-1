/* Lightweight admin navigation tools; all actions reuse existing authorized controls. */
(() => {
  'use strict';
  const ready = () => {
    const app = document.getElementById('admin-app');
    const topbar = document.querySelector('.admin-topbar-right');
    if (!app || !topbar || document.getElementById('admin-command-trigger')) return;

    const densityKey = 'decoding-hcm-admin-compact';
    try {
      if (localStorage.getItem(densityKey) === '1') document.body.classList.add('admin-compact');
    } catch (_) {}

    const commandButton = document.createElement('button');
    commandButton.type = 'button';
    commandButton.id = 'admin-command-trigger';
    commandButton.className = 'admin-btn admin-btn-secondary admin-command-trigger';
    commandButton.setAttribute('aria-haspopup', 'dialog');
    commandButton.setAttribute('aria-expanded', 'false');
    commandButton.innerHTML = '<span aria-hidden="true">⌕</span><span>Jump to</span><kbd>Ctrl K</kbd>';
    const refresh = document.getElementById('admin-data-refresh');
    topbar.insertBefore(commandButton, refresh || topbar.firstChild);

    const densityButton = document.createElement('button');
    densityButton.type = 'button';
    densityButton.className = 'admin-btn admin-btn-secondary admin-density-toggle';
    densityButton.id = 'admin-density-toggle';
    densityButton.title = 'Toggle compact admin layout';
    densityButton.setAttribute('aria-pressed', document.body.classList.contains('admin-compact') ? 'true' : 'false');
    densityButton.textContent = document.body.classList.contains('admin-compact') ? '▤ Compact' : '☷ Comfortable';
    topbar.insertBefore(densityButton, document.getElementById('admin-top-avatar') || null);

    const backdrop = document.createElement('div');
    backdrop.className = 'admin-command-backdrop';
    backdrop.id = 'admin-command-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = '<section class="admin-command-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-command-title" aria-describedby="admin-command-help"><div class="admin-command-search-row"><span class="admin-command-search-icon" aria-hidden="true">⌕</span><input id="admin-command-search" class="admin-command-search" type="search" autocomplete="off" placeholder="Search admin pages and tools…" aria-label="Search admin pages and tools"><button type="button" class="admin-icon-button" id="admin-command-close" aria-label="Close navigation search">×</button></div><div class="admin-command-hint" id="admin-command-title">Navigate to</div><div class="admin-command-results" id="admin-command-results" role="listbox" aria-label="Admin destinations"></div><div class="admin-command-footer" id="admin-command-help"><span><kbd>↑</kbd> <kbd>↓</kbd> Navigate</span><span><kbd>Enter</kbd> Open</span><span><kbd>Esc</kbd> Close</span></div></section>';
    document.body.appendChild(backdrop);

    const search = backdrop.querySelector('#admin-command-search');
    const results = backdrop.querySelector('#admin-command-results');
    const closeButton = backdrop.querySelector('#admin-command-close');
    let items = [];
    let selected = 0;
    let lastFocus = null;

    const readItems = () => Array.from(document.querySelectorAll('.admin-nav .admin-nav-link')).map((button, index) => {
      const clone = button.cloneNode(true);
      clone.querySelectorAll('em').forEach(node => node.remove());
      return {
        button,
        title: clone.textContent.replace(/\s+/g, ' ').trim(),
        module: button.dataset.module || button.id.replace(/^nav-/, '') || 'page',
        icon: button.querySelector('span')?.textContent.trim() || '↗',
        index
      };
    }).filter(item => item.title);

    const render = () => {
      const query = search.value.trim().toLocaleLowerCase();
      const filtered = items.filter(item => (item.title + ' ' + item.module).toLocaleLowerCase().includes(query));
      selected = Math.max(0, Math.min(selected, filtered.length - 1));
      results.replaceChildren();
      if (!filtered.length) {
        const empty = document.createElement('div');
        empty.className = 'admin-command-empty';
        empty.textContent = 'No matching admin destinations. Try another keyword.';
        results.appendChild(empty);
        return;
      }
      filtered.forEach((item, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'admin-command-item' + (index === selected ? ' is-selected' : '');
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', index === selected ? 'true' : 'false');
        const icon = document.createElement('span');
        icon.className = 'admin-command-item-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = item.icon;
        const copy = document.createElement('span');
        copy.className = 'admin-command-item-copy';
        const title = document.createElement('strong');
        title.textContent = item.title;
        const description = document.createElement('small');
        description.textContent = item.module === 'dash' ? 'Platform overview and quick actions' :
          item.module === 'tests' ? 'Manage folders, passages and test settings' :
          item.module === 'attempts' ? 'Review results and export reports' : 'Open this control-center section';
        copy.append(title, description);
        button.append(icon, copy);
        if (index === selected) {
          const enter = document.createElement('kbd');
          enter.textContent = '↵';
          button.appendChild(enter);
        }
        button.addEventListener('click', () => {
          close();
          item.button.click();
        });
        button.addEventListener('mouseenter', () => {\n          selected = index;\n          results.querySelectorAll('.admin-command-item').forEach((node, nodeIndex) => {\n            node.classList.toggle('is-selected', nodeIndex === selected);\n            node.setAttribute('aria-selected', nodeIndex === selected ? 'true' : 'false');\n          });\n        });
        results.appendChild(button);
      });
    };

    const open = () => {
      lastFocus = document.activeElement;
      items = readItems();
      search.value = '';
      selected = 0;
      render();
      backdrop.hidden = false;
      commandButton.setAttribute('aria-expanded', 'true');
      search.focus();
    };
    const close = () => {
      backdrop.hidden = true;
      commandButton.setAttribute('aria-expanded', 'false');
      if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
    };

    commandButton.addEventListener('click', open);
    closeButton.addEventListener('click', close);
    densityButton.addEventListener('click', () => {
      const compact = document.body.classList.toggle('admin-compact');
      densityButton.setAttribute('aria-pressed', compact ? 'true' : 'false');
      densityButton.textContent = compact ? '▤ Compact' : '☷ Comfortable';
      try { localStorage.setItem(densityKey, compact ? '1' : '0'); } catch (_) {}
    });
    search.addEventListener('input', () => { selected = 0; render(); });
    search.addEventListener('keydown', event => {
      const options = results.querySelectorAll('.admin-command-item');
      if (event.key === 'ArrowDown' && options.length) {
        event.preventDefault(); selected = (selected + 1) % options.length; render();
        results.querySelectorAll('.admin-command-item')[selected]?.scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'ArrowUp' && options.length) {
        event.preventDefault(); selected = (selected - 1 + options.length) % options.length; render();
        results.querySelectorAll('.admin-command-item')[selected]?.scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter' && options.length) {
        event.preventDefault(); options[selected]?.click();
      } else if (event.key === 'Escape') {
        event.preventDefault(); close();
      }
    });
    backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
    document.addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        backdrop.hidden ? open() : close();
      } else if (event.key === 'Escape' && !backdrop.hidden) {
        close();
      } else if (event.key === '/' && !backdrop.hidden === false &&
        !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '') &&
        !document.activeElement?.isContentEditable) {
        event.preventDefault(); open();
      }
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
