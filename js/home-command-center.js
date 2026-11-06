/* Secure homepage resource preview. Catalog visibility and download URLs are enforced by Supabase RPC/RLS. */
document.addEventListener('DOMContentLoaded', async () => {
  const box = document.getElementById('home-featured-materials');
  if (!box || !window.supabaseClient) return;
  const makeMessage = (message, linkText, href) => {
    const p = document.createElement('p'); p.className = 'home-command-muted'; p.textContent = message;
    if (linkText && href) { const a = document.createElement('a'); a.href = href; a.textContent = linkText; p.append(' ', a); }
    box.replaceChildren(p);
  };
  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    if (!sessionData?.session?.user) {
      makeMessage('Sign in to see resources available to your account.', 'Open PDF Library', '/materials.html');
      return;
    }
    const { data, error } = await supabaseClient.rpc('list_material_catalog');
    if (error) throw error;
    const rows = Array.isArray(data) ? data.slice(0, 4) : [];
    if (!rows.length) {
      makeMessage('No study resources are currently available to this account.', 'Browse PDF Library', '/materials.html');
      return;
    }
    box.replaceChildren();
    rows.forEach((row) => {
      const item = document.createElement('article'); item.className = 'home-featured-material';
      const badge = document.createElement('span'); badge.className = 'home-featured-pdf'; badge.textContent = row.material_type === 'study_pack' ? 'PACK' : 'PDF';
      const copy = document.createElement('div'); copy.className = 'home-featured-copy';
      const title = document.createElement('strong'); title.textContent = String(row.title || 'Study material');
      const desc = document.createElement('small'); desc.textContent = row.description ? String(row.description).slice(0, 90) : 'Admin-published resource';
      copy.append(title, desc);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'home-featured-open'; button.textContent = 'Open / Download ↗';
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        button.disabled = true; button.textContent = 'Checking access…';
        try {
          const { data: url, error: linkError } = await supabaseClient.rpc('get_material_link', { p_material_id: row.id });
          if (linkError) throw linkError;
          if (typeof url !== 'string') throw new Error('This resource is not available to your account.');
          const parsed = new URL(url, window.location.origin);
          if (parsed.protocol !== 'https:') throw new Error('The resource link is not secure.');
          window.location.assign(parsed.href);
        } catch (err) {
          button.textContent = 'Unavailable';
          button.title = err?.message || 'Could not open this resource';
          button.disabled = false;
        }
      });
      item.append(badge, copy, button); box.append(item);
    });
  } catch (error) {
    console.warn('Homepage resource preview unavailable:', error?.message || error);
    makeMessage('Resources could not be loaded right now.', 'Open PDF Library', '/materials.html');
  }
});
