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
                        title,
                        target_wpm,
                        min_accuracy
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
        folderBox?.querySelectorAll('[data-folder-tests-toggle]').forEach(button => button.addEventListener('click', () => { const panel = document.getElementById('folder-tests-' + button.dataset.folderTestsToggle); if (panel) { const open = panel.hidden; panel.hidden = !open; button.setAttribute('aria-expanded', String(open)); button.textContent = open ? '▴ Hide tests' : '▾ View tests'; } }));
        folderBox?.querySelectorAll('[data-folder-test-edit]').forEach(button => button.addEventListener('click', () => openEditTest(button.dataset.folderTestEdit)));
        folderBox?.querySelectorAll('[data-folder-test-delete]').forEach(button => button.addEventListener('click', () => deleteTest(button.dataset.folderTestDelete)));
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
            folders.map(folder => {
                const folderTests = cachedTests.filter(test => String(test.folder_id || '') === String(folder.id));
                const activeCount = folderTests.filter(test => test.active).length;
                return `

                <div class="admin-list-row">

                    <div class="folder-admin-thumb">${folder.thumbnail_url ? `<img src="${esc(folder.thumbnail_url)}" alt="">` : `<span>▦</span>`}</div>
                    <div class="list-main">

                        <strong>
                            ${esc(folder.name)}
                        </strong>

                        <small>
                            ${esc(folder.description || 'No description')} · ${folderTests.length} test(s) · ${activeCount} active · ${folderTests.reduce((sum, test) => sum + String(test.passage || '').trim().split(/\s+/).filter(Boolean).length, 0).toLocaleString()} total words
                        </small>

                    </div>


                    <div class="list-meta folder-action-stack">
                        <span class="status-badge ${folder.active ? 'active' : 'inactive'}">${folder.active ? 'Active' : 'Inactive'}</span>
                        <button type="button" class="admin-btn admin-btn-secondary" data-folder-tests-toggle="${esc(folder.id)}" aria-expanded="false">▾ View tests (${folderTests.length})</button>
                        <button type="button" class="admin-btn admin-btn-secondary" data-folder-toggle="${esc(folder.id)}">${folder.active ? 'Disable' : 'Enable'}</button>
                        <button type="button" class="admin-btn admin-btn-secondary" data-folder-edit="${esc(folder.id)}">Edit</button>
                        <button type="button" class="admin-btn admin-btn-danger" data-folder-delete="${esc(folder.id)}">Delete</button>
                    </div>
                </div>
                <div class="folder-test-drawer" id="folder-tests-${esc(folder.id)}" hidden>
                  ${folderTests.length ? folderTests.map(test => `<div class="folder-test-drawer-row"><div><strong>${esc(test.title)}</strong><small>${esc(test.language || 'English')} · ${Number(test.duration_minutes || 0)} min · ${String(test.passage || '').trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words</small></div><span class="status-badge ${test.active ? 'active' : 'inactive'}">${test.active ? 'Published' : 'Draft'}</span><button type="button" class="admin-btn admin-btn-secondary" data-folder-test-edit="${esc(test.id)}">Edit</button><button type="button" class="admin-btn admin-btn-danger" data-folder-test-delete="${esc(test.id)}">Delete</button></div>`).join('') : '<p class="admin-empty">This folder has no tests yet.</p>'}
                </div>

            `;
            }).join('');
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

        renderFolders(cachedFolders);
        renderLibraryFolderFilter();
        renderFilteredLibraryTests();

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
                        <th>Words</th>
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
                                <strong>${esc(test.title)}</strong>
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


                            <td>${String(test.passage || '').trim().split(/\s+/).filter(Boolean).length.toLocaleString()}</td>
                            <td>${Number(test.target_wpm || 0)}</td>


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


    function renderLibraryFolderFilter() {
        const select = $('library-folder-filter');
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">All folders</option>' + cachedFolders.map(folder =>
            '<option value="' + esc(folder.id) + '">' + esc(folder.name) + ' (' +
            cachedTests.filter(test => String(test.folder_id || '') === String(folder.id)).length + ')</option>'
        ).join('');
        if (current && cachedFolders.some(folder => String(folder.id) === current)) select.value = current;
    }

    function renderFilteredLibraryTests() {
        const query = String($('library-test-search')?.value || '').trim().toLowerCase();
        const folderId = String($('library-folder-filter')?.value || '');
        const status = String($('library-status-filter')?.value || '');
        const filtered = cachedTests.filter(test => {
            const haystack = [test.title, test.folders?.name, test.language, test.passage].join(' ').toLowerCase();
            return (!query || haystack.includes(query)) &&
                (!folderId || String(test.folder_id || '') === folderId) &&
                (!status || (status === 'active' ? Boolean(test.active) : !test.active));
        });
        const count = $('library-test-count');
        if (count) count.textContent = filtered.length + ' of ' + cachedTests.length + ' tests · ' +
            filtered.reduce((sum, test) => sum + String(test.passage || '').trim().split(/\s+/).filter(Boolean).length, 0).toLocaleString() + ' words';
        renderTests(filtered);
        const testBox = $('manage-tests-list');
        testBox?.querySelectorAll('[data-test-edit]').forEach(button => button.addEventListener('click', () => openEditTest(button.dataset.testEdit)));
        testBox?.querySelectorAll('[data-test-delete]').forEach(button => button.addEventListener('click', () => deleteTest(button.dataset.testDelete)));
        testBox?.querySelectorAll('[data-test-toggle]').forEach(button => button.addEventListener('click', () => toggleTestActive(button.dataset.testToggle)));
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


    function folderStoragePath(url) {
        const marker = '/storage/v1/object/public/folder-thumbnails/';
        const at = String(url || '').indexOf(marker);
        return at < 0 ? null : decodeURIComponent(String(url).slice(at + marker.length));
    }

    function renderFolderThumbnailPreview(url) {
        const preview = $('folder-thumbnail-preview');
        if (!preview) return;
        preview.innerHTML = url ? '<img src="' + esc(url) + '" alt="Folder thumbnail preview">' : '<span>No thumbnail selected</span>';
    }

    async function uploadFolderThumbnail(file) {
        if (!file) return null;
        if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG or WebP image.');
        if (file.size > 5 * 1024 * 1024) throw new Error('Thumbnail must be 5 MB or smaller.');
        const dimensions = await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => { resolve({width:image.naturalWidth,height:image.naturalHeight}); URL.revokeObjectURL(image.src); };
            image.onerror = () => reject(new Error('Could not read this image.'));
            image.src = URL.createObjectURL(file);
        });
        if (Math.abs(dimensions.width / dimensions.height - 16 / 9) > 0.025) throw new Error('Please crop the thumbnail to 16:9 before uploading.');
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-90);
        const path = Date.now() + '-' + safeName;
        const {error} = await supabaseClient.storage.from('folder-thumbnails').upload(path, file, {upsert:false,contentType:file.type,cacheControl:'3600'});
        if (error) throw error;
        const {data} = supabaseClient.storage.from('folder-thumbnails').getPublicUrl(path);
        return data.publicUrl;
    }

    async function removeFolderThumbnail(url) {
        const path = folderStoragePath(url);
        if (!path) return;
        const {error} = await supabaseClient.storage.from('folder-thumbnails').remove([path]);
        if (error) console.warn('Old thumbnail could not be removed:', error.message);
    }

    function openFolderModal() {
        editingFolderId = null;
        $('folder-modal-title').textContent = 'Create folder';
        $('folder-form').querySelector('[type="submit"]').textContent = 'Create folder';
        $('folder-form').reset();
        $('folder-active').checked = true;
        $('folder-thumbnail').value = '';
        $('folder-remove-thumbnail').checked = false;
        renderFolderThumbnailPreview('');
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
        $('folder-thumbnail').value = '';
        $('folder-remove-thumbnail').checked = false;
        renderFolderThumbnailPreview(folder.thumbnail_url);
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
        const { data: updatedFolder, error } = await supabaseClient.from('folders').update({ active: nextActive }).eq('id', id).select('id, active').maybeSingle();
        if (error) { alert('Could not ' + action + ' folder: ' + error.message); return; }
        if (!updatedFolder) { alert('Folder was not changed. Your admin permissions may have expired; refresh and sign in again.'); return; }
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
        if (error) {
            alert(error.code === '23503' ? 'This folder still has typing tests linked to it. Move those tests to another folder or delete them first; you can also disable this folder instead.' : 'Could not delete folder: ' + error.message);
            return;
        }
        await removeFolderThumbnail(folder.thumbnail_url);
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
        const name = $('folder-name').value.trim();
        const description = $('folder-description').value.trim();
        const active = $('folder-active').checked;
        const currentFolder = editingFolderId ? cachedFolders.find(item => String(item.id) === String(editingFolderId)) : null;
        const message = $('folder-message');
        if (!name) return;
        message.textContent = 'Saving folder...';
        let thumbnailUrl = currentFolder?.thumbnail_url || null;
        try {
            const file = $('folder-thumbnail')?.files?.[0];
            if ($('folder-remove-thumbnail')?.checked) thumbnailUrl = null;
            if (file) thumbnailUrl = await uploadFolderThumbnail(file);
        } catch (error) {
            message.textContent = error.message || 'Thumbnail upload failed.';
            return;
        }
        const values = { name, description, active, thumbnail_url: thumbnailUrl };
        try {
            // Request the saved row back. PostgREST can report no error for an
            // UPDATE that matched zero rows (for example when RLS filters it out).
            const { data: savedFolder, error } = editingFolderId
                ? await supabaseClient.from('folders').update(values).eq('id', editingFolderId).select('*').maybeSingle()
                : await supabaseClient.from('folders').insert(values).select('*').single();

            if (error) throw error;
            if (!savedFolder) {
                throw new Error('No folder was saved. Your admin session or folder permissions may have expired; refresh and sign in again.');
            }

            if (currentFolder?.thumbnail_url && currentFolder.thumbnail_url !== thumbnailUrl) {
                await removeFolderThumbnail(currentFolder.thumbnail_url);
            }

            // Refresh the authoritative list and keep the modal open if refresh fails.
            await loadFolders();
            message.textContent = editingFolderId ? 'Folder updated successfully.' : 'Folder created successfully.';
            setTimeout(closeFolderModal, 500);
        } catch (error) {
            console.error('Save folder error:', error);
            message.textContent = error.message || 'Could not save folder. Check admin permissions and try again.';
            if (thumbnailUrl && thumbnailUrl !== currentFolder?.thumbnail_url) {
                await removeFolderThumbnail(thumbnailUrl);
            }
        }
    }


    /* =====================================================
       CREATE TEST
    ===================================================== */

    function openTestModal() {
        const modal = $('test-modal');
        const form = $('test-form');
        const modalTitle = $('test-modal-title');
        const submitButton = form?.querySelector('[type="submit"]');

        // Fail clearly if the deployed HTML and JS are out of sync instead of
        // throwing an opaque "Cannot set properties of null" error.
        if (!modal || !form || !modalTitle || !submitButton) {
            console.error('Cannot open test modal: required elements are missing.', {
                modal: !!modal,
                form: !!form,
                modalTitle: !!modalTitle,
                submitButton: !!submitButton
            });
            alert('The test form did not load correctly. Refresh the admin page; if the issue continues, clear the site cache and try again.');
            return;
        }

        editingTestId = null;
        modalTitle.textContent = 'Create typing test';
        submitButton.textContent = 'Create typing test';
        form.reset();
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

        const selectedMode = $('test-mode').value;
        // "candidate" is a supported policy: the candidate selects the typing
        // layout at test start. Keep the database value; do not silently coerce it.
        const mode = ['screen', 'page', 'candidate'].includes(selectedMode) ? selectedMode : 'screen';

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

            message.textContent = error.code === '23514' && error.message?.includes('tests_mode_check')
                ? 'This database is missing support for the “candidate chooses mode” setting. Refresh after the database update, or select Screen → Screen / Page → Screen for now.'
                : error.message;

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

    function attemptQualified(attempt) {
        const test = attempt.tests || {};
        const netWpm = Number(attempt.net_wpm || 0);
        const accuracy = Number(attempt.accuracy || 0);
        const target = test.target_wpm === null || test.target_wpm === undefined || test.target_wpm === '' ? null : Number(test.target_wpm);
        const minimum = test.min_accuracy === null || test.min_accuracy === undefined || test.min_accuracy === '' ? null : Number(test.min_accuracy);
        return (target === null || netWpm >= target) && (minimum === null || accuracy >= minimum);
    }

    function localDateKey(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }

    async function loadReportTestOptions() {
        const select = $('report-test-filter');
        if (!select) return;
        const { data, error } = await supabaseClient.from('tests').select('id,title').order('title', { ascending: true });
        if (error) {
            select.innerHTML = '<option value="">Could not load tests</option>';
            console.error('Report test list error:', error);
            return;
        }
        select.innerHTML = (data || []).map(test => '<option value="' + esc(test.id) + '">' + esc(test.title) + '</option>').join('');
    }

    async function loadAllAttempts() {
        const box = $('all-attempts-list');
        if (box) box.innerHTML = '<div class="admin-empty">Loading attempts…</div>';
        const pageSize = 1000;
        const all = [];
        let offset = 0;
        let failed = null;
        while (true) {
            const { data, error } = await supabaseClient
                .from('attempts')
                .select('id,candidate_name,candidate_id,language,duration_seconds,typed_words,total_errors,gross_wpm,net_wpm,accuracy,suspicious_events,created_at,tests(id,title,target_wpm,min_accuracy)')
                .order('created_at', { ascending: false })
                .range(offset, offset + pageSize - 1);
            if (error) { failed = error; break; }
            const rows = data || [];
            all.push(...rows);
            if (rows.length < pageSize) break;
            offset += pageSize;
            if (offset >= 50000) break;
        }
        if (failed) {
            console.error('Attempts error:', failed);
            if (box) box.innerHTML = '<div class="admin-error">' + esc(failed.message) + '</div>';
            return;
        }
        cachedAttempts = all;
        await loadReportTestOptions();
        renderFilteredAttempts();
    }

    function getFilteredAttempts() {
        const search = String($('attempt-search')?.value || '').trim().toLowerCase();
        const language = $('attempt-language-filter')?.value || '';
        const resultType = $('report-result-filter')?.value || '';
        const dateFrom = $('report-date-from')?.value || '';
        const dateTo = $('report-date-to')?.value || '';
        const testSelect = $('report-test-filter');
        const selectedTestIds = testSelect ? [...testSelect.selectedOptions].map(option => option.value).filter(Boolean) : [];
        return cachedAttempts.filter(attempt => {
            const candidate = String(attempt.candidate_name || '').toLowerCase();
            const matchesSearch = !search || candidate.includes(search);
            const matchesLanguage = !language || attempt.language === language;
            const matchesTest = !selectedTestIds.length || selectedTestIds.includes(String(attempt.tests?.id || ''));
            const dateKey = localDateKey(attempt.created_at);
            const matchesFrom = !dateFrom || dateKey >= dateFrom;
            const matchesTo = !dateTo || dateKey <= dateTo;
            const qualified = attemptQualified(attempt);
            const matchesResult = !resultType || (resultType === 'qualify' ? qualified : !qualified);
            return matchesSearch && matchesLanguage && matchesTest && matchesFrom && matchesTo && matchesResult;
        });
    }

    function renderFilteredAttempts() {
        const filtered = getFilteredAttempts();
        const box = $('all-attempts-list');
        if (box) {
            if (!filtered.length) box.innerHTML = '<div class="admin-empty">No matching attempts found for these filters.</div>';
            else box.innerHTML = createAttemptsTable(filtered, false);
        }
        const candidates = new Set(filtered.map(a => String(a.candidate_id || a.candidate_name || 'Unknown')));
        const qualified = filtered.filter(attemptQualified).length;
        const failed = filtered.length - qualified;
        const percentage = filtered.length ? (qualified / filtered.length * 100).toFixed(2) : '0.00';
        const summary = $('report-filter-summary');
        if (summary) summary.textContent = filtered.length.toLocaleString() + ' attempts · ' + candidates.size.toLocaleString() + ' candidates · ' + qualified + ' qualify · ' + failed + ' fail · ' + percentage + '% qualifying';
    }

    function escapeReportHtml(value) {
        return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function exportResultsPDF() {
        const attempts = getFilteredAttempts();
        if (!attempts.length) { alert('No results match the selected filters. Adjust the dates or filters and try again.'); return; }
        const printWindow = window.open('', '_blank');
        if (!printWindow) { alert('The PDF report window was blocked. Allow pop-ups for this website, then try again.'); return; }
        const sorted = [...attempts].sort((a, b) => {
            const candidate = String(a.candidate_name || '').localeCompare(String(b.candidate_name || ''));
            return candidate || new Date(a.created_at) - new Date(b.created_at);
        });
        const qualified = sorted.filter(attemptQualified).length;
        const failed = sorted.length - qualified;
        const candidateCount = new Set(sorted.map(a => String(a.candidate_id || a.candidate_name || 'Unknown'))).size;
        const percentage = sorted.length ? (qualified / sorted.length * 100).toFixed(2) : '0.00';
        const from = $('report-date-from')?.value || 'Any';
        const to = $('report-date-to')?.value || 'Any';
        const selectedTests = $('report-test-filter');
        const selectedNames = selectedTests ? [...selectedTests.selectedOptions].map(o => o.textContent) : [];
        const testLabel = selectedNames.length ? selectedNames.join(', ') : 'All tests';
        const rows = sorted.map((attempt, index) => {
            const status = attemptQualified(attempt);
            const seconds = Number(attempt.duration_seconds || 0);
            const duration = Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
            return '<tr><td class="serial">' + (index + 1) + '</td><td class="candidate">' + escapeReportHtml(attempt.candidate_name || 'Unknown') + '<small>ID: ' + escapeReportHtml(attempt.candidate_id || '—') + '</small></td><td>' + escapeReportHtml(attempt.tests?.title || 'Untitled test') + '</td><td>' + escapeReportHtml(attempt.language || '—') + '</td><td class="num">' + Number(attempt.gross_wpm || 0).toFixed(2) + '</td><td class="num">' + Number(attempt.net_wpm || 0).toFixed(2) + '</td><td class="num">' + Number(attempt.accuracy || 0).toFixed(2) + '%</td><td class="num">' + Number(attempt.total_errors || 0) + '</td><td class="num">' + duration + '</td><td>' + escapeReportHtml(new Date(attempt.created_at).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true })) + '</td><td><span class="status ' + (status ? 'pass' : 'fail') + '">' + (status ? 'QUALIFY' : 'FAIL') + '</span></td></tr>';
        }).join('');
        const reportHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Decoding HCM — Result Report</title><style>' +
        '@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;margin:0;font-size:10px;-webkit-print-color-adjust:exact;print-color-adjust:exact}.masthead{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #263b82;padding:0 0 12px;margin-bottom:14px}.brand{display:flex;align-items:center;gap:10px}.logo{width:54px;height:54px;object-fit:contain;display:block}.brand h1{font-size:20px;margin:0 0 4px;color:#1e2b55}.brand p{margin:0;color:#64708a;font-size:10px}.report-meta{text-align:right;color:#59657b;line-height:1.7}.report-title{display:flex;justify-content:space-between;align-items:end;margin:12px 0}.report-title h2{font-size:16px;margin:0;color:#172b65}.report-title p{margin:4px 0 0;color:#65718a}.filter-note{max-width:45%;text-align:right;color:#5d6980;overflow-wrap:anywhere}.summary,.final-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:12px 0 15px}.summary{display:none}.metric{border:1px solid #d7deeb;border-top:3px solid #4055a4;border-radius:6px;padding:9px 10px;background:#f7f9fe}.metric strong{display:block;font-size:18px;color:#1e2b55;margin-top:4px}.metric span{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#65718a}.metric.qualify{border-top-color:#17834c}.metric.qualify strong{color:#137342}.metric.fail{border-top-color:#c33745}.metric.fail strong{color:#b42332}.metric.rate{border-top-color:#087f8c}.table-wrap{width:100%}table{width:100%;border-collapse:collapse;table-layout:auto}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th{background:#263b82;color:#fff;text-align:left;font-size:8.5px;text-transform:uppercase;letter-spacing:.25px;padding:8px 6px;border:1px solid #1d2d66}td{padding:7px 6px;border:1px solid #d7deea;vertical-align:top;font-size:9px}tbody tr:nth-child(even){background:#f5f7fc}td.serial,td.num{text-align:center;font-variant-numeric:tabular-nums;white-space:nowrap}td.serial{font-weight:700;color:#46557b}td.candidate{font-weight:700;min-width:100px}td.candidate small{display:block;font-weight:400;color:#6d7890;margin-top:3px;font-size:8px}.status{display:inline-block;border-radius:4px;padding:4px 6px;font-size:8px;font-weight:800;letter-spacing:.4px;white-space:nowrap}.status.pass{background:#dcfce7;color:#166534;border:1px solid #86d6a3}.status.fail{background:#fee2e2;color:#991b1b;border:1px solid #f2a2a2}.report-footer{border-top:2px solid #263b82;margin-top:16px;padding-top:10px;display:flex;justify-content:space-between;gap:20px;color:#65718a;font-size:9px}.links{display:flex;gap:12px;flex-wrap:wrap}.links a{color:#263b82;text-decoration:none;font-weight:700}.disclaimer{margin-top:8px;color:#7b8497;font-size:8px}@media screen{body{padding:22px;background:#eef1f8}.paper{max-width:1500px;margin:0 auto;background:#fff;padding:25px;box-shadow:0 8px 35px #1b2d5218;border-radius:10px}}@media print{.paper{padding:0}.report-footer{break-inside:avoid}}' +
        '</style></head><body><main class="paper"><header class="masthead"><div class="brand"><img class="logo" src="https://decoding-hcm.vercel.app/logo.png" alt="Decoding HCM logo"><div><h1>Decoding HCM</h1><p>HCM Typing Test &amp; Practice Platform</p></div></div><div class="report-meta"><strong>ADMINISTRATIVE PERFORMANCE SUMMARY</strong><br>Generated: ' + escapeReportHtml(new Date().toLocaleString('en-IN')) + '<br>Website: decoding-hcm.vercel.app</div></header><section class="report-title"><div><h2>Candidate Result &amp; Attempt Report</h2><p>Attempt-wise performance • Qualification evaluated against each test’s configured target</p></div><div class="filter-note"><strong>Period:</strong> ' + escapeReportHtml(from) + ' to ' + escapeReportHtml(to) + '<br><strong>Tests:</strong> ' + escapeReportHtml(testLabel) + '</div></section><section class="summary"><div class="metric"><span>Total candidates</span><strong>' + candidateCount + '</strong></div><div class="metric"><span>Total attempts</span><strong>' + sorted.length + '</strong></div><div class="metric qualify"><span>Total qualify</span><strong>' + qualified + '</strong></div><div class="metric fail"><span>Total fail</span><strong>' + failed + '</strong></div><div class="metric rate"><span>Qualifying percentage</span><strong>' + percentage + '%</strong></div></section><div class="table-wrap"><table><thead><tr><th>Sr. No.</th><th>Candidate name / ID</th><th>Test name</th><th>Language</th><th>Gross WPM</th><th>Net WPM</th><th>Accuracy</th><th>Total errors</th><th>Time</th><th>Attempt date &amp; time</th><th>Result</th></tr></thead><tbody>' + rows + '</tbody></table></div><section class="summary final-summary"><div class="metric"><span>Total candidates</span><strong>' + candidateCount + '</strong></div><div class="metric"><span>Total attempts</span><strong>' + sorted.length + '</strong></div><div class="metric qualify"><span>Total qualify</span><strong>' + qualified + '</strong></div><div class="metric fail"><span>Total fail</span><strong>' + failed + '</strong></div><div class="metric rate"><span>Qualifying percentage</span><strong>' + percentage + '%</strong></div></section><footer class="report-footer"><div><strong>Decoding HCM</strong><br>Typing practice and performance tracking</div><div class="links"><a href="https://decoding-hcm.vercel.app/">Website</a><a href="https://www.youtube.com/@decoding_hcm">YouTube</a><a href="https://t.me/decoding_hcm">Telegram Group</a><a href="https://t.me/defense_aspirants">PDF &amp; Study Material</a></div></footer><p class="disclaimer">Qualification is calculated using the selected test’s configured target net WPM and minimum accuracy. If a test has no configured threshold for a metric, that metric is not used as a pass condition. This is a practice report and does not replace official recruitment criteria.</p></main><script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print()},450)});<\/script></body></html>';
        printWindow.document.open();
        printWindow.document.write(reportHtml);
        printWindow.document.close();
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
                            <th>Result</th>
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


                                <td>${Number(attempt.total_errors || 0)}</td>
                                <td><span class="status-badge ${attemptQualified(attempt) ? 'active' : 'inactive'}">${attemptQualified(attempt) ? 'QUALIFY' : 'FAIL'}</span></td>
                                <td>${formatDate(attempt.created_at)}</td>

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

        const exportRows = typeof getFilteredAttempts === 'function' ? getFilteredAttempts() : cachedAttempts;
        if (!exportRows.length) {
            alert('No attempts available for the selected filters.');
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
                'Result',
                'Date'
            ],

            ...exportRows.map(a => [

                a.candidate_name || '',

                a.tests?.title || '',

                a.language || '',

                a.gross_wpm || 0,

                a.net_wpm || 0,

                a.accuracy || 0,

                a.total_errors || 0,

                attemptQualified(a) ? 'QUALIFY' : 'FAIL',

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


        $('folder-thumbnail')?.addEventListener('change', () => {
            const file = $('folder-thumbnail').files?.[0];
            if (file) renderFolderThumbnailPreview(URL.createObjectURL(file));
        });
        $('folder-remove-thumbnail')?.addEventListener('change', () => {
            if ($('folder-remove-thumbnail').checked) renderFolderThumbnailPreview('');
            else if (editingFolderId) {
                const folder = cachedFolders.find(item => String(item.id) === String(editingFolderId));
                renderFolderThumbnailPreview(folder?.thumbnail_url || '');
            }
        });
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


        $('refresh-tests')?.addEventListener('click', loadManageTests);
        $('library-test-search')?.addEventListener('input', renderFilteredLibraryTests);
        $('library-folder-filter')?.addEventListener('change', renderFilteredLibraryTests);
        $('library-status-filter')?.addEventListener('change', renderFilteredLibraryTests);
    }


    function setupAttemptActions() {
        $('refresh-attempts')?.addEventListener('click', loadAllAttempts);
        $('export-attempts')?.addEventListener('click', exportAttemptsCSV);
        $('export-results-pdf')?.addEventListener('click', exportResultsPDF);
        ['attempt-search','attempt-language-filter','report-result-filter','report-date-from','report-date-to','report-test-filter'].forEach(id => {
            $(id)?.addEventListener('input', renderFilteredAttempts);
            $(id)?.addEventListener('change', renderFilteredAttempts);
        });
        $('report-select-all-tests')?.addEventListener('click', () => {
            const select = $('report-test-filter');
            if (select) [...select.options].forEach(option => option.selected = true);
            renderFilteredAttempts();
        });
        $('report-clear-tests')?.addEventListener('click', () => {
            const select = $('report-test-filter');
            if (select) [...select.options].forEach(option => option.selected = false);
            renderFilteredAttempts();
        });
        $('report-reset-filters')?.addEventListener('click', () => {
            ['report-date-from','report-date-to','attempt-search'].forEach(id => { if ($(id)) $(id).value = ''; });
            ['report-result-filter','attempt-language-filter'].forEach(id => { if ($(id)) $(id).value = ''; });
            const select = $('report-test-filter');
            if (select) [...select.options].forEach(option => option.selected = false);
            renderFilteredAttempts();
        });
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