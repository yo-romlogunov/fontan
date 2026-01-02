/*
    FONTAN AE — CEP Backend
*/

// JSON Polyfill for older AE versions
if (typeof JSON !== 'object') {
    JSON = {};
}
(function () {
    'use strict';
    var rx_one = /^[\],:{}\s]*$/;
    var rx_two = /\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g;
    var rx_three = /"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g;
    var rx_four = /(?:^|:|,)(?:\s*\[)+/g;
    if (typeof JSON.parse !== 'function') {
        JSON.parse = function (text) {
            var j;
            function walk(holder, key) {
                var k, v, value = holder[key];
                if (value && typeof value === 'object') {
                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) { value[k] = v; } else { delete value[k]; }
                        }
                    }
                }
                return value;
            }
            text = String(text);
            if (rx_one.test(text.replace(rx_two, '@').replace(rx_three, ']').replace(rx_four, ''))) {
                j = eval('(' + text + ')');
                return typeof reviver === 'function' ? walk({ '': j }, '') : j;
            }
            throw new SyntaxError('JSON.parse');
        };
    }
    if (typeof JSON.stringify !== 'function') {
        JSON.stringify = function (value) {
            var t = typeof value;
            if (t === 'string') return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
            if (t === 'number' || t === 'boolean') return String(value);
            if (value === null) return 'null';
            if (t === 'object') {
                if (value instanceof Array) {
                    var res = '[';
                    for (var i = 0; i < value.length; i++) res += (i ? ',' : '') + JSON.stringify(value[i]);
                    return res + ']';
                }
                var res = '{', first = true;
                for (var k in value) {
                    if (Object.prototype.hasOwnProperty.call(value, k)) {
                        if (!first) res += ',';
                        res += JSON.stringify(k) + ':' + JSON.stringify(value[k]);
                        first = false;
                    }
                }
                return res + '}';
            }
            return 'null';
        };
    }
}());

// ============================================================================
// FONTAN LOGIC
// ============================================================================

// Make globally available
if (typeof $.global.Fontan === 'undefined') {
    $.global.Fontan = {};
}

$.global.Fontan = (function () {

    // --- Helpers ---
    function getActiveComp() {
        var c = app.project.activeItem;
        return (c && c instanceof CompItem) ? c : null;
    }

    function isTextLayer(L) { return L instanceof TextLayer; }
    function isShapeLayer(L) { return L instanceof ShapeLayer; }

    function fontStyle(layer) {
        try {
            var td = layer.property("Source Text").value;
            if (td.fontStyle && typeof td.fontStyle === "string" && td.fontStyle.length) return td.fontStyle;
            var ps = (td.font || "").toLowerCase();
            var hasBold = /bold|black|heavy|extrabold|semibold|demi/i.test(ps) || td.fauxBold === true;
            var hasItalic = /italic|oblique/i.test(ps) || td.fauxItalic === true;
            var weights = [
                { re: /thin|hairline/i, name: "Thin" },
                { re: /extralight|ultralight/i, name: "ExtraLight" },
                { re: /light/i, name: "Light" },
                { re: /regular|book|roman|normal/i, name: "Regular" },
                { re: /medium/i, name: "Medium" },
                { re: /semibold|demibold/i, name: "SemiBold" },
                { re: /bold/i, name: "Bold" },
                { re: /extrabold|ultrabold/i, name: "ExtraBold" },
                { re: /black|heavy/i, name: "Black" }
            ];
            var weight = "Regular";
            for (var i = 0; i < weights.length; i++) { if (weights[i].re.test(ps)) { weight = weights[i].name; break; } }
            if (hasBold && weight === "Regular") weight = "Bold";
            return hasItalic ? (weight + " Italic") : weight;
        } catch (e) { return "Unknown"; }
    }

    function fontName(layer) {
        try {
            var td = layer.property("Source Text").value;
            if (td && td.font) return td.font;
        } catch (e) { }
        return "Unknown";
    }

    function findLayerById(comp, id) {
        if (!comp) return null;
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).id == id) return comp.layer(i);
        }
        return null; // heuristic fallback could be added
    }

    function ensureActiveViewer(comp) {
        try { comp.openInViewer(); if (app.activate) app.activate(); } catch (e) { }
    }

    function ensureSelectable(layer, comp) {
        try { if (layer.locked) layer.locked = false; } catch (e) { }
        try { if (layer.shy && comp && comp.hideShyLayers) comp.hideShyLayers = false; } catch (e) { }
        try { if (layer.enabled === false) layer.enabled = true; } catch (e) { }
    }

    function deselectAll(comp) {
        for (var i = 1; i <= comp.numLayers; i++) try { comp.layer(i).selected = false; } catch (e) { }
    }

    function findCmdId() {
        var id = 0;
        try { id = app.findMenuCommandId("Create Shapes from Text") | 0; } catch (e) { }
        if (!id) try { id = app.findMenuCommandId("Создать фигуры из текста") | 0; } catch (e) { }
        if (!id) id = 3781;
        return id;
    }
    var CMD_SHAPES = findCmdId();

    function textToShapes(layer) {
        var c = layer.containingComp;
        if (!CMD_SHAPES) throw Error("Menu command 'Create Shapes from Text' not found.");
        ensureActiveViewer(c);
        ensureSelectable(layer, c);
        deselectAll(c);
        layer.selected = true;
        app.executeCommand(CMD_SHAPES);
        var sel = c.selectedLayers;
        for (var i = 0; i < sel.length; i++) if (sel[i] instanceof ShapeLayer) return sel[i];
        for (var j = 1; j <= c.numLayers; j++) {
            var L = c.layer(j);
            if (L.selected && (L instanceof ShapeLayer)) return L;
        }
        return null;
    }

    // --- Path Math ---
    function rotateArrays(verts, ins, outs, off) {
        var n = verts.length, rV = [], rI = [], rO = [];
        for (var i = 0; i < n; i++) {
            var j = (i + off) % n;
            rV.push(verts[j]); rI.push(ins[j]); rO.push(outs[j]);
        }
        return { v: rV, i: rI, o: rO };
    }
    function reverseArrays(verts, ins, outs) {
        var n = verts.length, rV = [], rI = [], rO = [];
        for (var i = 0; i < n; i++) {
            var j = n - 1 - i;
            rV.push(verts[j]);
            rI.push(outs[j]);
            rO.push(ins[j]);
        }
        return { v: rV, i: rI, o: rO };
    }
    function sumSqDist(a, b) {
        var s = 0;
        for (var i = 0; i < a.length; i++) { var dx = a[i][0] - b[i][0], dy = a[i][1] - b[i][1]; s += dx * dx + dy * dy; }
        return s;
    }
    function maxDistSq(a, b) {
        var m = 0;
        for (var i = 0; i < a.length; i++) { var dx = a[i][0] - b[i][0], dy = a[i][1] - b[i][1]; var d = dx * dx + dy * dy; if (d > m) m = d; }
        return m;
    }

    function alignToReference(shapeVal, refVal) {
        var R = refVal, S = shapeVal;
        if (!R || !S) return S;
        var vR = R.vertices || [], vS = S.vertices || [];
        var n = vR.length;
        if (!R.closed || !S.closed || n !== vS.length || n === 0) return S;

        var iS = S.inTangents || [], oS = S.outTangents || [];
        var best = { costMax: Infinity, costSum: Infinity, arr: null };

        for (var off = 0; off < n; off++) {
            var rot = rotateArrays(vS, iS, oS, off);
            var cMax = maxDistSq(rot.v, vR);
            var cSum = sumSqDist(rot.v, vR);
            if ((cMax < best.costMax) || (cMax === best.costMax && cSum < best.costSum)) best = { costMax: cMax, costSum: cSum, arr: rot };
        }
        var rev = reverseArrays(vS, iS, oS);
        for (var off2 = 0; off2 < n; off2++) {
            var rot2 = rotateArrays(rev.v, rev.i, rev.o, off2);
            var cMax2 = maxDistSq(rot2.v, vR);
            var cSum2 = sumSqDist(rot2.v, vR);
            if ((cMax2 < best.costMax) || (cMax2 === best.costMax && cSum2 < best.costSum)) best = { costMax: cMax2, costSum: cSum2, arr: rot2 };
        }

        var out = new Shape();
        out.closed = true;
        out.vertices = best.arr.v.slice();
        out.inTangents = best.arr.i.slice();
        out.outTangents = best.arr.o.slice();
        return out;
    }

    function allVectorPaths(shapeLayer) {
        var out = [];
        function walk(group) {
            if (!group || !group.numProperties) return;
            for (var i = 1; i <= group.numProperties; i++) {
                var p = group.property(i);
                if (!p) continue;
                if (p.propertyType === PropertyType.PROPERTY) {
                    if (p.matchName.indexOf("ADBE Vector Shape") === 0) out.push(p);
                } else { walk(p); }
            }
        }
        var root = shapeLayer.property("ADBE Root Vectors Group");
        if (root) walk(root);
        return out;
    }

    function snapFrame(comp, t) { var fd = comp.frameDuration; return Math.round(t / fd) * fd; }

    function removeAllKeys(prop) {
        try { for (var k = prop.numKeys; k >= 1; k--) prop.removeKey(k); } catch (e) { }
    }

    function mirrorLoopKeys(prop) {
        if (!prop || prop.propertyType !== PropertyType.PROPERTY) return 0;
        var n = prop.numKeys | 0;
        if (n < 2) return 0;

        var times = [], vals = [], inInterp = [], outInterp = [], inEase = [], outEase = [];
        for (var i = 1; i <= n; i++) {
            times.push(prop.keyTime(i));
            vals.push(prop.keyValue(i));
            inInterp.push(prop.keyInInterpolationType(i));
            outInterp.push(prop.keyOutInterpolationType(i));
            inEase.push(prop.keyInTemporalEase(i));
            outEase.push(prop.keyOutTemporalEase(i));
        }

        var tLast = times[times.length - 1];
        var outTimes = times.slice(0);
        var outVals = vals.slice(0);
        var outInInterp = inInterp.slice(0);
        var outOutInterp = outInterp.slice(0);
        var outInEase = inEase.slice(0);
        var outOutEase = outEase.slice(0);

        for (var j = n - 1; j >= 1; j--) {
            var tNew = tLast + (tLast - times[j - 1]);
            outTimes.push(tNew);
            outVals.push(vals[j - 1]);
            outInInterp.push(outInterp[j - 1]);
            outOutInterp.push(inInterp[j - 1]);
            outInEase.push(outEase[j - 1]);
            outOutEase.push(inEase[j - 1]);
        }

        removeAllKeys(prop);
        prop.setValuesAtTimes(outTimes, outVals);
        for (var k = 1; k <= outTimes.length; k++) {
            try {
                prop.setInterpolationTypeAtKey(k, outInInterp[k - 1], outOutInterp[k - 1]);
                prop.setTemporalEaseAtKey(k, outInEase[k - 1], outOutEase[k - 1]);
            } catch (e) { }
        }
        return outTimes.length - n;
    }

    function applyEasingGroup(group, mode, influence, custom) {
        if (!group || !group.numProperties) return 0;
        var total = 0;
        var inInf = 0, outInf = 0;
        if (mode === "custom" && custom) {
            var minP = 0.01;
            var maxP = 0.99;
            var x1 = (custom.x1 !== undefined && custom.x1 !== null) ? custom.x1 : 0;
            var y1 = (custom.y1 !== undefined && custom.y1 !== null) ? custom.y1 : 0;
            var x2 = (custom.x2 !== undefined && custom.x2 !== null) ? custom.x2 : 1;
            var y2 = (custom.y2 !== undefined && custom.y2 !== null) ? custom.y2 : 1;
            x1 = Math.max(minP, Math.min(maxP, x1));
            y1 = Math.max(minP, Math.min(maxP, y1));
            x2 = Math.max(minP, Math.min(maxP, x2));
            y2 = Math.max(minP, Math.min(maxP, y2));
            // Map handle X to AE influence (swap to match AE in/out).
            inInf = Math.max(0, Math.min(100, (1 - x2) * 100));
            outInf = Math.max(0, Math.min(100, x1 * 100));
        } else if (mode === "ease" || mode === "ease_in_out") {
            inInf = influence; outInf = influence;
        } else if (mode === "ease_in") {
            inInf = influence; outInf = 0;
        } else if (mode === "ease_out") {
            inInf = 0; outInf = influence;
        }
        for (var i = 1; i <= group.numProperties; i++) {
            var p = group.property(i);
            if (!p) continue;
            if (p.propertyType === PropertyType.PROPERTY) {
                var n = p.numKeys | 0;
                if (n > 0) {
                    for (var k = 1; k <= n; k++) {
                        try {
                            if (mode === "linear") {
                                p.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
                            } else {
                                var ein = [new KeyframeEase(0, inInf)];
                                var eout = [new KeyframeEase(0, outInf)];
                                p.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
                                p.setTemporalEaseAtKey(k, ein, eout);
                            }
                            total++;
                        } catch (e) { }
                    }
                }
            } else {
                total += applyEasingGroup(p, mode, influence, custom);
            }
        }
        return total;
    }

    function applyEasingShapeLayer(shapeLayer, mode, influence, custom) {
        try {
            var root = shapeLayer.property("ADBE Root Vectors Group");
            if (root) applyEasingGroup(root, mode, influence, custom);
            var tr = shapeLayer.property("ADBE Transform Group");
            if (tr) applyEasingGroup(tr, mode, influence, custom);
        } catch (e) { }
    }

    function forceSingleKey(paths, t) {
        for (var i = 0; i < paths.length; i++) {
            try {
                var v = paths[i].value;
                removeAllKeys(paths[i]);
                paths[i].setValueAtTime(t, v);
            } catch (e) { }
        }
    }

    function copyAllKeysAppendWithOffsetAligned(pathsA, pathsB, dt, fallbackTime, fd, refShapes, doAlign) {
        var n = Math.min(pathsA.length, pathsB.length);
        var EPS = Math.max(1e-7, fd * 1e-4);
        for (var i = 0; i < n; i++) {
            var A = pathsA[i], B = pathsB[i];
            var refVal = refShapes && refShapes[i] ? refShapes[i] : null;
            try {
                var bt = [], bv = [];
                for (var b = 1; b <= B.numKeys; b++) { bt.push(B.keyTime(b)); bv.push(B.keyValue(b)); }

                var at = [], av = [];
                var kc = A.numKeys | 0;
                if (kc === 0) {
                    var sv = A.value;
                    if (doAlign && refVal && sv && sv.closed && refVal.closed && (sv.vertices || []).length === (refVal.vertices || []).length) {
                        sv = alignToReference(sv, refVal);
                    }
                    at.push(fallbackTime + dt); av.push(sv);
                } else {
                    for (var k = 1; k <= kc; k++) {
                        var vv = A.keyValue(k);
                        if (doAlign && refVal && vv && vv.closed && refVal.closed && (vv.vertices || []).length === (refVal.vertices || []).length) {
                            vv = alignToReference(vv, refVal);
                        }
                        at.push(A.keyTime(k) + dt); av.push(vv);
                    }
                }

                var T = bt.concat(at);
                var V = bv.concat(av);
                var idx = []; for (var s = 0; s < T.length; s++) idx.push(s);
                idx.sort(function (a, b) { return T[a] - T[b]; });

                var T2 = [], V2 = [];
                for (var s = 0; s < idx.length; s++) {
                    var tt = T[idx[s]], vv2 = V[idx[s]];
                    if (T2.length && Math.abs(tt - T2[T2.length - 1]) < EPS) {
                        T2[T2.length - 1] = tt; V2[T2.length - 1] = vv2;
                    } else { T2.push(tt); V2.push(vv2); }
                }

                removeAllKeys(B);
                B.setValuesAtTimes(T2, V2);
                for (var k2 = 1; k2 <= T2.length; k2++) try { B.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); } catch (e) { }
            } catch (e) { }
        }
    }

    function getTopVectorGroups(shapeLayer) {
        var res = [];
        var root = shapeLayer.property("ADBE Root Vectors Group");
        if (!root) return res;
        for (var i = 1; i <= root.numProperties; i++) {
            var gp = root.property(i);
            if (gp && gp.matchName === "ADBE Vector Group") res.push(gp);
        }
        return res;
    }

    function shiftAllKeysUnder(group, dt) {
        if (!group || !group.numProperties || dt === 0) return;
        for (var i = 1; i <= group.numProperties; i++) {
            var p = group.property(i);
            if (!p) continue;
            if (p.propertyType === PropertyType.PROPERTY && p.numKeys > 0) {
                var tm = [], vl = [], ii = [], oi = [], ie = [], oe = [];
                for (var k = 1; k <= p.numKeys; k++) {
                    tm.push(p.keyTime(k) + dt);
                    vl.push(p.keyValue(k));
                    ii.push(p.keyInInterpolationType(k));
                    oi.push(p.keyOutInterpolationType(k));
                    ie.push(p.keyInTemporalEase(k));
                    oe.push(p.keyOutTemporalEase(k));
                }
                removeAllKeys(p);
                p.setValuesAtTimes(tm, vl);
                for (var k2 = 1; k2 <= tm.length; k2++) try {
                    p.setInterpolationTypeAtKey(k2, ii[k2 - 1], oi[k2 - 1]);
                    p.setTemporalEaseAtKey(k2, ie[k2 - 1], oe[k2 - 1]);
                } catch (e) { }
            } else if (p.propertyType !== PropertyType.PROPERTY) {
                shiftAllKeysUnder(p, dt);
            }
        }
    }

    function staggerTopGroups(shapeLayer, dtPerGroup, topToBottom) {
        if (!dtPerGroup) return;
        var groups = getTopVectorGroups(shapeLayer);
        var n = groups.length;
        for (var i = 0; i < n; i++) {
            var rank = topToBottom ? i : (n - 1 - i);
            var dt = dtPerGroup * rank;
            shiftAllKeysUnder(groups[i], dt);
        }
    }

    function indexByBottom(verts) {
        var idx = 0, bestY = -Infinity, bestX = Infinity;
        for (var i = 0; i < verts.length; i++) {
            var p = verts[i]; if (p[1] > bestY || (p[1] === bestY && p[0] < bestX)) { bestY = p[1]; bestX = p[0]; idx = i; }
        }
        return idx;
    }
    function indexByTop(verts) {
        var idx = 0, bestY = Infinity, bestX = Infinity;
        for (var i = 0; i < verts.length; i++) {
            var p = verts[i]; if (p[1] < bestY || (p[1] === bestY && p[0] < bestX)) { bestY = p[1]; bestX = p[0]; idx = i; }
        }
        return idx;
    }
    function indexByLeft(verts) {
        var idx = 0, bestX = Infinity, bestY = Infinity;
        for (var i = 0; i < verts.length; i++) {
            var p = verts[i]; if (p[0] < bestX || (p[0] === bestX && p[1] < bestY)) { bestX = p[0]; bestY = p[1]; idx = i; }
        }
        return idx;
    }
    function indexByRight(verts) {
        var idx = 0, bestX = -Infinity, bestY = Infinity;
        for (var i = 0; i < verts.length; i++) {
            var p = verts[i]; if (p[0] > bestX || (p[0] === bestX && p[1] < bestY)) { bestX = p[0]; bestY = p[1]; idx = i; }
        }
        return idx;
    }
    function nearestIndexToPoint(verts, refPt) {
        var idx = 0, best = Infinity;
        for (var i = 0; i < verts.length; i++) {
            var dx = verts[i][0] - refPt[0];
            var dy = verts[i][1] - refPt[1];
            var d = dx * dx + dy * dy;
            if (d < best) { best = d; idx = i; }
        }
        return idx;
    }

    function rotateShapeToIndex(S, idx) {
        if (!S || !S.closed) return S;
        var v = S.vertices || [], i = S.inTangents || [], o = S.outTangents || [];
        if (!v || v.length < 1) return S;
        var r = rotateArrays(v, i, o, idx);
        var out = new Shape();
        out.closed = true;
        out.vertices = r.v.slice();
        out.inTangents = r.i.slice();
        out.outTangents = r.o.slice();
        return out;
    }

    function setFirstVertexOnAllKeys(pathProp, mode) {
        if (!pathProp || pathProp.matchName.indexOf("ADBE Vector Shape") !== 0) return 0;
        var changed = 0;
        try {
            var n = pathProp.numKeys | 0;
            var pickIndexFn = null;
            var refPoint = null;

            if (mode === "TOP") pickIndexFn = function (v) { return indexByTop(v); };
            else if (mode === "BOTTOM") pickIndexFn = function (v) { return indexByBottom(v); };
            else if (mode === "LEFT") pickIndexFn = function (v) { return indexByLeft(v); };
            else if (mode === "RIGHT") pickIndexFn = function (v) { return indexByRight(v); };
            else if (mode === "REF_FIRSTKEY" || mode === "LOCK") {
                if (n > 0) {
                    var v0 = pathProp.keyValue(1);
                    if (v0 && v0.closed && (v0.vertices || []).length > 0) {
                        refPoint = [v0.vertices[0][0], v0.vertices[0][1]];
                        pickIndexFn = function (v) { return nearestIndexToPoint(v, refPoint); };
                    }
                } else {
                    var vv = pathProp.value;
                    if (vv && vv.closed && (vv.vertices || []).length > 0) {
                        refPoint = [vv.vertices[0][0], vv.vertices[0][1]];
                        pickIndexFn = function (v) { return nearestIndexToPoint(v, refPoint); };
                    }
                }
            }

            if (!pickIndexFn) return 0;

            if (n === 0) {
                var val = pathProp.value;
                if (!val || !val.closed) return 0;
                var idx = pickIndexFn(val.vertices || []);
                var rot = rotateShapeToIndex(val, idx);
                pathProp.setValue(rot);
                return 1;
            }

            var times = [], vals = [], inInterp = [], outInterp = [], inEase = [], outEase = [];
            for (var k = 1; k <= n; k++) {
                var t = pathProp.keyTime(k);
                var v = pathProp.keyValue(k);
                if (v && v.closed) {
                    var idx2 = pickIndexFn(v.vertices || []);
                    v = rotateShapeToIndex(v, idx2);
                    changed++;
                }
                times.push(t);
                vals.push(v);
                inInterp.push(pathProp.keyInInterpolationType(k));
                outInterp.push(pathProp.keyOutInterpolationType(k));
                inEase.push(pathProp.keyInTemporalEase(k));
                outEase.push(pathProp.keyOutTemporalEase(k));
            }
            removeAllKeys(pathProp);
            pathProp.setValuesAtTimes(times, vals);
            for (var k2 = 1; k2 <= times.length; k2++) {
                try {
                    pathProp.setInterpolationTypeAtKey(k2, inInterp[k2 - 1], outInterp[k2 - 1]);
                    pathProp.setTemporalEaseAtKey(k2, inEase[k2 - 1], outEase[k2 - 1]);
                } catch (e) { }
            }
        } catch (e) { }
        return changed;
    }

    function setFirstVertexOnAllKeysByIndex(pathProp, index) {
        if (!pathProp || pathProp.matchName.indexOf("ADBE Vector Shape") !== 0) return 0;
        var changed = 0;
        function clampIndex(idx, len) {
            if (!len || len < 1) return 0;
            var out = idx % len;
            if (out < 0) out += len;
            return out;
        }
        try {
            var n = pathProp.numKeys | 0;
            if (n === 0) {
                var val = pathProp.value;
                if (!val || !val.closed) return 0;
                var idx = clampIndex(index, (val.vertices || []).length);
                var rot = rotateShapeToIndex(val, idx);
                pathProp.setValue(rot);
                return 1;
            }

            var times = [], vals = [], inInterp = [], outInterp = [], inEase = [], outEase = [];
            for (var k = 1; k <= n; k++) {
                var t = pathProp.keyTime(k);
                var v = pathProp.keyValue(k);
                if (v && v.closed) {
                    var idxK = clampIndex(index, (v.vertices || []).length);
                    v = rotateShapeToIndex(v, idxK);
                    changed++;
                }
                times.push(t);
                vals.push(v);
                inInterp.push(pathProp.keyInInterpolationType(k));
                outInterp.push(pathProp.keyOutInterpolationType(k));
                inEase.push(pathProp.keyInTemporalEase(k));
                outEase.push(pathProp.keyOutTemporalEase(k));
            }
            removeAllKeys(pathProp);
            pathProp.setValuesAtTimes(times, vals);
            for (var k2 = 1; k2 <= times.length; k2++) {
                try {
                    pathProp.setInterpolationTypeAtKey(k2, inInterp[k2 - 1], outInterp[k2 - 1]);
                    pathProp.setTemporalEaseAtKey(k2, inEase[k2 - 1], outEase[k2 - 1]);
                } catch (e) { }
            }
        } catch (e) { }
        return changed;
    }

    function walkCollectGroupPaths(group, out) {
        if (!group || !group.numProperties) return;
        for (var i = 1; i <= group.numProperties; i++) {
            var p = group.property(i);
            if (!p) continue;
            if (p.propertyType === PropertyType.PROPERTY) {
                if (p.matchName && p.matchName.indexOf("ADBE Vector Shape") === 0) out.push(p);
            } else {
                walkCollectGroupPaths(p, out);
            }
        }
    }
    function collectSelectedPathsFromSelection(comp) {
        var paths = [];
        var seen = {};
        function pushUnique(p) {
            var id = p.propertyPath ? p.propertyPath : (p.toString() + "_" + p.propertyIndex);
            if (seen[id]) return;
            seen[id] = true;
            paths.push(p);
        }
        try {
            var props = comp.selectedProperties || [];
            for (var i = 0; i < props.length; i++) {
                var pr = props[i];
                if (pr.propertyType === PropertyType.PROPERTY &&
                    pr.matchName && pr.matchName.indexOf("ADBE Vector Shape") === 0) {
                    pushUnique(pr);
                } else if (pr.matchName === "ADBE Vector Group") {
                    var tmp = [];
                    walkCollectGroupPaths(pr, tmp);
                    for (var j = 0; j < tmp.length; j++) pushUnique(tmp[j]);
                }
            }
        } catch (e) { }
        return paths;
    }
    function getSelectedShapeLayer(comp) {
        if (!comp) return null;
        var sel = comp.selectedLayers || [];
        for (var i = 0; i < sel.length; i++) {
            if (isShapeLayer(sel[i])) return sel[i];
        }
        return null;
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    return {
        getSelectedTextLayers: function () {
            // alert("JSX Call: getSelectedTextLayers");
            var comp = getActiveComp();
            if (!comp) return "[]";
            var sel = comp.selectedLayers;
            var res = [];
            for (var i = 0; i < sel.length; i++) {
                if (isTextLayer(sel[i])) {
                    res.push({
                        id: sel[i].id,
                        index: sel[i].index,
                        name: sel[i].name,
                        fontStyle: fontStyle(sel[i]),
                        fontName: fontName(sel[i])
                    });
                }
            }
            return JSON.stringify(res);
        },

        getShapeLayers: function () {
            var comp = getActiveComp();
            if (!comp) return "[]";
            var res = [];
            for (var i = 1; i <= comp.numLayers; i++) {
                if (isShapeLayer(comp.layer(i))) {
                    res.push({
                        id: comp.layer(i).id,
                        index: i,
                        name: comp.layer(i).name
                    });
                }
            }
            return JSON.stringify(res);
        },

        getGroups: function (shapeId) {
            var step = "start";
            try {
                var comp = getActiveComp();
                if (!comp) return "[]";

                step = "findLayer";
                var layer = findLayerById(comp, shapeId);
                if (!layer) return "[]";

                step = "getTopGroups";
                var groups = getTopVectorGroups(layer);

                step = "loopGroups";
                var res = [];
                for (var i = 0; i < groups.length; i++) {
                    var gp = groups[i];
                    if (!gp) continue;

                    step = "collectPaths for " + gp.name;
                    var paths = [];
                    walkCollectGroupPaths(gp, paths);

                    var maxVerts = 0, deltaMax = 0;

                    for (var p = 0; p < paths.length; p++) {
                        step = "inspectPath " + p;
                        var pp = paths[p];
                        if (!pp) continue;

                        var v1 = 0, v2 = 0;
                        if (pp.numKeys >= 1) {
                            step = "path key 1 access";
                            var kv1 = pp.keyValue(1);
                            if (kv1 && kv1.vertices) v1 = kv1.vertices.length;
                            if (!v1) {
                                try {
                                    var t1 = pp.keyTime(1);
                                    var pv1 = pp.valueAtTime(t1, false);
                                    if (pv1 && pv1.vertices) v1 = pv1.vertices.length;
                                } catch (e1) { }
                            }
                        } else {
                            step = "path value access";
                            var pv = pp.value;
                            if (pv && pv.vertices) v1 = pv.vertices.length;
                            if (!v1) {
                                try {
                                    var pvNow = pp.valueAtTime(comp.time, false);
                                    if (pvNow && pvNow.vertices) v1 = pvNow.vertices.length;
                                } catch (e2) { }
                            }
                        }
                        if (pp.numKeys >= 2) {
                            step = "path key 2 access";
                            var kv2 = pp.keyValue(2);
                            if (kv2 && kv2.vertices) v2 = kv2.vertices.length;
                            if (!v2) {
                                try {
                                    var t2 = pp.keyTime(2);
                                    var pv2 = pp.valueAtTime(t2, false);
                                    if (pv2 && pv2.vertices) v2 = pv2.vertices.length;
                                } catch (e3) { }
                            }
                            if (!v2) v2 = v1;
                        } else {
                            v2 = v1;
                        }
                        var localMax = Math.max(v1, v2);
                        var localDelta = Math.abs(v2 - v1);
                        if (localMax > maxVerts) maxVerts = localMax;
                        if (localDelta > deltaMax) deltaMax = localDelta;
                    }

                    res.push({
                        index: i + 1,
                        name: gp.name,
                        paths: paths.length,
                        maxVerts: maxVerts,
                        deltaMax: deltaMax
                    });
                }
                return JSON.stringify(res);
            } catch (e) {
                return JSON.stringify({ error: "[" + step + "] " + e.toString() });
            }
        },

        getGroupVectorData: function (jsonStr) {
            var step = "start";
            try {
                var args = (typeof jsonStr === "string") ? JSON.parse(jsonStr) : jsonStr;
                var comp = getActiveComp();
                if (!comp) return JSON.stringify({ error: "No comp" });

                step = "findLayer";
                var layer = findLayerById(comp, args.shapeId);
                if (!layer) return JSON.stringify({ error: "Shape layer not found" });

                step = "getTopGroups";
                var groups = getTopVectorGroups(layer);
                var gIdx = parseInt(args.groupIndex, 10) - 1;
                if (isNaN(gIdx) || gIdx < 0 || gIdx >= groups.length) {
                    return JSON.stringify({ error: "Group not found" });
                }
                var gp = groups[gIdx];

                step = "collectPaths";
                var paths = [];
                walkCollectGroupPaths(gp, paths);

                var outPaths1 = [];
                var outPaths2 = [];
                var outPaths3 = [];
                var outPaths4 = [];
                var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                var maxVerts = 0;
                var anyFound = false;

                function clampArray(arr, idx) {
                    return (arr && arr[idx]) ? arr[idx] : [0, 0];
                }
                function updateBounds(v) {
                    for (var i = 0; i < v.length; i++) {
                        var vx = v[i][0], vy = v[i][1];
                        if (vx < minX) minX = vx;
                        if (vy < minY) minY = vy;
                        if (vx > maxX) maxX = vx;
                        if (vy > maxY) maxY = vy;
                    }
                }
                function getShapeAtKey(prop, keyIndex) {
                    if (!prop || prop.numKeys < keyIndex) return null;
                    var shapeVal = null;
                    try { shapeVal = prop.keyValue(keyIndex); } catch (e1) { }
                    if (!shapeVal || !shapeVal.vertices || !shapeVal.vertices.length) {
                        try {
                            var t = prop.keyTime(keyIndex);
                            shapeVal = prop.valueAtTime(t, false);
                        } catch (e2) { }
                    }
                    return (shapeVal && shapeVal.vertices && shapeVal.vertices.length) ? shapeVal : null;
                }
                function getShapeFallback(prop) {
                    var shapeVal = null;
                    try { shapeVal = prop.valueAtTime(comp.time, false); } catch (e1) { }
                    if (!shapeVal || !shapeVal.vertices || !shapeVal.vertices.length) {
                        try { shapeVal = prop.value; } catch (e2) { }
                    }
                    return (shapeVal && shapeVal.vertices && shapeVal.vertices.length) ? shapeVal : null;
                }
                function pushShape(shapeVal, outArr, pathIndex) {
                    if (!shapeVal || !shapeVal.vertices || !shapeVal.vertices.length) return false;
                    var v = shapeVal.vertices;
                    var inT = shapeVal.inTangents || [];
                    var outT = shapeVal.outTangents || [];
                    var vOut = [], iOut = [], oOut = [];
                    for (var vi = 0; vi < v.length; vi++) {
                        var vx = v[vi][0], vy = v[vi][1];
                        vOut.push([vx, vy]);
                        var ii = clampArray(inT, vi);
                        var oo = clampArray(outT, vi);
                        iOut.push([ii[0], ii[1]]);
                        oOut.push([oo[0], oo[1]]);
                    }
                    updateBounds(vOut);
                    if (v.length > maxVerts) maxVerts = v.length;
                    outArr.push({
                        v: vOut,
                        i: iOut,
                        o: oOut,
                        closed: !!shapeVal.closed,
                        idx: pathIndex
                    });
                    return true;
                }

                for (var p = 0; p < paths.length; p++) {
                    var prop = paths[p];
                    if (!prop) continue;
                    var shapeVal1 = getShapeAtKey(prop, 1) || getShapeFallback(prop);
                    var shapeVal2 = getShapeAtKey(prop, 2) || shapeVal1;
                    var shapeVal3 = getShapeAtKey(prop, 3);
                    var shapeVal4 = getShapeAtKey(prop, 4);

                    var found = false;
                    if (pushShape(shapeVal1, outPaths1, p)) found = true;
                    if (pushShape(shapeVal2, outPaths2, p)) found = true;
                    if (pushShape(shapeVal3, outPaths3, p)) found = true;
                    if (pushShape(shapeVal4, outPaths4, p)) found = true;
                    if (found) anyFound = true;
                }

                if (!anyFound) {
                    return JSON.stringify({ error: "No vector paths found" });
                }
                if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 1; maxY = 1; }

                return JSON.stringify({
                    name: gp.name,
                    pathsK1: outPaths1,
                    pathsK2: outPaths2,
                    pathsK3: outPaths3,
                    pathsK4: outPaths4,
                    bounds: { minX: minX, minY: minY, maxX: maxX, maxY: maxY },
                    maxVerts: maxVerts
                });
            } catch (e) {
                return JSON.stringify({ error: "[" + step + "] " + e.toString() });
            }
        },

        applyFix: function (jsonStr) {
            var step = "start";
            try {
                var args = (typeof jsonStr === "string") ? JSON.parse(jsonStr) : jsonStr;
                var comp = getActiveComp();
                if (!comp) return "error: No Comp";

                var mode = (args.mode || "BOTTOM").toUpperCase();
                var customIndices = args.customIndices || null;

                app.beginUndoGroup("FONTAN First Vertex");
                var changed = 0;
                var targets = (args.groups && args.groups.length) ? args.groups : null;

                step = "findLayer";
                var layer = args.shapeId ? findLayerById(comp, args.shapeId) : null;
                if (!layer) layer = getSelectedShapeLayer(comp);

                if (!targets || targets.length === 0) {
                    if (layer) {
                        step = "getTopGroupsAll";
                        var allGroups = getTopVectorGroups(layer);
                        targets = [];
                        for (var tg = 0; tg < allGroups.length; tg++) targets.push(tg + 1);
                    } else {
                        step = "selectedPaths";
                        var selectedPaths = collectSelectedPathsFromSelection(comp);
                        if (!selectedPaths.length) {
                            return "error: Select groups in the list or select vector paths in the timeline";
                        }
                        if (mode === "CUSTOM") {
                            return "error: Custom mode requires a group selection";
                        }
                        for (var sp = 0; sp < selectedPaths.length; sp++) {
                            changed += setFirstVertexOnAllKeys(selectedPaths[sp], mode);
                        }
                        app.endUndoGroup();
                        return "ok: Changed " + changed + " paths";
                    }
                }

                if (!layer) return "error: Layer not found";

                step = "getTopGroups";
                var groups = getTopVectorGroups(layer);
                // Normalize to integers and drop invalid
                var cleanTargets = [];
                for (var ct = 0; ct < targets.length; ct++) {
                    var n = parseInt(targets[ct], 10);
                    if (!isNaN(n) && n > 0) cleanTargets.push(n);
                }
                targets = cleanTargets;
                if (targets.length === 0) return "error: No valid groups to fix";

                for (var i = 0; i < targets.length; i++) {
                    step = "processGroupIndex " + i;
                    var gIdx = targets[i] - 1; // UI uses 1-based index
                    if (gIdx >= 0 && gIdx < groups.length) {
                        var gp = groups[gIdx];
                        if (!gp) continue;

                        step = "collectPaths " + gp.name;
                        var gridPaths = [];
                        walkCollectGroupPaths(gp, gridPaths); // defined in helper scope

                        if (mode === "CUSTOM") {
                            if (!customIndices) {
                                app.endUndoGroup();
                                return "error: Custom indices missing";
                            }
                            for (var k = 0; k < gridPaths.length; k++) {
                                var cIdx = customIndices[k];
                                var idx = (cIdx === 0 || cIdx) ? parseInt(cIdx, 10) : NaN;
                                if (isNaN(idx)) continue;
                                step = "setFirstVertex custom path " + k;
                                changed += setFirstVertexOnAllKeysByIndex(gridPaths[k], idx);
                            }
                        } else {
                            for (var k = 0; k < gridPaths.length; k++) {
                                step = "setFirstVertex path " + k;
                                changed += setFirstVertexOnAllKeys(gridPaths[k], mode);
                            }
                        }
                    }
                }
                app.endUndoGroup();
                return "ok: Changed " + changed + " paths";
            } catch (e) {
                app.endUndoGroup();
                return "error: [" + step + "] " + e.toString();
            }
        },

        createAnimation: function (jsonStr) {
            var args = JSON.parse(jsonStr);
            var comp = getActiveComp();
            if (!comp) return "error: No active comp";
            app.beginUndoGroup("FONTAN Create");
            try {
                var ordered = [];
                var baseItem = null;
                for (var i = 0; i < args.layers.length; i++) {
                    var lData = args.layers[i];
                    var lay = findLayerById(comp, lData.id);
                    if (!lay) continue;
                    var item = { layer: lay, data: lData };
                    ordered.push(item);
                    if (lData.base) baseItem = item;
                }
                if (ordered.length === 0) throw "No valid layers found";
                if (!baseItem && ordered.length) baseItem = ordered[0];
                var finalOrdered = [baseItem];
                for (var j = 0; j < ordered.length; j++) {
                    if (ordered[j].data.id !== baseItem.data.id) finalOrdered.push(ordered[j]);
                }
                var shapes = [];
                for (var k = 0; k < finalOrdered.length; k++) {
                    var sh = textToShapes(finalOrdered[k].layer);
                    if (!sh) throw "Failed to convert " + finalOrdered[k].layer.name;
                    shapes.push(sh);
                }
                if (args.deleteOriginals) {
                    for (var m = 0; m < finalOrdered.length; m++) {
                        try { finalOrdered[m].layer.remove(); } catch (e) { }
                    }
                }
                var baseShape = shapes[0];
                var basePaths = allVectorPaths(baseShape);
                if (basePaths.length === 0) throw "No paths in base shape";
                var t0 = snapFrame(comp, comp.time);
                forceSingleKey(basePaths, t0);
                var refs = [];
                for (var bp = 0; bp < basePaths.length; bp++) refs.push(basePaths[bp].valueAtTime(t0, false));
                var fd = comp.frameDuration;
                var offsetEnabled = (args.offsetEnabled !== false);
                var dtFrames = args.offset;
                if (!offsetEnabled) {
                    var denom = Math.max(1, shapes.length - 1);
                    dtFrames = dtFrames / denom;
                }
                var dt = fd * dtFrames;
                for (var s = 1; s < shapes.length; s++) {
                    var Psrc = allVectorPaths(shapes[s]);
                    var currentDt = dt * s;
                    copyAllKeysAppendWithOffsetAligned(Psrc, basePaths, currentDt, t0, fd, refs, args.align);
                    refs = [];
                    for (var bp2 = 0; bp2 < basePaths.length; bp2++) refs.push(basePaths[bp2].valueAtTime(t0 + currentDt, false));
                }
                for (var s2 = 1; s2 < shapes.length; s2++) shapes[s2].remove();
                if (args.stagger > 0) {
                    var dtStagger = fd * args.stagger;
                    var topToBottom = (args.direction === 'top');
                    staggerTopGroups(baseShape, dtStagger, topToBottom);
                }

                if (args.loopAnimation) {
                    for (var lp = 0; lp < basePaths.length; lp++) {
                        try {
                            if (basePaths[lp].expressionEnabled) basePaths[lp].expression = "";
                        } catch (e) { }
                        mirrorLoopKeys(basePaths[lp]);
                    }
                }

                if (args.easeMode) {
                    applyEasingShapeLayer(baseShape, args.easeMode, 70, args.easeCustom);
                }

                // Centering (Global Option)
                if (args.centEnable) {
                    var mode = args.centMode;
                    var tr = baseShape.property("ADBE Transform Group");
                    if (tr) {
                        var ap = tr.property("ADBE Anchor Point");
                        // Anchor Point always centered to content
                        if (ap) ap.expression = "var r=sourceRectAtTime(time,false);[r.left+r.width/2,r.top+r.height/2]";

                        var pos = tr.property("ADBE Position");
                        if (pos) {
                            if (mode === "center") {
                                pos.expression = "var c=[thisComp.width/2,thisComp.height/2];if(hasParent){parent.fromComp(c)}else{c}";
                            } else if (mode === "left") {
                                // Align visual left edge to left margin (e.g. 50px or 0? let's use 0 + width/2 since anchor is center)
                                // Anchor is at Center of rect. So Pos X = r.width/2 puts left edge at 0.
                                pos.expression = "var r=sourceRectAtTime(time,false); var c=[r.width/2, thisComp.height/2]; if(hasParent){parent.fromComp(c)}else{c}";
                            } else if (mode === "right") {
                                // Pos X = CompWidth - width/2
                                pos.expression = "var r=sourceRectAtTime(time,false); var c=[thisComp.width - r.width/2, thisComp.height/2]; if(hasParent){parent.fromComp(c)}else{c}";
                            }
                        }
                    }
                }
                deselectAll(comp);
                baseShape.selected = true;
            } catch (e) {
                app.endUndoGroup();
                return "error: " + e.toString();
            }
            app.endUndoGroup();
            return "ok";
        }
    };
})();
