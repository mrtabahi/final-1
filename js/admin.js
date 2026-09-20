```javascript
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


    /* =====================================================
       ADMIN AUTHENTICATION
    ===================================================== */

    async function checkAdminAccess() {

        try {

            const session = await AuthManager.getSession();

            if (!session) {
                window.location.href = 'login.html';
                return false;
            }


            const profile = await AuthManager.getProfile();

            if (!profile) {

                console.error(
                    'Admin access denied: profile not found.'
                );

                await AuthManager.logout();

                return false;
            }


            if (profile.role !== 'admin') {

                console.error(
                    'Admin access denied: role =',
                    profile.role
                );

                window.location.href = 'dashboard.html';

                return false;
            }


            setAdminIdentity(profile, session.user);

            return true;

        } catch (error) {

            console.error(
                'Admin authentication error:',
                error
            );

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


        if ($('admin-avatar')) {

            $('admin-avatar').textContent =
                name
                    .trim()
                    .charAt(0)
                    .toUpperCase() || 'A';
        }
    }


    /* =====================================================
       NAVIGATION
    ===================================================== */

    function showAdminView(view) {

        const views = {

            dashboard: $('view-dashboard'),

            tests: $('view-tests'),

            attempts: $('view-attempts')

        };


        Object.values(views).forEach(element => {

            if (element) {
                element.style.display = 'none';
            }

        });


        if (views[view]) {

            views[view].style.display = 'block';

            currentView = view;

        }


        document
            .querySelectorAll('.admin-nav-link')
            .forEach(link => {

                link.classList.remove('active');

            });


        const activeMap = {

            dashboard: 'nav-dash',

            tests: 'nav-tests',

            attempts: 'nav-attempts'

        };


        const activeLink =
            $(activeMap[view]);


        if (activeLink) {
            activeLink.classList.add('active');
        }


        updatePageHeader(view);


        /*
         * Load data when section opens.
         */

        if (view === 'dashboard') {

            loadDashboard();

        }


        if (view === 'tests') {

            loadManageTests();

        }


        if (view === 'attempts') {

            loadAllAttempts();

        }
    }


    function updatePageHeader(view) {

        const title = $('page-title');

        const subtitle = $('page-subtitle');


        const data = {

            dashboard: {
                title: 'Dashboard',
                subtitle:
                    'Manage your typing practice platform'
            },

            tests: {
                title: 'Manage Folders & Tests',
                subtitle:
                    'Create, organize and control typing tests'
            },

            attempts: {
                title: 'All Candidate Attempts',
                subtitle:
                    'Review candidate typing performance'
            }

        };


        if (title) {
            title.textContent =
                data[view]?.title || 'Admin Panel';
        }


        if (subtitle) {
            subtitle.textContent =
                data[view]?.subtitle || '';
        }
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


        populateFolderSelect(
            cachedFolders
        );


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

                        <span class="
                            status-badge
                            ${folder.active
                                ? 'active'
                                : 'inactive'}
                        ">
                            ${folder.active
                                ? 'Active'
                                : 'Inactive'}
                        </span>

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


        populateTestFilter(
            cachedTests
        );
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

        $('folder-modal').style.display =
            'flex';

        $('folder-name').focus();
    }


    function closeFolderModal() {

        $('folder-modal').style.display =
            'none';

        $('folder-form').reset();

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


        const { error } =
            await supabaseClient
                .from('folders')
                .insert({
                    name,
                    description,
                    active
                });


        if (error) {

            console.error(
                'Create folder error:',
                error
            );

            message.textContent =
                error.message;

            return;
        }


        message.textContent =
            'Folder created successfully.';


        await loadFolders();


        setTimeout(() => {

            closeFolderModal();

        }, 500);
    }


    /* =====================================================
       CREATE TEST
    ===================================================== */

    function openTestModal() {

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


    function closeTestModal() {

        $('test-modal').style.display =
            'none';

        $('test-form').reset();

        $('test-duration').value = '5';

        $('test-target-wpm').value = '0';

        $('test-error-percent').value = '5';

        $('test-penalty').value = '10';

        $('test-active').checked = true;

        $('test-backspace-disabled').checked =
            true;

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

        const backspaceDisabled =
            $('test-backspace-disabled').checked;

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


        const { error } =
            await supabaseClient
                .from('tests')
                .insert({

                    title,

                    folder_id:
                        folderId,

                    language,

                    duration_minutes:
                        duration,

                    target_wpm:
                        targetWpm,

                    min_accuracy:
                        minAccuracy,

                    permissible_error_percent:
                        permissibleErrorPercent,

                    penalty_words:
                        penaltyWords,

                    passage_text:
                        content,

                    mode,

                    backspace_disabled:
                        backspaceDisabled,

                    active,

                    show_leaderboard:
                        leaderboard

                });


        if (error) {

            console.error(
                'Create test error:',
                error
            );

            message.textContent =
                error.message;

            return;
        }


        message.textContent =
            'Typing test created successfully.';


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


        $('admin-loading').style.display =
            'none';

        $('admin-app').style.display =
            'flex';


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
```
