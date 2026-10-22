/* =========================================================
   DECODING HCM TYPING LAB
   ADMIN PANEL
   ========================================================= */

(() => {

    'use strict';


    /* =====================================================
       DOM HELPERS
    ===================================================== */

    const $ = id => document.getElementById(id);


    const esc = value => {

        if (value === null || value === undefined) {
            return '';
        }

        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };


    const formatNumber = value => {

        const n = Number(value);

        if (!Number.isFinite(n)) {
            return '0';
        }

        return n.toFixed(2);
    };


    const formatDate = value => {

        if (!value) {
            return '—';
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return '—';
        }

        return date.toLocaleString();
    };


    /* =====================================================
       PAGE STATE
    ===================================================== */

    let currentView = 'dashboard';

    let cachedAttempts = [];

    let cachedTests = [];

    let cachedFolders = [];
    let editingFolderId = null;
    let editingTestId = null;


    /* =====================================================
       ADMIN AUTHENTICATION
    ===================================================== */

    async function checkAdminAccess() {
        try {
            const access = await AuthManager.requireAdminGuard();
            if (!access?.user || !access?.profile) return false;
            setAdminIdentity(access.profile, access.user);
            return true;
        } catch (error) {
            console.error('Admin authentication error:', error);
            window.location.href = 'login.html';
            return false;
        }
    }


    /* =====================================================
       ADMIN IDENTITY
    ===================================================== */

    function setAdminIdentity(profile, user) {

        const name =
            profile.full_name ||
            user?.user_metadata?.full_name ||
            'Administrator';

        const email =
            profile.email ||
            user?.email ||
            '';


        if ($('admin-name')) {
            $('admin-name').textContent = name;
        }


        if ($('admin-email')) {
            $('admin-email').textContent = email;
        }


        if ($('admin-avatar')) $('admin-avatar').textContent = name.trim().charAt(0).toUpperCase() || 'A';
        if ($('admin-top-avatar')) $('admin-top-avatar').textContent = name.trim().charAt(0).toUpperCase() || 'A';
    }


    /* =====================================================
       NAVIGATION
    ===================================================== */

    function showAdminView(view) {
        const views = { dashboard: $('view-dashboard'), tests: $('view-tests'), attempts: $('view-attempts'), module: $('view-module') };
        Object.values(views).forEach(element => { if (element) element.style.display = 'none'; });
        const isCore = ['dashboard', 'tests', 'attempts'].includes(view);
        const target = isCore ? views[view] : views.module;
        if (target) target.style.display = 'block';
        currentView = view;
        document.querySelectorAll('.admin-nav-link').forEach(link => link.classList.remove('active'));
        const activeMap = { dashboard: 'nav-dash', tests: 'nav-tests', attempts: 'nav-attempts' };
        if (activeMap[view] && $(activeMap[view])) $(activeMap[view]).classList.add('active');
        if (!isCore) document.querySelectorAll('.admin-nav-link[data-module]').forEach(link => { if (link.getAttribute('data-module') === view) link.classList.add('active'); });
        updatePageHeader(view);
        if (view === 'dashboard') loadDashboard();
        if (view === 'tests') loadManageTests();
        if (view === 'attempts') loadAllAttempts();
    }


    function updatePageHeader(view) {
        const title = $('page-title'), subtitle = $('page-subtitle');
        const data = {
            dashboard:{title:'Overview',subtitle:'Manage your typing practice platform.'},
            tests:{title:'Folders & Tests',subtitle:'Create, organize and control typing tests.'},
            attempts:{title:'Results & Attempts',subtitle:'Review candidate typing performance.'},
            candidates:{title:'Candidate Management',subtitle:'Review accounts, account history and candidate status.'},
            content:{title:'Website Content',subtitle:'Manage public-facing pages, banners and announcements.'},
            subscriptions:{title:'Plans & Subscriptions',subtitle:'Plan paid tiers, renewals and premium access.'},
            payments:{title:'Payments & Coupons',subtitle:'Payment ledger, invoices, coupons and refunds.'},
            roles:{title:'Roles & Permissions',subtitle:'Define least-privilege access for administrators.'},
            analytics:{title:'Analytics & Reports',subtitle:'Performance trends and operational reports.'},
            security:{title:'Security & Audit',subtitle:'Account enforcement, admin actions and audit events.'},
            settings:{title:'Website Settings',subtitle:'Branding, navigation, feature flags and maintenance.'}
        };
        const item=data[view]||data.dashboard;
        if(title) title.textContent=item.title;
        if(subtitle) subtitle.textContent=item.subtitle;
        if(view!=='dashboard'&&view!=='tests'&&view!=='attempts') renderPlannedModule(view,item);
    }


    function renderPlannedModule(view,item) {
        const configs = {
            candidates:[['Candidate directory','Search profiles and review verified account details.'],['Account status','Add suspend/restore only after server-side enforcement exists.'],['Candidate history','Review attempts and support notes with privacy controls.'],['Identity verification','Review verification status without exposing secrets.']],
            content:[['Public pages','Manage homepage copy, FAQ, policy pages and footer links.'],['Announcements','Schedule notices and maintenance banners.'],['Media library','Manage logos, thumbnails and passage attachments.'],['SEO settings','Edit titles, descriptions and social previews.']],
            subscriptions:[['Plan catalogue','Free, monthly, quarterly and annual plans.'],['Entitlements','Gate premium tests, analytics, history and attempt limits.'],['Lifecycle','Trials, renewals, grace periods, cancellation and expiry.'],['Reconciliation','Verify payment webhooks before granting paid access.']],
            payments:[['Payment ledger','Provider transaction IDs, status and linked invoices.'],['Coupons','Expiry, redemption limits, eligibility and usage reports.'],['Refunds & disputes','Require elevated permission and an audit trail.'],['Provider integration','Keep secrets server-side and verify webhook signatures.']],
            roles:[['Role templates','Owner, admin, content manager, evaluator and support.'],['Permission matrix','Separate read, create, edit, publish, export and delete.'],['Approval rules','Confirm or require second approval for high-risk actions.'],['Session management','Review and revoke sessions through trusted APIs.']],
            analytics:[['Performance trends','WPM, accuracy, errors, completion and category trends.'],['Conversion funnel','Registration, verification, first attempt and subscription.'],['Scoped exports','Report exports with access logging and privacy limits.'],['Operational alerts','Unusual score spikes, failed jobs and service degradation.']],
            security:[['Audit log','Who performed each privileged action and when.'],['Account enforcement','Ban/unban with reason, expiry and policy checks.'],['Abuse monitoring','Review suspicious attempts with transparent history.'],['Backup & recovery','Restore tests, incident response and key rotation.']],
            settings:[['Brand & navigation','Logo, theme, menu labels and public links.'],['Exam defaults','Default duration, scoring and leaderboard visibility.'],['Feature flags','Gradual rollout with safe rollback controls.'],['Maintenance & integrations','Maintenance page, email and payment settings.']]
        };
        const heading=$('module-title'), sub=$('module-subtitle'), box=$('module-capabilities'), status=$('module-status-title'), copy=$('module-status-copy');
        if(heading) heading.textContent=item.title;
        if(sub) sub.textContent=item.subtitle;
        if(status) status.textContent=view==='candidates'?'Candidate controls need a secure backend workflow':'Module blueprint — not yet connected';
        if(copy) copy.textContent='This screen documents intended controls only. It does not perform actions until database support, server-side authorization and audit behavior are implemented and tested.';
        if(box) box.innerHTML=(configs[view]||[]).map(([name,detail])=>'<article class="admin-capability"><strong>'+esc(name)+'</strong><p>'+esc(detail)+'</p></article>').join('');
    }


    /* =====================================================
       DASHBOARD
    ===================================================== */
async function loadDashboard() {

        try {

            await Promise.all([
                loadDashboardStats(),
                loadRecentAttempts()
            ]);

        } catch (error) {

            console.error(
                'Dashboard loading error:',
                error
            );

        }
    }


    async function loadDashboardStats() {

        /*
         * Attempts count
         */

        const attemptsResult =
            await supabaseClient
                .from('attempts')
                .select('id, net_wpm', {
                    count: 'exact'
                });


        if (!attemptsResult.error) {

            if ($('adm-total-attempts')) {

                $('adm-total-attempts')
                    .textContent =
                    attemptsResult.count || 0;
            }


            const rows =
                attemptsResult.data || [];


            if (rows.length) {

                const total =
                    rows.reduce(
                        (sum, row) =>
                            sum + Number(row.net_wpm || 0),
                        0
                    );


                const avg =
                    total / rows.length;


                if ($('adm-avg-wpm')) {

                    $('adm-avg-wpm')
                        .textContent =
                        avg.toFixed(2);
                }

            } else {

                if ($('adm-avg-wpm')) {
                    $('adm-avg-wpm').textContent = '0';
                }

            }
        }


        /*
         * Active tests
         */

        const testsResult =
            await supabaseClient
                .from('tests')
                .select('id', {
                    count: 'exact',
                    head: true
                })
                .eq('active', true);


        if (!testsResult.error) {

            if ($('adm-active-tests')) {

                $('adm-active-tests')
                    .textContent =
                    testsResult.count || 0;
            }
        }


        /*
         * Candidates
         */

        const candidatesResult =
            await supabaseClient
                .from('profiles')
                .select('id', {
                    count: 'exact',
                    head: true
                })
                .eq('role', 'candidate');


        if (!candidatesResult.error) {

            if ($('adm-total-candidates')) {

                $('adm-total-candidates')
                    .textContent =
                    candidatesResult.count || 0;
            }
        }
    }


    async function loadRecentAttempts() {

        const box =
            $('dashboard-recent-attempts');


        if (!box) {
            return;
        }


        box.innerHTML =
            '<div class="admin-empty">Loading...</div>';


        const { data, error } =
            await supabaseClient
                .from('attempts')
                .select(`
                    id,
                    candidate_name,
                    gross_wpm,
                    net_wpm,
                    accuracy,
                    total_errors,
                    created_at,
                    tests (
                        title
                    )
                `)
                .order('created_at', {
                    ascending: false
                })
                .limit(10);


        if (error) {

            console.error(
                'Recent attempts error:',
                error
            );

            box.innerHTML = `
                <div class="admin-error">
                    Unable to load recent attempts.
                    ${esc(error.message)}
                </div>
            `;

            return;
        }


        if (!data || !data.length) {

            box.innerHTML = `
                <div class="admin-empty">
                    No candidate attempts yet.
                </div>
            `;

            return;
        }


        box.innerHTML = createAttemptsTable(
            data,
            true
        );
    }


    /* =====================================================
       FOLDERS
    ===================================================== */

    async function loadFolders() {

        const folderBox =
            $('manage-folders-list');


        if (folderBox) {

            folderBox.innerHTML =
                '<div class="admin-empty">Loading folders...</div>';
        }


        const { data, error } =
            await supabaseClient
                .from('folders')
                .select('*')
                .order('sort_order', {
                    ascending: true
                })
                .order('created_at', {
                    ascending: true
                });


        if (error) {

            console.error(
                'Folders error:',
                error
            );


            if (folderBox) {

                folderBox.innerHTML = `
                    <div class="admin-error">
                        ${esc(error.message)}
                    </div>
                `;
            }

            return [];
        }


        cachedFolders = data || [];


        renderFolders(
            cachedFolders
        );


        populateFolderSelect(cachedFolders);
        folderBox?.querySelectorAll('[data-folder-edit]').forEach(button => button.addEventListener('click', () => openEditFolder(button.dataset.folderEdit)));
        folderBox?.querySelectorAll('[data-folder-delete]').forEach(button => button.addEventListener('click', () => deleteFolder(button.dataset.folderDelete)));
        folderBox?.querySelectorAll('[data-folder-toggle]').forEach(button => button.addEventListener('click', () => toggleFolderActive(button.dataset.folderToggle)));
        return cachedFolders;
    }


    function renderFolders(folders) {

        const box =
            $('manage-folders-list');


        if (!box) {
            return;
        }


        if (!folders.length) {

            box.innerHTML = `
                <div class="admin-empty">
                    No folders created yet.
                </div>
            `;

            return;
        }


        box.innerHTML =
            folders.map(folder => `

                <div class="admin-list-row">

                    <div class="list-main">

                        <strong>
                            ${esc(folder.name)}
                        </strong>

                        <small>
                            ${esc(
                                folder.description || ''
                            )}
                        </small>

                    </div>


                    <div class="list-meta">
                        <span class="status-badge ${folder.active ? 'active' : 'inactive'}">${folder.active ? 'Active' : 'Inactive'}</span>
                        <button type="button" class="admin-btn admin-btn-secondary" data-folder-toggle="${esc(folder.id)}">${folder.active ? 'Disable' : 'Enable'}</button>
                        <button type="button" class="admin-btn admin-btn-secondary" data-folder-edit="${esc(folder.id)}">Edit</button>
                        <button type="button" class="admin-btn admin-btn-danger" data-folder-delete="${esc(folder.id)}">Delete</button>
                    </div>

                </div>

            `).join('');
    }


    function populateFolderSelect(folders) {

        const select =
            $('test-folder');


        if (!select) {
            return;
        }


        const current =
            select.value;


        select.innerHTML = `
            <option value="">
                Select Folder
            </option>
        `;


        folders.forEach(folder => {

            const option =
                document.createElement('option');

            option.value =
                folder.id;

            option.textContent =
                folder.name;

            select.appendChild(option);

        });


        if (current) {
            select.value = current;
        }
    }


    /* =====================================================
       TESTS
    ===================================================== */

    async function loadManageTests() {

        await loadFolders();


        const testBox =
            $('manage-tests-list');


        if (testBox) {

            testBox.innerHTML =
                '<div class="admin-empty">Loading tests...</div>';
        }


        const { data, error } =
            await supabaseClient
                .from('tests')
                .select(`
                    *,
                    folders (
                        id,
                        name
                    )
                `)
                .order('created_at', {
                    ascending: false
                });


        if (error) {

            console.error(
                'Tests error:',
                error
            );


            if (testBox) {

                testBox.innerHTML = `
                    <div class="admin-error">
                        ${esc(error.message)}
                    </div>
                `;
            }

            return;
        }


        cachedTests = data || [];


        renderTests(
            cachedTests
        );


        populateTestFilter(cachedTests);
        testBox?.querySelectorAll('[data-test-edit]').forEach(button => button.addEventListener('click', () => openEditTest(button.dataset.testEdit)));
        testBox?.querySelectorAll('[data-test-delete]').forEach(button => button.addEventListener('click', () => deleteTest(button.dataset.testDelete)));
        testBox?.querySelectorAll('[data-test-toggle]').forEach(button => button.addEventListener('click', () => toggleTestActive(button.dataset.testToggle)));
    }


    function renderTests(tests) {

        const box =
            $('manage-tests-list');


        if (!box) {
            return;
        }


        if (!tests.length) {

            box.innerHTML = `
                <div class="admin-empty">
                    No typing tests created yet.
                </div>
            `;

            return;
        }


        box.innerHTML = `

            <table class="admin-table">

                <thead>

                    <tr>

                        <th>Test</th>
                        <th>Folder</th>
                        <th>Language</th>
                        <th>Duration</th>
                        <th>Target WPM</th>
                        <th>Accuracy</th>
                        <th>Status</th>
                        <th>Actions</th>

                    </tr>

                </thead>


                <tbody>

                    ${tests.map(test => `

                        <tr>

                            <td>
                                <strong>
                                    ${esc(test.title)}
                                </strong>
                            </td>


                            <td>
                                ${esc(
                                    test.folders?.name ||
                                    '—'
                                )}
                            </td>


                            <td>
                                ${esc(
                                    test.language ||
                                    '—'
                                )}
                            </td>


                            <td>
                                ${Number(
                                    test.duration_minutes || 0
                                )} min
                            </td>


                            <td>
                                ${Number(
                                    test.target_wpm || 0
                                )}
                            </td>


                            <td>
                                ${
                                    test.min_accuracy === null ||
                                    test.min_accuracy === undefined
                                        ? 'No minimum'
                                        : Number(
                                            test.min_accuracy
                                          ) + '%'
                                }
                            </td>


                            <td>

                                <span class="
                                    status-badge
                                    ${test.active
                                        ? 'active'
                                        : 'inactive'}
                                ">

                                    ${test.active
                                        ? 'Active'
                                        : 'Inactive'}

                                </span>

                            </td>
                            <td class="admin-row-actions">
                                <button type="button" class="admin-btn admin-btn-secondary" data-test-toggle="${esc(test.id)}">${test.active ? 'Disable' : 'Enable'}</button>
                                <button type="button" class="admin-btn admin-btn-secondary" data-test-edit="${esc(test.id)}">Edit</button>
                                <button type="button" class="admin-btn admin-btn-danger" data-test-delete="${esc(test.id)}">Delete</button>
                            </td>

                        </tr>

                    `).join('')}

                </tbody>

            </table>

        `;
    }


    function populateTestFilter(tests) {

        const select =
            $('attempt-test-filter');


        if (!select) {
            return;
        }


        select.innerHTML = `
            <option value="">
                All Tests
            </option>
        `;


        tests.forEach(test => {

            const option =
                document.createElement('option');

            option.value =
                test.id;

            option.textContent =
                test.title;

            select.appendChild(option);

        });
    }


    /* =====================================================
       CREATE FOLDER
    ===================================================== */

    function openFolderModal() {
        editingFolderId = null;
        $('folder-modal-title').textContent = 'Create folder';
        $('folder-form').querySelector('[type="submit"]').textContent = 'Create folder';
        $('folder-form').reset();
        $('folder-active').checked = true;
        $('folder-message').textContent = '';
        $('folder-modal').style.display = 'flex';
        $('folder-name').focus();
    }

    function openEditFolder(id) {
        const folder = cachedFolders.find(item => String(item.id) === String(id));
        if (!folder) return;
        editingFolderId = folder.id;
        $('folder-name').value = folder.name || '';
        $('folder-description').value = folder.description || '';
        $('folder-active').checked = Boolean(folder.active);
        $('folder-modal-title').textContent = 'Edit folder';
        $('folder-form').querySelector('[type="submit"]').textContent = 'Save folder';
        $('folder-message').textContent = '';
        $('folder-modal').style.display = 'flex';
        $('folder-name').focus();
    }

    async function toggleFolderActive(id) {
        const folder = cachedFolders.find(item => String(item.id) === String(id));
        if (!folder) return;
        const nextActive = !folder.active;
        const action = nextActive ? 'enable' : 'disable';
        if (!confirm((nextActive ? 'Enable' : 'Disable') + ' folder "' + folder.name + '"? ' + (nextActive ? 'Its active tests will become visible to candidates again.' : 'Tests in this folder will no longer be available to candidates.'))) return;
        const { error } = await supabaseClient.from('folders').update({ active: nextActive }).eq('id', id);
        if (error) { alert('Could not ' + action + ' folder: ' + error.message); return; }
        await loadManageTests();
    }

    async function toggleTestActive(id) {
        const test = cachedTests.find(item => String(item.id) === String(id));
        if (!test) return;
        const nextActive = !test.active;
        const action = nextActive ? 'enable' : 'disable';
        if (!confirm((nextActive ? 'Enable' : 'Disable') + ' typing test "' + test.title + '"?')) return;
        const { error } = await supabaseClient.from('tests').update({ active: nextActive }).eq('id', id);
        if (error) { alert('Could not ' + action + ' typing test: ' + error.message); return; }
        await loadManageTests();
    }

    async function deleteFolder(id) {
        const folder = cachedFolders.find(item => String(item.id) === String(id));
        if (!folder || !confirm('Delete folder "' + folder.name + '"? Folders linked to tests may be protected by database constraints.')) return;
        const { error } = await supabaseClient.from('folders').delete().eq('id', id);
        if (error) { alert(error.code === '23503' ? 'This folder still has typing tests linked to it. Move those tests to another folder or delete them first; you can also disable this folder instead.' : 'Could not delete folder: ' + error.message); return; }
        await loadManageTests();
    }


    function closeFolderModal() {

        $('folder-modal').style.display =
            'none';

        $('folder-form').reset();
        editingFolderId = null;
        $('folder-modal-title').textContent = 'Create folder';
        $('folder-form').querySelector('[type="submit"]').textContent = 'Create folder';
        $('folder-active').checked = true;

        $('folder-message').textContent = '';
    }


    async function createFolder(event) {

        event.preventDefault();


        const name =
            $('folder-name').value.trim();

        const description =
            $('folder-description').value.trim();

        const active =
            $('folder-active').checked;


        if (!name) {
            return;
        }


        const message =
            $('folder-message');


        message.textContent =
            'Creating folder...';


        const query = editingFolderId
            ? supabaseClient.from('folders').update({ name, description, active }).eq('id', editingFolderId)
            : supabaseClient.from('folders').insert({ name, description, active });
        const { error } = await query;


        if (error) {

            console.error(
                'Create folder error:',
                error
            );

            message.textContent =
                error.message;

            return;
        }


        message.textContent = editingFolderId ? 'Folder updated successfully.' : 'Folder created successfully.';


        await loadFolders();


        setTimeout(() => {

            closeFolderModal();

        }, 500);
    }


    /* =====================================================
       CREATE TEST
    ===================================================== */

    function openTestModal() {
        editingTestId = null;
        $('test-modal-title').textContent = 'Create typing test';
        $('test-form').querySelector('[type="submit"]').textContent = 'Create typing test';
        $('test-form').reset();
        $('test-duration').value = '5';
        $('test-target-wpm').value = '0';
        $('test-error-percent').value = '5';
        $('test-penalty').value = '10';
        $('test-active').checked = true;
        $('test-backspace-mode').value = 'candidate';
        $('test-highlight-mode').value = 'candidate';
        $('test-hide-mode').value = 'candidate';
        $('test-leaderboard').checked = true;
        if (!cachedFolders.length) {

            alert(
                'Please create a folder first.'
            );

            showAdminView('tests');

            return;
        }


        populateFolderSelect(
            cachedFolders
        );


        $('test-modal').style.display =
            'flex';

        $('test-title').focus();
    }


    function openEditTest(id) {
        const test = cachedTests.find(item => String(item.id) === String(id));
        if (!test) return;
        editingTestId = test.id;
        populateFolderSelect(cachedFolders);
        $('test-title').value = test.title || '';
        $('test-folder').value = test.folder_id || '';
        $('test-language').value = test.language || 'English';
        $('test-mode').value = test.mode || 'screen';
        $('test-duration').value = Number(test.duration_minutes || 5);
        $('test-target-wpm').value = Number(test.target_wpm || 0);
        $('test-min-accuracy').value = test.min_accuracy ?? '';
        $('test-error-percent').value = Number(test.free_error_pct ?? .05) * 100;
        $('test-penalty').value = Number(test.penalty_per_error ?? 10);
        $('test-content').value = test.passage || '';
        $('test-active').checked = Boolean(test.active);
        $('test-backspace-mode').value = test.backspace_mode || (test.allow_backspace ? 'on' : 'off');
        $('test-highlight-mode').value = test.highlight_mode || 'candidate';
        $('test-hide-mode').value = test.hide_paragraph_mode || 'candidate';
        $('test-leaderboard').checked = test.leaderboard_enabled !== false;
        $('test-modal-title').textContent = 'Edit typing test';
        $('test-form').querySelector('[type="submit"]').textContent = 'Save test changes';
        $('test-message').textContent = '';
        $('test-modal').style.display = 'flex';
        $('test-title').focus();
    }

    async function deleteTest(id) {
        const test = cachedTests.find(item => String(item.id) === String(id));
        if (!test || !confirm('Permanently delete test "' + test.title + '"? Existing attempts or sessions may be protected by database constraints.')) return;
        const { error } = await supabaseClient.from('tests').delete().eq('id', id);
        if (error) { alert(error.code === '23503' ? 'This test has saved attempts or exam sessions, so it cannot be permanently deleted. Disable it instead to keep historical results safe.' : 'Could not delete test: ' + error.message); return; }
        await loadManageTests();
    }

    function closeTestModal() {
        editingTestId = null;
        $('test-modal-title').textContent = 'Create typing test';
        $('test-form').querySelector('[type="submit"]').textContent = 'Create typing test';
        $('test-modal').style.display = 'none';

        $('test-form').reset();

        $('test-duration').value = '5';

        $('test-target-wpm').value = '0';

        $('test-error-percent').value = '5';

        $('test-penalty').value = '10';

        $('test-active').checked = true;

        $('test-backspace-mode').value = 'candidate';
        $('test-highlight-mode').value = 'candidate';
        $('test-hide-mode').value = 'candidate';

        $('test-leaderboard').checked =
            true;

        $('test-message').textContent = '';
    }


    async function createTest(event) {

        event.preventDefault();


        const message =
            $('test-message');


        const title =
            $('test-title').value.trim();

        const folderId =
            $('test-folder').value;

        const language =
            $('test-language').value;

        const duration =
            Number(
                $('test-duration').value
            );

        const targetWpm =
            Number(
                $('test-target-wpm').value
            ) || 0;

        const accuracyValue =
            $('test-min-accuracy').value;

        const minAccuracy =
            accuracyValue === ''
                ? null
                : Number(accuracyValue);

        const permissibleErrorPercent =
            Number(
                $('test-error-percent').value
            );

        const penaltyWords =
            Number(
                $('test-penalty').value
            );

        const content =
            $('test-content').value.trim();

        const mode =
            $('test-mode').value;

        const backspaceMode = $('test-backspace-mode').value;
        const highlightMode = $('test-highlight-mode').value;
        const hideParagraphMode = $('test-hide-mode').value;

        const active =
            $('test-active').checked;

        const leaderboard =
            $('test-leaderboard').checked;


        if (!title ||
            !folderId ||
            !content) {

            message.textContent =
                'Please fill all required fields.';

            return;
        }


        message.textContent =
            'Creating test...';


        const values = {
            title,
            folder_id: folderId,
            language,
            duration_minutes: duration,
            target_wpm: targetWpm,
            min_accuracy: minAccuracy,
            free_error_pct: permissibleErrorPercent / 100,
            penalty_per_error: penaltyWords,
            passage: content,
            mode,
            allow_backspace: backspaceMode === 'on' || (backspaceMode === 'candidate' && Boolean(editingTestId ? cachedTests.find(item => String(item.id) === String(editingTestId))?.allow_backspace : false)),
            backspace_mode: backspaceMode,
            highlight_mode: highlightMode,
            hide_paragraph_mode: hideParagraphMode,
            active,
            leaderboard_enabled: leaderboard
        };
        const query = editingTestId
            ? supabaseClient.from('tests').update(values).eq('id', editingTestId)
            : supabaseClient.from('tests').insert(values);
        const { error } = await query;


        if (error) {

            console.error(
                'Create test error:',
                error
            );

            message.textContent =
                error.message;

            return;
        }


        message.textContent = editingTestId ? 'Typing test updated successfully.' : 'Typing test created successfully.';


        await loadManageTests();


        setTimeout(() => {

            closeTestModal();

        }, 500);
    }


    /* =====================================================
       ALL ATTEMPTS
    ===================================================== */

    async function loadAllAttempts() {

        const box =
            $('all-attempts-list');


        if (box) {

            box.innerHTML =
                '<div class="admin-empty">Loading attempts...</div>';
        }


        const { data, error } =
            await supabaseClient
                .from('attempts')
                .select(`
                    id,
                    candidate_name,
                    candidate_id,
                    language,
                    duration_seconds,
                    typed_words,
                    total_errors,
                    gross_wpm,
                    net_wpm,
                    accuracy,
                    suspicious_events,
                    created_at,
                    tests (
                        id,
                        title
                    )
                `)
                .order('created_at', {
                    ascending: false
                })
                .limit(500);


        if (error) {

            console.error(
                'Attempts error:',
                error
            );


            if (box) {

                box.innerHTML = `
                    <div class="admin-error">
                        ${esc(error.message)}
                    </div>
                `;
            }

            return;
        }


        cachedAttempts =
            data || [];


        renderFilteredAttempts();
    }


    function renderFilteredAttempts() {

        const search =
            (
                $('attempt-search')?.value ||
                ''
            )
                .trim()
                .toLowerCase();


        const testId =
            $('attempt-test-filter')?.value ||
            '';


        const language =
            $('attempt-language-filter')?.value ||
            '';


        const filtered =
            cachedAttempts.filter(attempt => {

                const candidate =
                    String(
                        attempt.candidate_name || ''
                    )
                        .toLowerCase();


                const matchesSearch =
                    !search ||
                    candidate.includes(search);


                const matchesTest =
                    !testId ||
                    attempt.tests?.id === testId;


                const matchesLanguage =
                    !language ||
                    attempt.language === language;


                return (
                    matchesSearch &&
                    matchesTest &&
                    matchesLanguage
                );
            });


        const box =
            $('all-attempts-list');


        if (!box) {
            return;
        }


        if (!filtered.length) {

            box.innerHTML = `
                <div class="admin-empty">
                    No matching attempts found.
                </div>
            `;

            return;
        }


        box.innerHTML =
            createAttemptsTable(
                filtered,
                false
            );
    }


    function createAttemptsTable(
        attempts,
        compact = false
    ) {

        return `

            <div class="table-scroll">

                <table class="admin-table">

                    <thead>

                        <tr>

                            <th>Candidate</th>
                            <th>Test</th>
                            <th>Gross WPM</th>
                            <th>Net WPM</th>
                            <th>Accuracy</th>
                            <th>Errors</th>
                            <th>Date</th>

                        </tr>

                    </thead>


                    <tbody>

                        ${attempts.map(attempt => `

                            <tr>

                                <td>
                                    <strong>
                                        ${esc(
                                            attempt.candidate_name ||
                                            'Unknown'
                                        )}
                                    </strong>
                                </td>


                                <td>
                                    ${esc(
                                        attempt.tests?.title ||
                                        '—'
                                    )}
                                </td>


                                <td>
                                    ${formatNumber(
                                        attempt.gross_wpm
                                    )}
                                </td>


                                <td>
                                    <strong>
                                        ${formatNumber(
                                            attempt.net_wpm
                                        )}
                                    </strong>
                                </td>


                                <td>
                                    ${formatNumber(
                                        attempt.accuracy
                                    )}%
                                </td>


                                <td>
                                    ${Number(
                                        attempt.total_errors || 0
                                    )}
                                </td>


                                <td>
                                    ${formatDate(
                                        attempt.created_at
                                    )}
                                </td>

                            </tr>

                        `).join('')}

                    </tbody>

                </table>

            </div>

        `;
    }


    /* =====================================================
       CSV EXPORT
    ===================================================== */

    function exportAttemptsCSV() {

        if (!cachedAttempts.length) {

            alert(
                'No attempts available to export.'
            );

            return;
        }


        const rows = [

            [
                'Candidate',
                'Test',
                'Language',
                'Gross WPM',
                'Net WPM',
                'Accuracy',
                'Errors',
                'Date'
            ],

            ...cachedAttempts.map(a => [

                a.candidate_name || '',

                a.tests?.title || '',

                a.language || '',

                a.gross_wpm || 0,

                a.net_wpm || 0,

                a.accuracy || 0,

                a.total_errors || 0,

                formatDate(a.created_at)

            ])

        ];


        const csv =
            rows.map(row =>

                row.map(value => {

                    const text =
                        String(value)
                            .replace(/"/g, '""');

                    return `"${text}"`;

                }).join(',')

            ).join('\n');


        const blob =
            new Blob(
                [csv],
                {
                    type:
                        'text/csv;charset=utf-8;'
                }
            );


        const url =
            URL.createObjectURL(blob);


        const link =
            document.createElement('a');


        link.href = url;

        link.download =
            `candidate-attempts-${Date.now()}.csv`;


        document.body.appendChild(link);

        link.click();

        link.remove();

        URL.revokeObjectURL(url);
    }


    /* =====================================================
       EVENT LISTENERS
    ===================================================== */

    function setupNavigation() {
        document.querySelectorAll('[data-module]').forEach(button => {
            button.addEventListener('click', () => {
                const module = button.getAttribute('data-module');
                showAdminView(module);
                $('admin-sidebar')?.classList.remove('is-open');
            });
        });


        $('nav-dash')?.addEventListener(
            'click',
            event => {

                event.preventDefault();

                showAdminView(
                    'dashboard'
                );
            }
        );


        $('nav-tests')?.addEventListener(
            'click',
            event => {

                event.preventDefault();

                showAdminView(
                    'tests'
                );
            }
        );


        $('nav-attempts')?.addEventListener(
            'click',
            event => {

                event.preventDefault();

                showAdminView(
                    'attempts'
                );
            }
        );


        $('nav-logout')?.addEventListener(
            'click',
            async event => {

                event.preventDefault();

                await AuthManager.logout();

            }
        );
    }


    function setupDashboardActions() {
        document.querySelectorAll('[data-quick-action]').forEach(button => button.addEventListener('click', async () => {
            const action = button.getAttribute('data-quick-action');
            if (action === 'create-test') { showAdminView('tests'); await loadFolders(); openTestModal(); }
            if (action === 'view-attempts') showAdminView('attempts');
        }));


        $('quick-create-folder')
            ?.addEventListener(
                'click',
                () => {

                    showAdminView('tests');

                    openFolderModal();

                }
            );


        $('quick-create-test')
            ?.addEventListener(
                'click',
                async () => {

                    showAdminView('tests');

                    await loadFolders();

                    openTestModal();

                }
            );


        $('quick-view-attempts')
            ?.addEventListener(
                'click',
                () => {

                    showAdminView(
                        'attempts'
                    );

                }
            );


        $('dashboard-view-all')
            ?.addEventListener(
                'click',
                () => {

                    showAdminView(
                        'attempts'
                    );

                }
            );
    }


    function setupFolderActions() {


        $('btn-create-folder')
            ?.addEventListener(
                'click',
                openFolderModal
            );


        $('folder-modal-close')
            ?.addEventListener(
                'click',
                closeFolderModal
            );


        $('folder-cancel')
            ?.addEventListener(
                'click',
                closeFolderModal
            );


        $('folder-form')
            ?.addEventListener(
                'submit',
                createFolder
            );


        $('refresh-folders')
            ?.addEventListener(
                'click',
                loadFolders
            );
    }


    function setupTestActions() {


        $('btn-create-test')
            ?.addEventListener(
                'click',
                async () => {

                    await loadFolders();

                    openTestModal();

                }
            );


        $('test-modal-close')
            ?.addEventListener(
                'click',
                closeTestModal
            );


        $('test-cancel')
            ?.addEventListener(
                'click',
                closeTestModal
            );


        $('test-form')
            ?.addEventListener(
                'submit',
                createTest
            );


        $('refresh-tests')
            ?.addEventListener(
                'click',
                loadManageTests
            );
    }


    function setupAttemptActions() {


        $('refresh-attempts')
            ?.addEventListener(
                'click',
                loadAllAttempts
            );


        $('export-attempts')
            ?.addEventListener(
                'click',
                exportAttemptsCSV
            );


        $('attempt-search')
            ?.addEventListener(
                'input',
                renderFilteredAttempts
            );


        $('attempt-test-filter')
            ?.addEventListener(
                'change',
                renderFilteredAttempts
            );


        $('attempt-language-filter')
            ?.addEventListener(
                'change',
                renderFilteredAttempts
            );
    }


    /* =====================================================
       INIT
    ===================================================== */

    async function init() {

        const allowed =
            await checkAdminAccess();


        if (!allowed) {
            return;
        }


        setupNavigation();

        setupDashboardActions();

        setupFolderActions();

        setupTestActions();

        setupAttemptActions();
        $('admin-menu-toggle')?.addEventListener('click', () => $('admin-sidebar')?.classList.toggle('is-open'));
        $('admin-refresh')?.addEventListener('click', () => { if (currentView === 'dashboard') loadDashboard(); else if (currentView === 'tests') loadManageTests(); else if (currentView === 'attempts') loadAllAttempts(); });
        if ($('admin-loading')) $('admin-loading').style.display = 'none';
        if ($('admin-app')) $('admin-app').style.display = 'flex';


        showAdminView(
            'dashboard'
        );
    }


    /*
     * Start only after DOM is ready.
     */

    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            init
        );

    } else {

        init();

    }

})();