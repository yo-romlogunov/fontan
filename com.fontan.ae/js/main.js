/* Main Panel Logic */
(function () {
    'use strict';

    var csInterface = new CSInterface();
    var EXTENSION_ID = "com.fontan.ae.panel";
    var CURRENT_VERSION = "0.3";
    var UPDATE_API = "https://api.github.com/repos/yo-romlogunov/fontan/releases/latest";
    var lastUpdateCheckAt = 0;
    var RELEASES_URL = "https://github.com/yo-romlogunov/fontan/releases";
    var nodeRequire = (window.cep_node && window.cep_node.require) ? window.cep_node.require : (typeof require === 'function' ? require : null);
    var fs = nodeRequire ? nodeRequire('fs') : null;
    var path = nodeRequire ? nodeRequire('path') : null;
    var os = nodeRequire ? nodeRequire('os') : null;
    var https = nodeRequire ? nodeRequire('https') : null;
    var childProcess = nodeRequire ? nodeRequire('child_process') : null;

    // State
    var state = {
        layers: [], // {id, name, font, base, ...}
        shapeLayers: [],
        fixGroups: [],
        easeCustom: null,
        vectorPreviewData: null,
        vectorPreviewTarget: null,
        vectorCustomIndices: {},
        updateInfo: null,
        updateStagingPath: null,
        updateStagingVersion: null,
        vectorToggles: { k1: true, k2: true, k3: true, k4: true }
    };

    // DOM Elements
    var els = {
        tabs: document.querySelectorAll('.tab'),
        panels: document.querySelectorAll('.tab-panel'),
        layerList: document.getElementById('layer-list'),
        layerCount: document.getElementById('layer-count'),
        groupList: document.getElementById('group-list'),
        groupCount: document.getElementById('group-count'),

        // Buttons
        btnAdd: document.getElementById('btn-add'),
        btnRemove: document.getElementById('btn-remove'),
        btnUp: document.getElementById('btn-up'),
        btnDown: document.getElementById('btn-down'),
        btnApply: document.getElementById('btn-apply'),
        btnRefresh: document.getElementById('btn-refresh'),
        btnApplyFv: document.getElementById('btn-apply-fv'),
        btnAnimSettings: document.getElementById('btn-anim-settings'),
        btnAbout: document.getElementById('btn-about'),
        btnAboutClose: document.getElementById('btn-about-close'),
        btnUpdates: document.getElementById('btn-updates'),
        btnUpdatesClose: document.getElementById('btn-updates-close'),
        aboutModal: document.getElementById('about-modal'),
        updatesModal: document.getElementById('updates-modal'),
        updatesTitle: document.getElementById('updates-title'),
        updatesDesc: document.getElementById('updates-desc'),
        updatesMeta: document.getElementById('updates-meta'),
        btnUpdateDownload: document.getElementById('btn-update-download'),
        btnUpdateApply: document.getElementById('btn-update-apply'),
        btnUpdateRelease: document.getElementById('btn-update-release'),

        // Inputs
        cbAlign: document.getElementById('cb-align'),
        cbLoop: document.getElementById('cb-loop'),
        inputOffset: document.getElementById('input-offset'),
        inputStagger: document.getElementById('input-stagger'),
        selectDirection: document.getElementById('select-direction'),
        selectEase: document.getElementById('select-ease'),
        btnEaseEditor: document.getElementById('btn-ease-editor'),
        btnEaseClose: document.getElementById('btn-ease-close'),
        btnEaseOk: document.getElementById('btn-ease-ok'),
        btnEaseCancel: document.getElementById('btn-ease-cancel'),
        easingModal: document.getElementById('easing-modal'),
        easingGraph: document.getElementById('easing-graph'),
        easingPath: document.getElementById('curve-path'),
        easingLine1: document.getElementById('curve-line-1'),
        easingLine2: document.getElementById('curve-line-2'),
        easingHandle1: document.getElementById('curve-handle-1'),
        easingHandle2: document.getElementById('curve-handle-2'),
        easingValues: document.getElementById('curve-values'),
        vectorModal: document.getElementById('vector-modal'),
        btnVectorClose: document.getElementById('btn-vector-close'),
        vectorPreview: document.getElementById('vector-preview'),
        vectorPaths: document.getElementById('vector-paths'),
        vectorTitle: document.getElementById('vector-title'),
        vectorMeta: document.getElementById('vector-meta'),
        vectorFvMode: document.getElementById('vector-fv-mode'),
        btnVectorApply: document.getElementById('btn-vector-apply'),
        vectorEditHint: document.getElementById('vector-edit-hint'),
        vectorPreviewWrap: document.querySelector('#vector-modal .vector-preview'),
        toggleK1: document.getElementById('toggle-k1'),
        toggleK2: document.getElementById('toggle-k2'),
        toggleK3: document.getElementById('toggle-k3'),
        toggleK4: document.getElementById('toggle-k4'),
        cbOffsetEnable: document.getElementById('cb-offset-enable'),
        fontStatus: document.getElementById('font-status'),
        fontStatusText: document.getElementById('font-status-text'),
        cbCenterEnable: document.getElementById('cb-center-enable'),
        selectCenterMode: document.getElementById('select-center-mode'),
        cbDeleteOriginals: document.getElementById('cb-delete-originals'),
        selectShape: document.getElementById('select-shape'),
        selectFvMode: document.getElementById('select-fv-mode'),

        // Status
        statusText: document.getElementById('status-text'),
        indicator: document.getElementById('status-indicator'),
        overlay: document.getElementById('overlay')
    };

    // --- Initialization ---
    init();

    function init() {
        applyPendingUpdateIfAny();
        loadStagedUpdateInfo();
        // Theme handling
        updateThemeWithAppSkinInfo();
        csInterface.addEventListener(CSInterface.THEME_COLOR_CHANGED_EVENT, updateThemeWithAppSkinInfo);

        // Event Listeners
        setupTabs();
        setupButtons();
        setupContextMenus();
        setupFvModeSelect();
        setupEasingEditor();
        setupVectorToggles();
        setupVectorEditor();

        // Initial Data Load
        setTimeout(refreshShapeLayers, 100);
        updateKeyframeControls();
    }

    function updateThemeWithAppSkinInfo() {
        var hostEnv = csInterface.getHostEnvironment();
        var skin = hostEnv.appSkinInfo;
        // Logic to sync with AE theme if needed, but we use a custom dark theme primarily
    }

    function normalizeVersion(v) {
        if (!v) return '';
        var s = String(v).trim();
        if (s.charAt(0).toLowerCase() === 'v') s = s.slice(1);
        s = s.split(/[\s\-]/)[0];
        return s;
    }

    function compareVersions(a, b) {
        var na = normalizeVersion(a);
        var nb = normalizeVersion(b);
        var decRe = /^(\d+)\.(\d+)$/;
        var ma = decRe.exec(na);
        var mb = decRe.exec(nb);
        if (ma && mb) {
            var majorA = parseInt(ma[1], 10);
            var majorB = parseInt(mb[1], 10);
            if (majorA === 0 && majorB === 0) {
                var fa = parseFloat(na);
                var fb = parseFloat(nb);
                if (fa > fb) return 1;
                if (fa < fb) return -1;
                return 0;
            }
        }
        var pa = na.split('.');
        var pb = nb.split('.');
        var len = Math.max(pa.length, pb.length);
        for (var i = 0; i < len; i++) {
            var ia = parseInt(pa[i] || '0', 10);
            var ib = parseInt(pb[i] || '0', 10);
            if (ia > ib) return 1;
            if (ia < ib) return -1;
        }
        return 0;
    }

    function formatCheckTime(ts) {
        var d = new Date(ts);
        var hh = String(d.getHours()).padStart(2, '0');
        var mm = String(d.getMinutes()).padStart(2, '0');
        return hh + ':' + mm;
    }

    function resetUpdateButtons() {
        if (els.btnUpdateDownload) {
            els.btnUpdateDownload.classList.add('is-hidden');
            els.btnUpdateDownload.removeAttribute('data-link');
        }
        if (els.btnUpdateApply) {
            els.btnUpdateApply.classList.add('is-hidden');
        }
        if (els.btnUpdateRelease) {
            els.btnUpdateRelease.classList.add('is-hidden');
            els.btnUpdateRelease.removeAttribute('data-link');
        }
    }

    function showReleaseButton(url) {
        if (!els.btnUpdateRelease) return;
        els.btnUpdateRelease.classList.remove('is-hidden');
        if (url) els.btnUpdateRelease.setAttribute('data-link', url);
    }

    function checkForUpdates(force) {
        if (!els.updatesDesc || !els.updatesMeta) return;
        var now = Date.now();
        if (!force && now - lastUpdateCheckAt < 60000) return;
        lastUpdateCheckAt = now;

        state.updateInfo = null;
        var stagedInfo = loadStagedUpdateInfo();

        els.updatesDesc.textContent = "Checking for updates...";
        els.updatesMeta.textContent = "Current: " + CURRENT_VERSION + " • Last checked: " + formatCheckTime(now);
        resetUpdateButtons();

        var xhr = new XMLHttpRequest();
        xhr.open('GET', UPDATE_API, true);
        xhr.setRequestHeader('Accept', 'application/vnd.github+json');
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var data = JSON.parse(xhr.responseText || '{}');
                    var latestTag = data.tag_name || data.name || '';
                    var latest = normalizeVersion(latestTag);
                    var cmp = latest ? compareVersions(latest, CURRENT_VERSION) : 0;
                    if (!latest) {
                        els.updatesDesc.textContent = "Could not parse latest version.";
                        els.updatesMeta.textContent = "Current: " + CURRENT_VERSION + " • Last checked: " + formatCheckTime(now);
                        return;
                    }
                    var releaseUrl = data.html_url || RELEASES_URL;
                    var downloadUrl = '';
                    var assetName = '';
                    if (data.assets && data.assets.length) {
                        for (var i = 0; i < data.assets.length; i++) {
                            var asset = data.assets[i];
                            if (!asset || !asset.browser_download_url) continue;
                            var name = asset.name || '';
                            if (/\.zip$/i.test(name) || /\.zxp$/i.test(name) || i === 0) {
                                downloadUrl = asset.browser_download_url;
                                assetName = name;
                                break;
                            }
                        }
                    }
                    if (!downloadUrl) {
                        if (latestTag) {
                            downloadUrl = "https://github.com/yo-romlogunov/fontan/archive/refs/tags/" +
                                encodeURIComponent(latestTag) + ".zip";
                        } else if (data.zipball_url) {
                            downloadUrl = data.zipball_url;
                        }
                    }
                    state.updateInfo = {
                        latest: latest,
                        downloadUrl: downloadUrl,
                        releaseUrl: releaseUrl,
                        assetName: assetName
                    };

                    var stagedVersion = stagedInfo && stagedInfo.version ? stagedInfo.version : '';
                    var stagedMatchesLatest = stagedVersion && compareVersions(stagedVersion, latest) === 0;
                    if (cmp > 0) {
                        els.updatesDesc.textContent = "Update available: v" + latest;
                        if (els.btnUpdates) els.btnUpdates.classList.add('is-alert');
                        if (stagedMatchesLatest) {
                            if (els.btnUpdateApply) els.btnUpdateApply.classList.remove('is-hidden');
                        } else if (downloadUrl) {
                            if (els.btnUpdateDownload) {
                                els.btnUpdateDownload.classList.remove('is-hidden');
                                els.btnUpdateDownload.setAttribute('data-link', downloadUrl);
                            }
                        }
                        showReleaseButton(releaseUrl);
                    } else {
                        els.updatesDesc.textContent = "You're up to date.";
                        if (els.btnUpdates) els.btnUpdates.classList.remove('is-alert');
                        if (stagedVersion && compareVersions(stagedVersion, CURRENT_VERSION) > 0) {
                            els.updatesDesc.textContent = "Update ready to apply: v" + stagedVersion;
                            if (els.btnUpdateApply) els.btnUpdateApply.classList.remove('is-hidden');
                            showReleaseButton(releaseUrl);
                        }
                    }
                    els.updatesMeta.textContent = "Current: " + CURRENT_VERSION + " • Latest: " + latest +
                        " • Last checked: " + formatCheckTime(now);
                } catch (e) {
                    els.updatesDesc.textContent = "Unable to check updates.";
                    els.updatesMeta.textContent = "Current: " + CURRENT_VERSION + " • Last checked: " + formatCheckTime(now);
                    if (stagedInfo && stagedInfo.version) {
                        els.updatesDesc.textContent = "Update ready to apply: v" + stagedInfo.version;
                        if (els.btnUpdateApply) els.btnUpdateApply.classList.remove('is-hidden');
                        showReleaseButton(stagedInfo.releaseUrl || RELEASES_URL);
                    } else {
                        showReleaseButton(RELEASES_URL);
                    }
                }
            } else {
                els.updatesDesc.textContent = "Unable to check updates.";
                els.updatesMeta.textContent = "Current: " + CURRENT_VERSION + " • Last checked: " + formatCheckTime(now);
                if (stagedInfo && stagedInfo.version) {
                    els.updatesDesc.textContent = "Update ready to apply: v" + stagedInfo.version;
                    if (els.btnUpdateApply) els.btnUpdateApply.classList.remove('is-hidden');
                    showReleaseButton(stagedInfo.releaseUrl || RELEASES_URL);
                } else {
                    showReleaseButton(RELEASES_URL);
                }
            }
        };
        xhr.onerror = function () {
            els.updatesDesc.textContent = "Unable to check updates.";
            els.updatesMeta.textContent = "Current: " + CURRENT_VERSION + " • Last checked: " + formatCheckTime(now);
            if (stagedInfo && stagedInfo.version) {
                els.updatesDesc.textContent = "Update ready to apply: v" + stagedInfo.version;
                if (els.btnUpdateApply) els.btnUpdateApply.classList.remove('is-hidden');
                showReleaseButton(stagedInfo.releaseUrl || RELEASES_URL);
            } else {
                showReleaseButton(RELEASES_URL);
            }
        };
        xhr.send();
    }

    function normalizeFsPath(p) {
        if (!p) return p;
        var s = String(p);
        if (s.indexOf('file:') === 0) {
            try { s = decodeURIComponent(s); } catch (e) {}
            if (s.indexOf('file:///') === 0) {
                s = s.slice(7);
            } else if (s.indexOf('file://') === 0) {
                s = s.slice(7);
            } else if (s.indexOf('file:/') === 0) {
                s = s.slice(6);
            }
            if (/^\/[A-Za-z]:/.test(s)) s = s.slice(1);
        }
        return s;
    }

    function getExtensionPaths() {
        if (!csInterface || !path || typeof SystemPath === 'undefined') return null;
        var extPath = normalizeFsPath(csInterface.getSystemPath(SystemPath.EXTENSION));
        if (!extPath) return null;
        return {
            extPath: extPath,
            extParent: path.dirname(extPath),
            extName: path.basename(extPath)
        };
    }

    function getUserExtensionsRoot() {
        if (!path || !os) return null;
        var platform = (typeof process !== 'undefined' && process.platform) ? process.platform : 'darwin';
        if (platform.indexOf('win') === 0) {
            var base = (typeof process !== 'undefined' && process.env && process.env.APPDATA) ?
                process.env.APPDATA : path.join(os.homedir(), 'AppData', 'Roaming');
            return path.join(base, 'Adobe', 'CEP', 'extensions');
        }
        if (platform === 'darwin') {
            return path.join(os.homedir(), 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions');
        }
        return path.join(os.homedir(), '.config', 'Adobe', 'CEP', 'extensions');
    }

    function ensureDir(dirPath) {
        if (!fs || !dirPath) return false;
        try {
            fs.mkdirSync(dirPath, { recursive: true });
            return true;
        } catch (e) {
            return false;
        }
    }

    function canWriteDir(dirPath) {
        if (!fs || !dirPath) return false;
        try {
            if (fs.constants && fs.constants.W_OK) {
                fs.accessSync(dirPath, fs.constants.W_OK);
            } else if (fs.accessSync) {
                fs.accessSync(dirPath, 2);
            } else {
                var testFile = path.join(dirPath, '.write-test-' + Date.now());
                fs.writeFileSync(testFile, '1');
                fs.unlinkSync(testFile);
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    function getUpdateMetaRoot(paths) {
        if (!paths) return null;
        if (paths.extParent && ensureDir(paths.extParent) && canWriteDir(paths.extParent)) {
            return paths.extParent;
        }
        var userRoot = getUserExtensionsRoot();
        if (userRoot && ensureDir(userRoot) && canWriteDir(userRoot)) {
            return userRoot;
        }
        return paths.extParent || userRoot;
    }

    function getStagedInfoPath(metaRoot) {
        return path.join(metaRoot, '.fontan_update_staged.json');
    }

    function getPendingInfoPath(metaRoot) {
        return path.join(metaRoot, '.fontan_update_pending.json');
    }

    function readJsonFile(filePath) {
        if (!fs || !filePath || !fs.existsSync(filePath)) return null;
        try {
            var raw = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function writeJsonFile(filePath, data) {
        if (!fs || !filePath) return;
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } catch (e) {
            // ignore
        }
    }

    function loadStagedUpdateInfo() {
        if (!fs || !path) return null;
        var paths = getExtensionPaths();
        if (!paths) {
            state.updateStagingPath = null;
            state.updateStagingVersion = null;
            return null;
        }
        var metaRoot = getUpdateMetaRoot(paths);
        if (!metaRoot) {
            state.updateStagingPath = null;
            state.updateStagingVersion = null;
            return null;
        }
        var infoPath = getStagedInfoPath(metaRoot);
        var info = readJsonFile(infoPath);
        if (!info || !info.stagingDir || !fs.existsSync(info.stagingDir)) {
            state.updateStagingPath = null;
            state.updateStagingVersion = null;
            return null;
        }
        state.updateStagingPath = info.stagingDir;
        state.updateStagingVersion = info.version || null;
        return info;
    }

    function clearStagedUpdateInfo() {
        if (!fs || !path) return;
        var paths = getExtensionPaths();
        if (!paths) return;
        var metaRoot = getUpdateMetaRoot(paths);
        if (!metaRoot) return;
        var infoPath = getStagedInfoPath(metaRoot);
        if (fs.existsSync(infoPath)) {
            try { fs.unlinkSync(infoPath); } catch (e) {}
        }
    }

    function loadPendingUpdateInfo() {
        if (!fs || !path) return null;
        var paths = getExtensionPaths();
        if (!paths) return null;
        var metaRoot = getUpdateMetaRoot(paths);
        if (!metaRoot) return null;
        var infoPath = getPendingInfoPath(metaRoot);
        return readJsonFile(infoPath);
    }

    function clearPendingUpdateInfo() {
        if (!fs || !path) return;
        var paths = getExtensionPaths();
        if (!paths) return;
        var metaRoot = getUpdateMetaRoot(paths);
        if (!metaRoot) return;
        var infoPath = getPendingInfoPath(metaRoot);
        if (fs.existsSync(infoPath)) {
            try { fs.unlinkSync(infoPath); } catch (e) {}
        }
    }

    function applyPendingUpdateIfAny() {
        if (!fs || !path) return;
        var pending = loadPendingUpdateInfo();
        if (!pending || !pending.stagingDir || !pending.targetDir) return;
        var stagingDir = normalizeFsPath(pending.stagingDir);
        var targetDir = normalizeFsPath(pending.targetDir);
        if (!fs.existsSync(stagingDir)) {
            clearPendingUpdateInfo();
            return;
        }
        var paths = getExtensionPaths();
        if (!paths || !paths.extPath) return;
        var allowed = (targetDir === paths.extPath);
        if (!allowed) {
            var userRoot = getUserExtensionsRoot();
            if (userRoot) {
                var userRootNorm = path.resolve(userRoot);
                var targetNorm = path.resolve(targetDir);
                if (targetNorm.indexOf(userRootNorm) === 0 && path.basename(targetNorm) === paths.extName) {
                    allowed = true;
                }
            }
        }
        if (!allowed) return;

        var backupDir = targetDir + '.bak';
        try {
            if (fs.existsSync(backupDir)) removeDirRecursive(backupDir);
            if (fs.existsSync(targetDir)) fs.renameSync(targetDir, backupDir);
            fs.renameSync(stagingDir, targetDir);
            clearPendingUpdateInfo();
            clearStagedUpdateInfo();
            state.updateStagingPath = null;
            state.updateStagingVersion = null;
        } catch (e) {
            try {
                if (!fs.existsSync(targetDir) && fs.existsSync(backupDir)) {
                    fs.renameSync(backupDir, targetDir);
                }
            } catch (e2) {}
        }
    }

    function startUpdateDownload() {
        if (!state.updateInfo || !state.updateInfo.downloadUrl) {
            if (els.updatesDesc) els.updatesDesc.textContent = "No downloadable package found. Use the release page.";
            showReleaseButton(state.updateInfo ? state.updateInfo.releaseUrl : RELEASES_URL);
            return;
        }
        if (!fs || !path || !os || !https || !childProcess) {
            if (els.updatesDesc) els.updatesDesc.textContent = "Auto-update unavailable. Use the release page.";
            showReleaseButton(state.updateInfo.releaseUrl || RELEASES_URL);
            return;
        }

        var latest = state.updateInfo.latest;
        if (state.updateStagingVersion === latest && state.updateStagingPath && fs.existsSync(state.updateStagingPath)) {
            if (els.updatesDesc) els.updatesDesc.textContent = "Update already downloaded. Click Apply on restart.";
            if (els.btnUpdateApply) els.btnUpdateApply.classList.remove('is-hidden');
            showReleaseButton(state.updateInfo.releaseUrl);
            return;
        }

        if (els.updatesDesc) els.updatesDesc.textContent = "Downloading update...";
        resetUpdateButtons();
        showReleaseButton(state.updateInfo.releaseUrl);

        var tempRoot = path.join(os.tmpdir(), 'fontan-update-' + Date.now());
        var zipPath = path.join(tempRoot, 'fontan-update.zip');
        try {
            fs.mkdirSync(tempRoot, { recursive: true });
        } catch (e) {}

        downloadFile(state.updateInfo.downloadUrl, zipPath, function (err) {
            if (err) {
                if (els.updatesDesc) {
                    els.updatesDesc.textContent = "Download failed: " + (err && err.message ? err.message : err);
                }
                console.error("Update download failed", err);
                showReleaseButton(state.updateInfo.releaseUrl || RELEASES_URL);
                if (els.btnUpdateDownload) {
                    els.btnUpdateDownload.classList.remove('is-hidden');
                    els.btnUpdateDownload.setAttribute('data-link', state.updateInfo.downloadUrl);
                }
                return;
            }
            if (els.updatesDesc) els.updatesDesc.textContent = "Preparing update...";
            stageUpdateFromZip(zipPath, latest, state.updateInfo.releaseUrl, function (stageErr, stagingDir) {
                if (stageErr) {
                    if (els.updatesDesc) {
                        els.updatesDesc.textContent = "Update failed to prepare: " +
                            (stageErr && stageErr.message ? stageErr.message : stageErr);
                    }
                    console.error("Update staging failed", stageErr);
                    showReleaseButton(state.updateInfo.releaseUrl || RELEASES_URL);
                    if (els.btnUpdateDownload) {
                        els.btnUpdateDownload.classList.remove('is-hidden');
                        els.btnUpdateDownload.setAttribute('data-link', state.updateInfo.downloadUrl);
                    }
                    return;
                }
                state.updateStagingPath = stagingDir;
                state.updateStagingVersion = latest;
                if (els.updatesDesc) {
                    var stagedInfo = loadStagedUpdateInfo();
                    var targetDir = stagedInfo && stagedInfo.targetDir ? stagedInfo.targetDir : '';
                    var usingUserRoot = false;
                    if (targetDir) {
                        var userRoot = getUserExtensionsRoot();
                        if (userRoot) {
                            try {
                                usingUserRoot = path.resolve(targetDir).indexOf(path.resolve(userRoot)) === 0;
                            } catch (e) {}
                        }
                    }
                    els.updatesDesc.textContent = usingUserRoot ?
                        "Update downloaded to user extensions. Click Apply on restart." :
                        "Update downloaded. Click Apply on restart.";
                }
                if (els.btnUpdateApply) els.btnUpdateApply.classList.remove('is-hidden');
                showReleaseButton(state.updateInfo.releaseUrl);
            });
        });
    }

    function scheduleUpdateApply() {
        if (!fs || !path) return;
        var stagedInfo = loadStagedUpdateInfo();
        var stagingDir = state.updateStagingPath || (stagedInfo && stagedInfo.stagingDir);
        if (!stagingDir || !fs.existsSync(stagingDir)) {
            if (els.updatesDesc) els.updatesDesc.textContent = "No staged update found. Download the update first.";
            return;
        }
        var paths = getExtensionPaths();
        if (!paths || !paths.extPath) return;
        var version = state.updateStagingVersion || (stagedInfo && stagedInfo.version) || (state.updateInfo && state.updateInfo.latest) || '';
        var releaseUrl = (state.updateInfo && state.updateInfo.releaseUrl) || (stagedInfo && stagedInfo.releaseUrl) || RELEASES_URL;
        var targetDir = (stagedInfo && stagedInfo.targetDir) ? stagedInfo.targetDir : paths.extPath;
        var metaRoot = getUpdateMetaRoot(paths);
        if (!metaRoot) return;
        writeJsonFile(getPendingInfoPath(metaRoot), {
            targetDir: targetDir,
            stagingDir: stagingDir,
            version: version,
            releaseUrl: releaseUrl,
            createdAt: Date.now()
        });
        if (els.updatesDesc) {
            var usingUserRoot = false;
            var userRoot = getUserExtensionsRoot();
            if (userRoot) {
                try {
                    usingUserRoot = path.resolve(targetDir).indexOf(path.resolve(userRoot)) === 0;
                } catch (e) {}
            }
            els.updatesDesc.textContent = usingUserRoot ?
                "Update scheduled for user extensions. Restart After Effects to apply." :
                "Update scheduled. Restart After Effects to apply.";
        }
        if (els.btnUpdateApply) els.btnUpdateApply.classList.add('is-hidden');
        showReleaseButton(releaseUrl);
    }

    function downloadFile(url, destPath, done) {
        if (!url || !fs || !path) return done(new Error("Invalid download request"));
        var clientForUrl = function (u) {
            if (u.indexOf('https://') === 0) return https;
            if (u.indexOf('http://') === 0) return nodeRequire ? nodeRequire('http') : null;
            return https;
        };

        var handled = false;
        function finishOnce(err) {
            if (handled) return;
            handled = true;
            done(err);
        }

        function request(u) {
            var client = clientForUrl(u);
            if (!client) return finishOnce(new Error("No HTTP client available"));
            var req = client.get(u, function (res) {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume();
                    request(res.headers.location);
                    return;
                }
                if (res.statusCode !== 200) {
                    res.resume();
                    finishOnce(new Error("Download failed with status " + res.statusCode));
                    return;
                }
                var file = fs.createWriteStream(destPath);
                res.pipe(file);
                file.on('finish', function () {
                    file.close(function () {
                        finishOnce();
                    });
                });
                file.on('error', function (err) {
                    try { file.close(); } catch (e) {}
                    finishOnce(err);
                });
            });
            req.on('error', function (err) {
                finishOnce(err);
            });
        }

        request(url);
    }

    function unzipToDir(zipPath, destDir, done) {
        if (!childProcess) return done(new Error("Unzip unavailable"));
        var isWin = (typeof process !== 'undefined' && process.platform && process.platform.indexOf('win') === 0);
        var proc;
        if (isWin) {
            var esc = function (s) { return String(s).replace(/'/g, "''"); };
            var cmd = "Expand-Archive -LiteralPath '" + esc(zipPath) + "' -DestinationPath '" + esc(destDir) + "' -Force";
            proc = childProcess.spawn('powershell.exe', ['-NoProfile', '-Command', cmd], { stdio: 'ignore' });
        } else {
            var unzipPath = (fs && fs.existsSync('/usr/bin/unzip')) ? '/usr/bin/unzip' : 'unzip';
            var attemptedDitto = false;
            var runDitto = function () {
                if (attemptedDitto) return done(new Error("Unzip failed"));
                attemptedDitto = true;
                if (fs && fs.existsSync('/usr/bin/ditto')) {
                    var ditto = childProcess.spawn('/usr/bin/ditto', ['-x', '-k', zipPath, destDir], { stdio: 'ignore' });
                    ditto.on('error', function (err) { done(err); });
                    ditto.on('close', function (code) {
                        if (code === 0) done();
                        else done(new Error("Unzip failed"));
                    });
                } else {
                    done(new Error("Unzip tool not found"));
                }
            };
            proc = childProcess.spawn(unzipPath, ['-o', zipPath, '-d', destDir], { stdio: 'ignore' });
            proc.on('error', function () { runDitto(); });
            proc.on('close', function (code) {
                if (code === 0) done();
                else runDitto();
            });
        }
        if (proc) {
            proc.on('error', function (err) {
                if (isWin) done(err);
            });
            if (isWin) {
                proc.on('close', function (code) {
                    if (code === 0) done();
                    else done(new Error("Unzip failed"));
                });
            }
        }
    }

    function findManifestRoot(startDir) {
        if (!fs || !path || !startDir) return null;
        var stack = [startDir];
        while (stack.length) {
            var dir = stack.pop();
            var manifestPath = path.join(dir, 'CSXS', 'manifest.xml');
            if (fs.existsSync(manifestPath)) return dir;
            var entries;
            try {
                entries = fs.readdirSync(dir);
            } catch (e) {
                continue;
            }
            for (var i = 0; i < entries.length; i++) {
                var name = entries[i];
                var full = path.join(dir, name);
                try {
                    if (fs.statSync(full).isDirectory()) stack.push(full);
                } catch (e2) {}
            }
        }
        return null;
    }

    function stageUpdateFromZip(zipPath, version, releaseUrl, done) {
        if (!fs || !path || !os) return done(new Error("Update staging unavailable"));
        var paths = getExtensionPaths();
        if (!paths || !paths.extParent || !paths.extName) return done(new Error("Extension path unavailable"));

        var stagingRoot = paths.extParent;
        var targetDir = paths.extPath;
        if (!canWriteDir(stagingRoot)) {
            var userRoot = getUserExtensionsRoot();
            if (userRoot && ensureDir(userRoot) && canWriteDir(userRoot)) {
                stagingRoot = userRoot;
                targetDir = path.join(userRoot, paths.extName);
            }
        }

        var extractDir = path.join(path.dirname(zipPath), 'extract');
        try { fs.mkdirSync(extractDir, { recursive: true }); } catch (e) {}

        unzipToDir(zipPath, extractDir, function (err) {
            if (err) return done(err);
            var root = findManifestRoot(extractDir);
            if (!root) return done(new Error("No extension manifest found in package"));

            var stagingDir = path.join(stagingRoot, paths.extName + '.update');
            try {
                ensureDir(stagingRoot);
                if (fs.existsSync(stagingDir)) removeDirRecursive(stagingDir);
                copyDirRecursive(root, stagingDir);
            } catch (copyErr) {
                return done(copyErr);
            }

            var metaRoot = getUpdateMetaRoot(paths);
            if (!metaRoot) return done(new Error("Cannot write update metadata"));
            writeJsonFile(getStagedInfoPath(metaRoot), {
                stagingDir: stagingDir,
                version: version || '',
                releaseUrl: releaseUrl || RELEASES_URL,
                targetDir: targetDir,
                createdAt: Date.now()
            });

            try { removeDirRecursive(extractDir); } catch (e2) {}
            try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch (e3) {}

            done(null, stagingDir);
        });
    }

    function removeDirRecursive(target) {
        if (!fs || !target || !fs.existsSync(target)) return;
        if (fs.rmSync) {
            fs.rmSync(target, { recursive: true, force: true });
            return;
        }
        var entries = fs.readdirSync(target);
        for (var i = 0; i < entries.length; i++) {
            var name = entries[i];
            var full = path.join(target, name);
            try {
                if (fs.statSync(full).isDirectory()) removeDirRecursive(full);
                else fs.unlinkSync(full);
            } catch (e) {}
        }
        try { fs.rmdirSync(target); } catch (e2) {}
    }

    function copyDirRecursive(src, dest) {
        if (!fs || !path) return;
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        var entries = fs.readdirSync(src);
        for (var i = 0; i < entries.length; i++) {
            var name = entries[i];
            var srcPath = path.join(src, name);
            var destPath = path.join(dest, name);
            var stat = fs.statSync(srcPath);
            if (stat.isDirectory()) {
                copyDirRecursive(srcPath, destPath);
            } else {
                if (fs.existsSync(destPath)) {
                    try { fs.unlinkSync(destPath); } catch (e) {}
                }
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    // --- Tab Handling ---
    function setupTabs() {
        els.tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                activateTab(tab.dataset.tab);
            });
        });
    }

    function activateTab(tabName) {
        els.tabs.forEach(function (t) { t.classList.remove('active'); });
        els.panels.forEach(function (p) { p.classList.remove('active'); });

        var tab = document.querySelector('.tab[data-tab="' + tabName + '"]');
        var panel = document.getElementById('tab-' + tabName);
        if (tab) tab.classList.add('active');
        if (panel) panel.classList.add('active');

        if (tabName === 'fix') {
            refreshShapeLayers();
        }
    }

    // --- Logic: Create Tab ---

    function setupButtons() {
        // Create Tab
        els.btnAdd.addEventListener('click', addSelectedLayers);
        els.btnRemove.addEventListener('click', removeSelectedLayer);
        els.btnUp.addEventListener('click', moveLayerUp);
        els.btnDown.addEventListener('click', moveLayerDown);
        if (els.btnAnimSettings) {
            els.btnAnimSettings.addEventListener('click', function () {
                activateTab('anim');
            });
        }
        if (els.btnAbout && els.aboutModal) {
            els.btnAbout.addEventListener('click', function () {
                els.aboutModal.classList.add('active');
            });
        }
        if (els.btnAboutClose && els.aboutModal) {
            els.btnAboutClose.addEventListener('click', function () {
                els.aboutModal.classList.remove('active');
            });
        }
        if (els.aboutModal) {
            els.aboutModal.addEventListener('click', function (e) {
                if (e.target === els.aboutModal) els.aboutModal.classList.remove('active');
            });
            els.aboutModal.querySelectorAll('[data-link]').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var url = btn.getAttribute('data-link');
                    if (!url) return;
                    openExternal(url);
                });
            });
        }
        if (els.btnUpdates && els.updatesModal) {
            els.btnUpdates.addEventListener('click', function () {
                els.updatesModal.classList.add('active');
                checkForUpdates(true);
            });
        }
        if (els.btnUpdatesClose && els.updatesModal) {
            els.btnUpdatesClose.addEventListener('click', function () {
                els.updatesModal.classList.remove('active');
            });
        }
        if (els.updatesModal) {
            els.updatesModal.addEventListener('click', function (e) {
                if (e.target === els.updatesModal) els.updatesModal.classList.remove('active');
            });
        }
        if (els.btnUpdateDownload) {
            els.btnUpdateDownload.addEventListener('click', function () {
                startUpdateDownload();
            });
        }
        if (els.btnUpdateApply) {
            els.btnUpdateApply.addEventListener('click', function () {
                scheduleUpdateApply();
            });
        }
        if (els.btnUpdateRelease) {
            els.btnUpdateRelease.addEventListener('click', function () {
                var url = els.btnUpdateRelease.getAttribute('data-link') || RELEASES_URL;
                openExternal(url);
            });
        }
        if (els.btnVectorClose && els.vectorModal) {
            els.btnVectorClose.addEventListener('click', function () {
                els.vectorModal.classList.remove('active');
            });
        }
        if (els.btnVectorApply) {
            els.btnVectorApply.addEventListener('click', applyVectorFirstVertex);
        }

        // Anim Tab
        els.btnApply.addEventListener('click', applyCreate);
        els.cbCenterEnable.addEventListener('change', updateCenterControls);
        if (els.cbOffsetEnable) {
            els.cbOffsetEnable.addEventListener('change', updateKeyframeControls);
        }
        // els.selectCenterMode doesn't need explicit listeners, value read on apply

        // Fix Tab
        els.btnRefresh.addEventListener('click', refreshShapeLayers);
        els.selectShape.addEventListener('change', loadGroupsForShape);
        if (els.btnApplyFv) {
            els.btnApplyFv.addEventListener('click', applyFirstVertex);
        }
    }

    // Function wrappers calling JSX
    function evalScript(script, callback) {
        csInterface.evalScript(script, function (res) {
            if (callback) callback(res);
        });
    }

    function openExternal(url) {
        if (!url) return;
        try {
            if (window.cep && window.cep.util && window.cep.util.openURLInDefaultBrowser) {
                window.cep.util.openURLInDefaultBrowser(url);
                return;
            }
        } catch (e) {}
        try {
            if (csInterface && csInterface.openURLInDefaultBrowser) {
                csInterface.openURLInDefaultBrowser(url);
                return;
            }
        } catch (e2) {}
        try { window.open(url); } catch (e3) {}
    }

    // -> Add Layers
    function addSelectedLayers() {
        setStatus("Adding layers...", true);

        evalScript('Fontan.getSelectedTextLayers()', function (res) {
            try {
                if (!res) {
                    // Silent fail or status update
                    setStatus("No response from host");
                    stopWorking();
                    return;
                }
                var layers = JSON.parse(res);
                if (layers && layers.length) {
                    // Filter duplicates
                    var newLayers = layers.filter(l => !state.layers.find(ex => ex.id === l.id));

                    newLayers.forEach(l => {
                        state.layers.push({
                            ...l,
                            base: state.layers.length === 0 // First one is base by default
                        });
                    });

                    renderLayerList();
                    setStatus("Added " + newLayers.length + " layers");
                } else {
                    setStatus("No text layers selected");
                }
            } catch (e) {
                console.error(e);
                setStatus("Error adding layers");
            }
            stopWorking();
        });
    }

    // -> Render Layer List
    function renderLayerList() {
        els.layerList.innerHTML = '';
        els.layerCount.textContent = state.layers.length + " layers";
        els.layerList.classList.toggle('is-empty', state.layers.length === 0);
        if (els.btnAnimSettings) {
            els.btnAnimSettings.classList.toggle('is-hidden', state.layers.length === 0);
        }

        if (state.layers.length === 0) {
            els.layerList.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4H20V7"/><path d="M9 20H15"/><path d="M12 4V20"/></svg>
                    <p>Select text layers and click +</p>
                </div>`;
            return;
        }

        state.layers.forEach((layer, index) => {
            var el = document.createElement('div');
            el.className = 'list-item';
            if (layer.selected) el.classList.add('selected');
            if (layer.base) el.classList.add('base');

            var fontLabel = layer.fontName || "Unknown";
            if (layer.fontStyle) fontLabel += " • " + layer.fontStyle;

            el.innerHTML = `
                <span class="item-index">${index + 1}</span>
                <svg class="item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V4H20V7"/><path d="M9 20H15"/><path d="M12 4V20"/></svg>
                <span class="item-text">
                    <span class="item-name" title="${layer.name}">${layer.name}</span>
                    <span class="item-meta">${fontLabel}</span>
                </span>
                <button class="item-action item-base-btn ${layer.base ? 'active' : ''}" title="Set as Base">
                    <svg viewBox="0 0 24 24" fill="none">
                        <polygon
                            points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
                            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                </button>
            `;

            el.addEventListener('click', () => selectLayer(index));
            var baseBtn = el.querySelector('.item-base-btn');
            if (baseBtn) {
                baseBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    selectLayer(index);
                    setBaseLayer(index);
                });
            }
            els.layerList.appendChild(el);
        });
        updateFontStatus();
    }

    function selectLayer(index) {
        state.layers.forEach((l, i) => l.selected = (i === index));
        renderLayerList();
    }

    function updateFontStatus() {
        if (!els.fontStatus || !els.fontStatusText) return;
        if (!state.layers.length) {
            els.fontStatus.classList.remove('is-good', 'is-warn');
            els.fontStatus.style.display = 'none';
            return;
        }

        var selected = state.layers.find(l => l.selected) || state.layers.find(l => l.base) || state.layers[0];
        if (!selected) {
            els.fontStatus.classList.remove('is-good', 'is-warn');
            els.fontStatus.style.display = 'none';
            return;
        }

        var supportedFonts = ['inter', 'gilroy'];
        var fontName = (selected.fontName || '').toLowerCase();
        var isSupported = supportedFonts.some(function (f) { return fontName.indexOf(f) !== -1; });

        if (isSupported) {
            els.fontStatus.classList.remove('is-warn');
            els.fontStatus.classList.add('is-good');
            els.fontStatus.style.display = '';
            els.fontStatusText.textContent = (selected.fontName || 'This font') +
                ' is fully supported for animation and morphing.';
        } else {
            els.fontStatus.classList.remove('is-good');
            els.fontStatus.classList.add('is-warn');
            els.fontStatus.style.display = '';
            els.fontStatusText.textContent = (selected.fontName || 'This font') +
                ' may cause animation glitches. Try the Fix tab.';
        }
    }

    function getSelectedLayerIndex() {
        return state.layers.findIndex(l => l.selected);
    }

    function removeSelectedLayer() {
        var idx = getSelectedLayerIndex();
        if (idx === -1) return;

        state.layers.splice(idx, 1);
        // Ensure base exists if list not empty
        if (state.layers.length > 0 && !state.layers.find(l => l.base)) {
            state.layers[0].base = true;
        }
        renderLayerList();
    }

    function moveLayerUp() {
        var idx = getSelectedLayerIndex();
        if (idx <= 0) return;

        var temp = state.layers[idx];
        state.layers[idx] = state.layers[idx - 1];
        state.layers[idx - 1] = temp;
        renderLayerList();
    }

    function moveLayerDown() {
        var idx = getSelectedLayerIndex();
        if (idx === -1 || idx >= state.layers.length - 1) return;

        var temp = state.layers[idx];
        state.layers[idx] = state.layers[idx + 1];
        state.layers[idx + 1] = temp;
        renderLayerList();
    }

    function setBaseLayer(index) {
        var idx = (typeof index === 'number') ? index : getSelectedLayerIndex();
        if (idx === -1) return;

        state.layers.forEach((l, i) => l.base = (i === idx));
        renderLayerList();
    }

    // -> Center Controls (Now Global UI toggle)
    function updateCenterControls() {
        els.selectCenterMode.disabled = !els.cbCenterEnable.checked;
    }

    function updateKeyframeControls() {
        if (!els.cbOffsetEnable) return;
        var enabled = !!els.cbOffsetEnable.checked;
        if (els.inputStagger) els.inputStagger.disabled = !enabled;
        if (els.selectDirection) els.selectDirection.disabled = !enabled;
    }

    // -> Apply Create
    function applyCreate() {
        if (state.layers.length === 0) {
            setStatus("No layers to process");
            // Highlight Create tab if empty?
            if (!document.getElementById('tab-create').classList.contains('active')) {
                alert("Please add layers in the 'Create' tab first.");
            }
            return;
        }

        showLoading(true);
        setStatus("Processing...", true);

        var easeMode = (els.selectEase && els.selectEase.value) ? els.selectEase.value : 'ease';
        var easeCustom = state.easeCustom;
        if (easeMode === 'custom' && !easeCustom) {
            easeCustom = { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1.0 };
        }

        var offsetsEnabled = !els.cbOffsetEnable || els.cbOffsetEnable.checked;
        var options = {
            offset: parseInt(els.inputOffset.value) || 15,
            stagger: offsetsEnabled ? (parseInt(els.inputStagger.value) || 2) : 0,
            direction: els.selectDirection.value,
            offsetEnabled: offsetsEnabled,
            easeMode: easeMode,
            easeCustom: easeCustom,
            align: els.cbAlign.checked,
            loopAnimation: !!(els.cbLoop && els.cbLoop.checked),
            centEnable: els.cbCenterEnable.checked,
            centMode: els.selectCenterMode.value,
            layers: state.layers,
            deleteOriginals: !!(els.cbDeleteOriginals && els.cbDeleteOriginals.checked)
        };

        var jsonArgs = JSON.stringify(options);

        // Escape json for evalScript
        // We use a safe wrapper in JSX but here we just pass as string
        evalScript(`Fontan.createAnimation(${JSON.stringify(jsonArgs)})`, function (res) {
            showLoading(false);
            if (res && res.indexOf("error") !== -1) {
                setStatus("Error occurred");
                alert(res);
            } else {
                setStatus("Complete!");
                // Optionally switch back to Create tab or stay here?
                // Stay here is fine.
            }
        });
    }

    // --- Logic: Fix Tab ---

    function refreshShapeLayers() {
        setStatus("Loading shapes...");
        els.selectShape.disabled = true;
        var previous = els.selectShape.value;

        evalScript('Fontan.getShapeLayers()', function (res) {
            try {
                var shapes = JSON.parse(res || '[]');
                state.shapeLayers = shapes;

                els.selectShape.innerHTML = '<option value="">-- Select Shape Layer --</option>';
                shapes.forEach(function (s) {
                    var opt = document.createElement('option');
                    opt.value = s.id;
                    opt.text = s.name;
                    els.selectShape.appendChild(opt);
                });

                // Restore previous selection if still present, otherwise select first
                if (previous && shapes.some(function (s) { return String(s.id) === String(previous); })) {
                    els.selectShape.value = previous;
                } else if (shapes.length) {
                    els.selectShape.selectedIndex = 1; // first shape option after placeholder
                }

                if (els.selectShape.value) {
                    loadGroupsForShape();
                } else {
                    renderGroupList([]);
                }

                els.selectShape.disabled = shapes.length === 0;
                setStatus(shapes.length ? "Select shape layer" : "No shape layers");
            } catch (e) {
                console.error("Failed to load shape layers", e, res);
                setStatus("Error loading shapes");
                alert("Could not load shape layers. Check active comp and try Refresh.");
            }
        });
    }

    function loadGroupsForShape() {
        var shapeId = els.selectShape.value;
        if (!shapeId) {
            renderGroupList([]);
            return;
        }

        setStatus("Analyzing groups...");
        evalScript("Fontan.getGroups(" + JSON.stringify(shapeId) + ")", function (res) {
            try {
                if (!res) {
                    setStatus("Error: No response");
                    return;
                }
                var data = JSON.parse(res);
                if (data && data.error) {
                    setStatus("Error: " + data.error);
                    alert("JSX Error: " + data.error);
                    return;
                }
                if (!Array.isArray(data)) {
                    setStatus("Unexpected response");
                    alert("Unexpected response from host when loading groups.");
                    return;
                }

                renderGroupList(data);
                setStatus(data.length ? "Ready" : "No groups found");
            } catch (e) {
                console.error("Error parsing groups", e, res);
                setStatus("Error parsing groups");
                alert("Failed to parse groups. Check console for details.");
            }
        });
    }

    function renderGroupList(groups) {
        state.fixGroups = groups;
        els.groupList.innerHTML = '';
        els.groupCount.textContent = groups.length + " groups";

        if (groups.length === 0) {
            els.groupList.innerHTML = `<div class="empty-state"><p>No vector groups found</p></div>`;
            return;
        }

        groups.forEach((g, i) => {
            var el = document.createElement('div');
            el.className = 'list-item';
            if (g.paths > 0) {
                el.classList.add(g.deltaMax > 0 ? 'vertex-bad' : 'vertex-ok');
            }
            el.innerHTML = `
                <span class="item-index">${i + 1}</span>
                <span class="item-name group-item-name">${g.name}</span>
                <span class="item-badge" title="Paths">${g.paths} p</span>
                <span class="item-badge" title="Max Verts">${g.maxVerts} v</span>
                <span class="item-badge" title="Difference">Δ ${g.deltaMax}</span>
                <button class="btn btn-secondary btn-xs group-fix-btn" type="button">Fix Vectors</button>
                ${g.deltaMax > 0 ? '<span class="item-badge" style="color:#ef4444">⚠</span>' : ''}
            `;

            // Toggle selection
            el.addEventListener('click', () => {
                g.selected = !g.selected;
                el.classList.toggle('selected');
            });

            var fixBtn = el.querySelector('.group-fix-btn');
            if (fixBtn) {
                fixBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    openVectorPreview(g);
                });
            }

            els.groupList.appendChild(el);
        });
    }

    function openVectorPreview(group) {
        var shapeId = els.selectShape.value;
        if (!shapeId) {
            setStatus("Select shape layer");
            return;
        }
        state.vectorPreviewTarget = {
            shapeId: shapeId,
            groupIndex: group.index
        };
        state.vectorCustomIndices = {};
        var args = JSON.stringify({
            shapeId: shapeId,
            groupIndex: group.index
        });
        showLoading(true);
        evalScript("Fontan.getGroupVectorData(" + JSON.stringify(args) + ")", function (res) {
            showLoading(false);
            try {
                var data = JSON.parse(res || "{}");
                if (data && data.error) {
                    alert(data.error);
                    return;
                }
                state.vectorPreviewData = data;
                renderVectorPreview(data);
                if (els.vectorModal) els.vectorModal.classList.add('active');
            } catch (e) {
                console.error("Vector preview error", e, res);
                alert("Failed to load vector preview.");
            }
        });
    }

    function refreshVectorPreview() {
        if (!state.vectorPreviewTarget) return;
        var args = JSON.stringify(state.vectorPreviewTarget);
        evalScript("Fontan.getGroupVectorData(" + JSON.stringify(args) + ")", function (res) {
            try {
                var data = JSON.parse(res || "{}");
                if (data && data.error) {
                    return;
                }
                state.vectorPreviewData = data;
                renderVectorPreview(data);
            } catch (e) {
                console.error("Vector preview error", e, res);
            }
        });
    }

    function applyVectorFirstVertex() {
        if (!state.vectorPreviewTarget) return;
        var mode = (els.vectorFvMode && els.vectorFvMode.value) ? els.vectorFvMode.value : "bottom";
        if (mode === 'custom') {
            var keys = Object.keys(state.vectorCustomIndices || {});
            if (!keys.length) {
                alert("Custom mode: click a point to choose the first vertex.");
                return;
            }
        }
        var argsJson = JSON.stringify({
            shapeId: state.vectorPreviewTarget.shapeId,
            groups: [state.vectorPreviewTarget.groupIndex],
            mode: mode,
            customIndices: (mode === 'custom') ? state.vectorCustomIndices : null
        });

        showLoading(true);
        setStatus("Applying fix...", true);
        evalScript("Fontan.applyFix(" + JSON.stringify(argsJson) + ")", function (res) {
            showLoading(false);
            if (res && res.indexOf("error") === 0) {
                setStatus("Fix failed");
                alert(res);
                return;
            }
            setStatus(res || "Fix applied");
            loadGroupsForShape();
            refreshVectorPreview();
        });
    }

    function renderVectorPreview(data) {
        if (!data || !els.vectorPaths || !els.vectorPreview) return;
        var pathsK1 = data.pathsK1 || data.paths || [];
        var pathsK2 = data.pathsK2 || [];
        var pathsK3 = data.pathsK3 || [];
        var pathsK4 = data.pathsK4 || [];
        if (!pathsK1.length && !pathsK2.length && !pathsK3.length && !pathsK4.length) return;
        els.vectorPaths.innerHTML = '';
        if (els.vectorTitle) els.vectorTitle.textContent = data.name || "Group";

        if (els.toggleK3) {
            var control3 = els.toggleK3.closest('.vector-control');
            if (control3) control3.style.display = pathsK3.length ? 'inline-flex' : 'none';
        }
        if (els.toggleK4) {
            var control4 = els.toggleK4.closest('.vector-control');
            if (control4) control4.style.display = pathsK4.length ? 'inline-flex' : 'none';
        }
        updateVectorEditMode();

        var w = 240, h = 240;
        if (els.vectorPreview.viewBox && els.vectorPreview.viewBox.baseVal) {
            w = els.vectorPreview.viewBox.baseVal.width || w;
            h = els.vectorPreview.viewBox.baseVal.height || h;
        }
        var bounds = data.bounds || {};
        if (!isFinite(bounds.minX) || !isFinite(bounds.maxX)) {
            bounds = computeBoundsFromPaths(pathsK1.concat(pathsK2, pathsK3, pathsK4));
        }
        var width = bounds.maxX - bounds.minX;
        var height = bounds.maxY - bounds.minY;
        if (!isFinite(width) || width <= 0) width = 1;
        if (!isFinite(height) || height <= 0) height = 1;
        var pad = 18;
        var scale = Math.min((w - pad * 2) / width, (h - pad * 2) / height);
        if (!isFinite(scale) || scale <= 0) scale = 1;
        var offsetX = (w - width * scale) / 2 - bounds.minX * scale;
        var offsetY = (h - height * scale) / 2 - bounds.minY * scale;

        function mapPoint(pt) {
            return [
                (pt[0] * scale + offsetX),
                (pt[1] * scale + offsetY)
            ];
        }

        function drawPaths(paths, pathClass, pointClass, keyLabel) {
            var isCustom = isVectorCustomMode();
            paths.forEach(function (p, pathIndexDefault) {
                var pathIndex = (p && p.idx !== undefined && p.idx !== null) ? p.idx : pathIndexDefault;
                var d = buildSvgPath(p, scale, offsetX, offsetY);
                if (d) {
                    var pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    pathEl.setAttribute('d', d);
                    pathEl.setAttribute('class', pathClass);
                    els.vectorPaths.appendChild(pathEl);
                }
                if (p && p.v && p.v.length) {
                    for (var i = 0; i < p.v.length; i++) {
                        var mapped = mapPoint(p.v[i]);
                        var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                        var selIdx = (state.vectorCustomIndices && state.vectorCustomIndices[pathIndex] !== undefined) ?
                            parseInt(state.vectorCustomIndices[pathIndex], 10) : null;
                        var isSelected = isCustom && selIdx === i;
                        dot.setAttribute('cx', mapped[0].toFixed(2));
                        dot.setAttribute('cy', mapped[1].toFixed(2));
                        dot.setAttribute('r', isSelected ? 4.6 : (i === 0 ? 3.4 : 2.2));
                        dot.setAttribute('class', pointClass + (i === 0 ? ' vector-point-first' : '') +
                            (isSelected ? ' vector-point-selected' : ''));
                        dot.dataset.pathIndex = pathIndex;
                        dot.dataset.vertIndex = i;
                        if (keyLabel) dot.dataset.key = keyLabel;
                        els.vectorPaths.appendChild(dot);
                    }
                }
            });
        }

        var vis = state.vectorToggles || {};
        if (vis.k1 !== false) drawPaths(pathsK1, 'vector-path vector-path-k1', 'vector-point vector-point-k1', 'k1');
        if (vis.k2 !== false) drawPaths(pathsK2, 'vector-path vector-path-k2', 'vector-point vector-point-k2', 'k2');
        if (vis.k3 !== false) drawPaths(pathsK3, 'vector-path vector-path-k3', 'vector-point vector-point-k3', 'k3');
        if (vis.k4 !== false) drawPaths(pathsK4, 'vector-path vector-path-k4', 'vector-point vector-point-k4', 'k4');

        if (els.vectorMeta) {
            var maxVerts = (data.maxVerts || data.maxVerts === 0) ? data.maxVerts : "—";
            els.vectorMeta.textContent = "K1: " + pathsK1.length + " • K2: " + pathsK2.length +
                " • K3: " + pathsK3.length + " • K4: " + pathsK4.length + " • Max verts: " + maxVerts;
        }
    }

    function computeBoundsFromPaths(paths) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        paths.forEach(function (p) {
            var v = p.v || [];
            for (var i = 0; i < v.length; i++) {
                var x = v[i][0], y = v[i][1];
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        });
        if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    }

    function buildSvgPath(pathData, scale, offsetX, offsetY) {
        if (!pathData || !pathData.v || pathData.v.length === 0) return '';
        var v = pathData.v;
        var ins = pathData.i || [];
        var outs = pathData.o || [];
        var closed = !!pathData.closed;
        var n = v.length;

        function mapPoint(pt) {
            return [
                (pt[0] * scale + offsetX),
                (pt[1] * scale + offsetY)
            ];
        }

        function fmt(num) { return num.toFixed(2); }

        var start = mapPoint(v[0]);
        var d = 'M ' + fmt(start[0]) + ' ' + fmt(start[1]);
        for (var i = 0; i < n; i++) {
            var j = i + 1;
            if (j >= n) {
                if (!closed) break;
                j = 0;
            }
            var o = outs[i] || [0, 0];
            var inn = ins[j] || [0, 0];
            var cp1 = mapPoint([v[i][0] + o[0], v[i][1] + o[1]]);
            var cp2 = mapPoint([v[j][0] + inn[0], v[j][1] + inn[1]]);
            var end = mapPoint(v[j]);
            d += ' C ' + fmt(cp1[0]) + ' ' + fmt(cp1[1]) + ', ' + fmt(cp2[0]) + ' ' + fmt(cp2[1]) + ', ' + fmt(end[0]) + ' ' + fmt(end[1]);
        }
        if (closed) d += ' Z';
        return d;
    }

    function applyFirstVertex() {
        var shapeId = els.selectShape.value;
        var selectedGroups = state.fixGroups.filter(function (g) { return g.selected; }).map(function (g) { return g.index; });
        if (selectedGroups.length === 0 && shapeId && state.fixGroups.length > 0) {
            // If nothing is selected in the list, apply to all groups
            selectedGroups = state.fixGroups.map(function (g) { return g.index; });
        }
        if (selectedGroups.length === 0 && !shapeId) {
            setStatus("Select groups or vector paths");
        }

        var mode = (els.selectFvMode && els.selectFvMode.dataset.value) ? els.selectFvMode.dataset.value : "bottom";
        if (mode === "lock") mode = "ref_firstkey";

        showLoading(true);
        setStatus("Applying fix...", true);

        var argsJson = JSON.stringify({
            shapeId: shapeId || null,
            groups: selectedGroups,
            mode: mode
        });

        // pass JSON string literal into evalScript
        evalScript("Fontan.applyFix(" + JSON.stringify(argsJson) + ")", function (res) {
            showLoading(false);
            if (res && res.indexOf("error") === 0) {
                setStatus("Fix failed");
                alert(res);
                return;
            }
            setStatus(res || "Fix applied");
            loadGroupsForShape();
        });
    }

    // --- Helpers ---
    function setStatus(msg, isWorking) {
        els.statusText.textContent = msg;
        if (isWorking) {
            els.indicator.classList.add('working');
        } else {
            els.indicator.classList.remove('working');
        }
    }

    function stopWorking() {
        els.indicator.classList.remove('working');
    }

    function showLoading(show) {
        if (show) els.overlay.classList.add('active');
        else els.overlay.classList.remove('active');
    }

    function setupContextMenus() {
        // Prevent default context menu
        document.addEventListener('contextmenu', event => event.preventDefault());
    }

    function setupEasingEditor() {
        if (!els.easingModal || !els.easingGraph) return;

        var points = { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
        var dragHandle = null;
        var MIN_POINT = 0.01;
        var MAX_POINT = 0.99;

        function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

        function setPoints(p) {
            points = {
                x1: clamp(p.x1, MIN_POINT, MAX_POINT),
                y1: clamp(p.y1, MIN_POINT, MAX_POINT),
                x2: clamp(p.x2, MIN_POINT, MAX_POINT),
                y2: clamp(p.y2, MIN_POINT, MAX_POINT)
            };
            renderCurve();
        }

        var customDefault = { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1.0 };

        function getDefaultForMode(mode) {
            if (mode === 'custom') return customDefault;
            if (mode === 'ease_in') return { x1: 0.42, y1: 0, x2: 1, y2: 1 };
            if (mode === 'ease_out') return { x1: 0, y1: 0, x2: 0.58, y2: 1 };
            if (mode === 'ease_in_out') return { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };
            if (mode === 'linear') return { x1: 0, y1: 0, x2: 1, y2: 1 };
            return { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
        }

        function renderCurve() {
            var w = 200;
            var h = 140;
            var p1x = points.x1 * w;
            var p2x = points.x2 * w;
            var p1y = h - (points.y1 * h);
            var p2y = h - (points.y2 * h);

            if (els.easingPath) {
                var d = 'M0 ' + h + ' C ' +
                    p1x.toFixed(2) + ' ' + p1y.toFixed(2) + ', ' +
                    p2x.toFixed(2) + ' ' + p2y.toFixed(2) + ', ' +
                    w + ' 0';
                els.easingPath.setAttribute('d', d);
            }
            if (els.easingLine1) {
                els.easingLine1.setAttribute('x1', 0);
                els.easingLine1.setAttribute('y1', h);
                els.easingLine1.setAttribute('x2', p1x);
                els.easingLine1.setAttribute('y2', p1y);
            }
            if (els.easingLine2) {
                els.easingLine2.setAttribute('x1', w);
                els.easingLine2.setAttribute('y1', 0);
                els.easingLine2.setAttribute('x2', p2x);
                els.easingLine2.setAttribute('y2', p2y);
            }
            if (els.easingHandle1) {
                els.easingHandle1.setAttribute('cx', p1x);
                els.easingHandle1.setAttribute('cy', p1y);
            }
            if (els.easingHandle2) {
                els.easingHandle2.setAttribute('cx', p2x);
                els.easingHandle2.setAttribute('cy', p2y);
            }
            if (els.easingValues) {
                els.easingValues.textContent =
                    'P1: ' + points.x1.toFixed(2) + ', ' + points.y1.toFixed(2) +
                    ' • P2: ' + points.x2.toFixed(2) + ', ' + points.y2.toFixed(2);
            }
        }

        function openModal() {
            var mode = els.selectEase ? els.selectEase.value : 'ease';
            if (mode === 'custom' && state.easeCustom) {
                setPoints(state.easeCustom);
            } else {
                var def = getDefaultForMode(mode);
                state.easeCustom = def; // remember last used
                setPoints(def);
            }
            els.easingModal.classList.add('active');
        }

        function closeModal() {
            els.easingModal.classList.remove('active');
            dragHandle = null;
        }

        function handlePointerMove(e) {
            if (!dragHandle) return;
            var rect = els.easingGraph.getBoundingClientRect();
            var x = clamp((e.clientX - rect.left) / rect.width, MIN_POINT, MAX_POINT);
            var y = clamp((e.clientY - rect.top) / rect.height, MIN_POINT, MAX_POINT);
            var yVal = 1 - y;
            if (dragHandle === 'p1') {
                points.x1 = x;
                points.y1 = clamp(yVal, MIN_POINT, MAX_POINT);
            } else {
                points.x2 = x;
                points.y2 = clamp(yVal, MIN_POINT, MAX_POINT);
            }
            renderCurve();
        }

        if (els.btnEaseEditor) {
            els.btnEaseEditor.addEventListener('click', openModal);
        }
        if (els.btnEaseClose) {
            els.btnEaseClose.addEventListener('click', closeModal);
        }
        if (els.btnEaseCancel) {
            els.btnEaseCancel.addEventListener('click', closeModal);
        }
        if (els.btnEaseOk) {
            els.btnEaseOk.addEventListener('click', function () {
                state.easeCustom = {
                    x1: points.x1,
                    y1: points.y1,
                    x2: points.x2,
                    y2: points.y2
                };
                if (els.selectEase) {
                    els.selectEase.value = 'custom';
                }
                closeModal();
            });
        }
        function startDrag(handle, e) {
            dragHandle = handle;
            e.preventDefault();
        }
        if (els.easingHandle1) {
            els.easingHandle1.addEventListener('mousedown', function (e) { startDrag('p1', e); });
        }
        if (els.easingHandle2) {
            els.easingHandle2.addEventListener('mousedown', function (e) { startDrag('p2', e); });
        }
        window.addEventListener('mousemove', handlePointerMove);
        window.addEventListener('mouseup', function () { dragHandle = null; });
        renderCurve();
    }

    function setupVectorToggles() {
        if (!els.toggleK1 || !els.toggleK2 || !els.toggleK3 || !els.toggleK4) return;

        function syncToggles() {
            state.vectorToggles = {
                k1: !!els.toggleK1.checked,
                k2: !!els.toggleK2.checked,
                k3: !!els.toggleK3.checked,
                k4: !!els.toggleK4.checked
            };
            if (state.vectorPreviewData) {
                renderVectorPreview(state.vectorPreviewData);
            }
        }

        els.toggleK1.addEventListener('change', syncToggles);
        els.toggleK2.addEventListener('change', syncToggles);
        els.toggleK3.addEventListener('change', syncToggles);
        els.toggleK4.addEventListener('change', syncToggles);

        syncToggles();
    }

    function isVectorCustomMode() {
        return !!(els.vectorFvMode && els.vectorFvMode.value === 'custom');
    }

    function updateVectorEditMode() {
        var isCustom = isVectorCustomMode();
        if (els.vectorEditHint) {
            els.vectorEditHint.style.display = isCustom ? 'block' : 'none';
        }
        if (els.vectorPreviewWrap) {
            els.vectorPreviewWrap.classList.toggle('is-editable', isCustom);
        }
    }

    function setupVectorEditor() {
        if (els.vectorFvMode) {
            els.vectorFvMode.addEventListener('change', function () {
                updateVectorEditMode();
                if (state.vectorPreviewData) renderVectorPreview(state.vectorPreviewData);
            });
        }
        if (els.vectorPreview) {
            els.vectorPreview.addEventListener('click', function (e) {
                if (!isVectorCustomMode()) return;
                var t = e.target;
                if (!t || !t.dataset) return;
                var pIdx = t.dataset.pathIndex;
                var vIdx = t.dataset.vertIndex;
                if (pIdx === undefined || vIdx === undefined) return;
                var pNum = parseInt(pIdx, 10);
                var vNum = parseInt(vIdx, 10);
                if (isNaN(pNum) || isNaN(vNum)) return;
                state.vectorCustomIndices[pNum] = vNum;
                if (state.vectorPreviewData) renderVectorPreview(state.vectorPreviewData);
            });
        }
        updateVectorEditMode();
    }

    function setupFvModeSelect() {
        if (!els.selectFvMode) return;
        var buttons = els.selectFvMode.querySelectorAll('button[data-value]');
        if (!buttons.length) return;

        function setMode(value) {
            els.selectFvMode.dataset.value = value;
            buttons.forEach(function (btn) {
                btn.classList.toggle('active', btn.dataset.value === value);
            });
        }

        buttons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                setMode(btn.dataset.value || 'bottom');
            });
        });

        var initValue = els.selectFvMode.dataset.value || 'bottom';
        setMode(initValue);
    }

})();
