/*
 * CSInterface - Minimal Standard Compatible Version
 */

var SystemPath = {
    USER_DATA: "userData",
    COMMON_FILES: "commonFiles",
    MY_DOCUMENTS: "myDocuments",
    APPLICATION: "application",
    EXTENSION: "extension",
    HOST_APPLICATION: "hostApplication"
};

var CSInterface = function () {
    // If window.__adobe_cep__ is missing, we are likely not in CEP
    if (typeof window.__adobe_cep__ === "undefined") {
        console.warn("CSInterface: window.__adobe_cep__ is missing. Are you running in a browser?");
        return;
    }
};

CSInterface.THEME_COLOR_CHANGED_EVENT = "com.adobe.csxs.events.ThemeColorChanged";

CSInterface.prototype.getHostEnvironment = function () {
    var env = window.__adobe_cep__.getHostEnvironment();
    return JSON.parse(env);
};

CSInterface.prototype.closeExtension = function () {
    window.__adobe_cep__.closeExtension();
};

CSInterface.prototype.getSystemPath = function (pathType) {
    return window.__adobe_cep__.getSystemPath(pathType);
};

CSInterface.prototype.evalScript = function (script, callback) {
    if (callback === null || callback === undefined) {
        callback = function (result) { };
    }
    window.__adobe_cep__.evalScript(script, callback);
};

CSInterface.prototype.getApplicationID = function () {
    var appId = this.getHostEnvironment().appId;
    return appId;
};

CSInterface.prototype.getHostCapabilities = function () {
    var caps = window.__adobe_cep__.getHostCapabilities();
    return JSON.parse(caps);
};

CSInterface.prototype.dispatchEvent = function (event) {
    if (typeof event.data == "object") {
        event.data = JSON.stringify(event.data);
    }
    window.__adobe_cep__.dispatchEvent(event);
};

CSInterface.prototype.addEventListener = function (type, listener, obj) {
    window.__adobe_cep__.addEventListener(type, listener, obj);
};

CSInterface.prototype.removeEventListener = function (type, listener, obj) {
    window.__adobe_cep__.removeEventListener(type, listener, obj);
};

CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
    window.__adobe_cep__.requestOpenExtension(extensionId, params);
};

CSInterface.prototype.getExtensions = function (names) {
    var params = JSON.stringify(names);
    var exts = window.__adobe_cep__.getExtensions(params);
    return JSON.parse(exts);
};

CSInterface.prototype.openURLInDefaultBrowser = function (url) {
    window.__adobe_cep__.openURLInDefaultBrowser(url);
};
