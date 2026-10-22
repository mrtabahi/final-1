document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);

  const setMessage = (el, message, isError = false) => {
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', isError);
    el.classList.toggle('is-success', !isError);
  };

  const esc = (value) =>
    String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    })[char]);

  // Check required dependencies
  if (
    typeof AuthManager === 'undefined' ||
    typeof supabaseClient === 'undefined'
  ) {
    console.error('AuthManager or supabaseClient is not available.');
    return;
  }

  let status;

  try {
    status = await AuthManager.requireCandidateGuard();
  } catch (error) {
    console.error('Candidate guard failed:', error);
    return;
  }

  if (!status?.ok) return;

  const { user, profile } = status;

  if (!user?.id || !profile) {
    console.error('Candidate session is missing user/profile data.');
    return;
  }

  // Get page elements
  const welcomeName = $('welcome-name');
  const profileName = $('profile-name');
  const profilePhone = $('profile-phone');
  const profileEmail = $('profile-email');
  const profileStatus = $('profile-status');
  const logoutBtn = $('logout-btn');
  const profileForm = $('profile-form');
  const passwordForm = $('password-form');
  const profileMessage = $('profile-message');
  const folderList = $('folder-list');
  const historyBody = $('history-table-body');

  const requiredElements = [
    welcomeName,
    profileName,
    profilePhone,
    profileEmail,
    profileStatus,
    logoutBtn,
    profileForm,
    passwordForm,
    profileMessage,
    folderList,
    historyBody
  ];

  if (!requiredElements.every(Boolean)) {
    console.error('One or more required dashboard elements are missing.');
    return;
  }

  // Populate profile
  welcomeName.textContent = profile.full_name || 'Candidate';
  profileName.value = profile.full_name || '';
  profilePhone.value = profile.phone || '';
  profileEmail.value = user.email || profile.email || '';

  profileStatus.value = profile.phone_verified
    ? 'Verified'
    : 'Verification required';

  // Logout
  logoutBtn.addEventListener('click', async (event) => {
    event.preventDefault();
    logoutBtn.disabled = true;

    try {
      await AuthManager.logout();
    } catch (error) {
      console.error('Logout failed:', error);
      logoutBtn.disabled = false;

      setMessage(
        profileMessage,
        'Unable to log out. Please try again.',
        true
      );
    }
  });

  // Load active typing tests
  async function loadTests() {
    folderList.textContent = 'Loading typing tests…';

    try {
      const [foldersResult, testsResult] = await Promise.all([
        supabaseClient
          .from('folders')
          .select('id,name,description,sort_order,created_at')
          .eq('active', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),

        supabaseClient
          .from('tests')
          .select(
            'id,title,language,duration_minutes,target_wpm,min_accuracy,folder_id,mode'
          )
          .eq('active', true)
          .order('created_at', { ascending: false })
      ]);

      if (foldersResult.error) throw foldersResult.error;
      if (testsResult.error) throw testsResult.error;

      const folders = foldersResult.data || [];
      const tests = testsResult.data || [];

      const groups = folders
        .map((folder) => ({
          ...folder,
          tests: tests.filter(
            (test) => test.folder_id === folder.id
          )
        }))
        .filter((folder) => folder.tests.length > 0);

      if (!groups.length) {
        folderList.textContent =
          'No active typing sets are available yet.';
        return;
      }

      folderList.innerHTML = groups.map((folder) => `
        <section
          class="test-folder"
          style="margin-bottom:1.5rem;padding:1rem;border:1px solid var(--border-color);border-radius:12px"
        >
          <h3>${esc(folder.name)}</h3>

          <p class="form-help">
            ${esc(folder.description || '')}
          </p>

          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Language</th>
                  <th>Time</th>
                  <th>Target</th>
                  <th>Accuracy</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                ${folder.tests.map((test) => `
                  <tr>
                    <td><strong>${esc(test.title)}</strong></td>
                    <td>${esc(test.language || '—')}</td>
                    <td>${esc(test.duration_minutes ?? '—')} min</td>
                    <td>
                      ${
                        test.target_wpm == null
                          ? '—'
                          : `${esc(test.target_wpm)} WPM`
                      }
                    </td>
                    <td>
                      ${
                        test.min_accuracy == null
                          ? '—'
                          : `${esc(test.min_accuracy)}%`
                      }
                    </td>
                    <td>
                      <a
                        class="btn btn-primary btn-sm"
                        href="start_test.html?test=${encodeURIComponent(String(test.id))}"
                      >
                        Attempt
                      </a>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>
      `).join('');

    } catch (error) {
      console.error('Unable to load typing tests:', error);

      folderList.textContent =
        'Unable to load tests. Please refresh and try again.';
    }
  }

  // Load candidate's attempt history
  async function loadHistory() {
    historyBody.innerHTML =
      '<tr><td colspan="7">Loading history…</td></tr>';

    try {
      const { data, error } = await supabaseClient
        .from('attempts')
        .select(
          'created_at,mode,gross_wpm,net_wpm,accuracy,total_errors,test_id,tests(title)'
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      if (!data?.length) {
        historyBody.innerHTML =
          '<tr><td colspan="7">No attempts yet.</td></tr>';
        return;
      }

      historyBody.innerHTML = data.map((attempt) => {
        const date = attempt.created_at
          ? new Date(attempt.created_at)
          : null;

        const dateText =
          date && !Number.isNaN(date.getTime())
            ? date.toLocaleString()
            : '—';

        const relatedTest = Array.isArray(attempt.tests)
          ? attempt.tests[0]
          : attempt.tests;

        return `
          <tr>
            <td>${esc(dateText)}</td>
            <td>${esc(relatedTest?.title || 'Typing Test')}</td>
            <td>${esc(attempt.mode || '—')}</td>
            <td>${esc(attempt.gross_wpm ?? '—')}</td>
            <td>${esc(attempt.net_wpm ?? '—')}</td>
            <td>
              ${
                attempt.accuracy == null
                  ? '—'
                  : `${esc(attempt.accuracy)}%`
              }
            </td>
            <td>${esc(attempt.total_errors ?? '—')}</td>
          </tr>
        `;
      }).join('');

    } catch (error) {
      console.error('Unable to load attempt history:', error);

      historyBody.innerHTML =
        '<tr><td colspan="7">Unable to load history. Please refresh and try again.</td></tr>';
    }
  }


    // Update profile
  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitButton =
      profileForm.querySelector('[type="submit"]');

    const name = profileName.value.trim();
    const email = profileEmail.value.trim().toLowerCase();

    const originalEmail = String(user.email || '')
      .trim()
      .toLowerCase();

    if (!name) {
      setMessage(
        profileMessage,
        'Please enter your full name.',
        true
      );
      profileName.focus();
      return;
    }

    if (!email) {
      setMessage(
        profileMessage,
        'Please enter your email address.',
        true
      );
      profileEmail.focus();
      return;
    }

    if (submitButton) submitButton.disabled = true;

    setMessage(profileMessage, 'Saving profile…');

    try {
      await AuthManager.updateName(name);

      welcomeName.textContent = name;

      if (email !== originalEmail) {
        await AuthManager.changeEmail(email);

        setMessage(
          profileMessage,
          'Name saved. Check your new email inbox to confirm the email change.'
        );
      } else {
        setMessage(
          profileMessage,
          'Profile updated successfully.'
        );
      }

    } catch (error) {
      console.error('Profile update failed:', error);

      setMessage(
        profileMessage,
        error?.message ||
          'Unable to update profile. Please try again.',
        true
      );

    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  // Change password
  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const passwordInput = $('new-password');
    const submitButton =
      passwordForm.querySelector('[type="submit"]');

    const password = passwordInput?.value || '';

    if (!password) {
      setMessage(
        profileMessage,
        'Please enter a new password.',
        true
      );

      passwordInput?.focus();
      return;
    }

    if (submitButton) submitButton.disabled = true;

    setMessage(profileMessage, 'Changing password…');

    try {
      await AuthManager.changePassword(password);

      passwordForm.reset();

      setMessage(
        profileMessage,
        'Password changed successfully.'
      );

    } catch (error) {
      console.error('Password change failed:', error);

      setMessage(
        profileMessage,
        error?.message ||
          'Unable to change password. Please try again.',
        true
      );

    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });

  // Load both dashboard sections concurrently
  await Promise.all([
    loadTests(),
    loadHistory()
  ]);
});
