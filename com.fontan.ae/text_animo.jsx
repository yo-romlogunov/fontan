/* FONTAN AE — Text→Shapes multi merge with offsets, group stagger, Easy Ease, vertex-align
   #target aftereffects
*/
(function(){
  // ===== helpers =====
  function fail(m){ alert(m); }
  function isTextLayer(L){ try { return L instanceof TextLayer; } catch(e){ return false; } }
  function isShapeLayer(L){ try { return L instanceof ShapeLayer; } catch(e){ return false; } }

  function getActiveComp(){
    var c = app.project && app.project.activeItem;
    return (c && c instanceof CompItem) ? c : null;
  }

  function sel2Text() {
    var comp = getActiveComp();
    if (!comp) return {comp:null, layers:[]};
    var a = [];
    var L = comp.selectedLayers || [];
    for (var i=0;i<L.length;i++) if (isTextLayer(L[i])) a.push(L[i]);
    return {comp: comp, layers: a};
  }

  function fontStyle(layer){
    try{
      var td = layer.property("Source Text").value;
      if (td.fontStyle && typeof td.fontStyle === "string" && td.fontStyle.length) return td.fontStyle;
      var ps = (td.font||"").toLowerCase();
      var hasBold   = /bold|black|heavy|extrabold|semibold|demi/i.test(ps) || td.fauxBold===true;
      var hasItalic = /italic|oblique/i.test(ps) || td.fauxItalic===true;
      var weights = [
        {re:/thin|hairline/i, name:"Thin"},
        {re:/extralight|ultralight/i, name:"ExtraLight"},
        {re:/light/i, name:"Light"},
        {re:/regular|book|roman|normal/i, name:"Regular"},
        {re:/medium/i, name:"Medium"},
        {re:/semibold|demibold/i, name:"SemiBold"},
        {re:/bold/i, name:"Bold"},
        {re:/extrabold|ultrabold/i, name:"ExtraBold"},
        {re:/black|heavy/i, name:"Black"}
      ];
      var weight = "Regular";
      for (var i=0;i<weights.length;i++){ if (weights[i].re.test(ps)){ weight = weights[i].name; break; } }
      if (hasBold && weight==="Regular") weight = "Bold";
      return hasItalic ? (weight + " Italic") : weight;
    }catch(e){ return "Unknown"; }
  }

  function findCmdId(){
    var id = 0;
    try { id = app.findMenuCommandId("Create Shapes from Text")|0; } catch(e){}
    if (!id) try { id = app.findMenuCommandId("Создать фигуры из текста")|0; } catch(e){}
    if (!id) id = 3781;
    return id;
  }
  var CMD_SHAPES = findCmdId();

  function ensureActiveViewer(comp){
    try { comp.openInViewer(); app.activate(); } catch(e){}
  }
  function ensureSelectable(layer, comp){
    try { if (layer.locked) layer.locked = false; } catch(e){}
    try { if (layer.shy && comp && comp.hideShyLayers) comp.hideShyLayers = false; } catch(e){}
    try { if (layer.enabled === false) layer.enabled = true; } catch(e){}
  }
  function deselectAll(comp){
    for (var i=1;i<=comp.numLayers;i++) try{ comp.layer(i).selected = false; }catch(e){}
  }

  // convert one text to shapes
  function textToShapes(layer){
    var c = layer.containingComp;
    if (!CMD_SHAPES) throw Error("Menu command 'Create Shapes from Text' not found.");
    ensureActiveViewer(c);
    ensureSelectable(layer, c);
    deselectAll(c);
    layer.selected = true;
    app.executeCommand(CMD_SHAPES);
    var sel = c.selectedLayers;
    for (var i=0;i<sel.length;i++) if (sel[i] instanceof ShapeLayer) return sel[i];
    for (var j=1;j<=c.numLayers;j++){
      var L = c.layer(j);
      if (L.selected && (L instanceof ShapeLayer)) return L;
    }
    throw Error("Failed to create Shape from Text. Check the layer.");
  }

  // ---- Path utils ----
  function rotateArrays(verts, ins, outs, off){
    var n = verts.length, rV=[], rI=[], rO=[];
    for (var i=0;i<n;i++){
      var j = (i+off)%n;
      rV.push(verts[j]); rI.push(ins[j]); rO.push(outs[j]);
    }
    return {v:rV,i:rI,o:rO};
  }
  function reverseArrays(verts, ins, outs){
    var n = verts.length, rV=[], rI=[], rO=[];
    for (var i=0;i<n;i++){
      var j = n-1-i;
      rV.push(verts[j]);
      rI.push(outs[j]);
      rO.push(ins[j]);
    }
    return {v:rV,i:rI,o:rO};
  }
  function sumSqDist(a,b){
    var s=0;
    for (var i=0;i<a.length;i++){
      var dx=a[i][0]-b[i][0], dy=a[i][1]-b[i][1];
      s += dx*dx + dy*dy;
    }
    return s;
  }
  function maxDistSq(a,b){
    var m=0;
    for (var i=0;i<a.length;i++){
      var dx=a[i][0]-b[i][0], dy=a[i][1]-b[i][1];
      var d = dx*dx + dy*dy;
      if (d>m) m=d;
    }
    return m;
  }
  function alignToReference(shapeVal, refVal){
    var R = refVal, S = shapeVal;
    if (!R || !S) return S;
    var vR = R.vertices||[], vS = S.vertices||[];
    var n = vR.length;
    if (!R.closed || !S.closed) return S;
    if (n !== vS.length || n===0) return S;

    var iS = S.inTangents||[],  oS = S.outTangents||[];

    var best = {costMax: Infinity, costSum: Infinity, arr:null};

    for (var off=0; off<n; off++){
      var rot = rotateArrays(vS, iS, oS, off);
      var cMax = maxDistSq(rot.v, vR);
      var cSum = sumSqDist(rot.v, vR);
      if ( (cMax < best.costMax) || (cMax === best.costMax && cSum < best.costSum) ){
        best={costMax:cMax, costSum:cSum, arr:rot};
      }
    }
    var rev = reverseArrays(vS, iS, oS);
    for (var off2=0; off2<n; off2++){
      var rot2 = rotateArrays(rev.v, rev.i, rev.o, off2);
      var cMax2 = maxDistSq(rot2.v, vR);
      var cSum2 = sumSqDist(rot2.v, vR);
      if ( (cMax2 < best.costMax) || (cMax2 === best.costMax && cSum2 < best.costSum) ){
        best={costMax:cMax2, costSum:cSum2, arr:rot2};
      }
    }

    var out = new Shape();
    out.closed = true;
    out.vertices    = best.arr.v.slice();
    out.inTangents  = best.arr.i.slice();
    out.outTangents = best.arr.o.slice();
    return out;
  }

  // collect all Bezier Paths in shape
  function allVectorPaths(shapeLayer){
    var out = [];
    function walk(group){
      if (!group || !group.numProperties) return;
      for (var i=1;i<=group.numProperties;i++){
        var p = group.property(i);
        if (!p) continue;
        var mn = p.matchName || "";
        if (p.propertyType === PropertyType.PROPERTY){
          if (mn.indexOf("ADBE Vector Shape") === 0) out.push(p);
        } else {
          walk(p);
        }
      }
    }
    var root = shapeLayer.property("ADBE Root Vectors Group");
    if (!root) return out;
    walk(root);
    return out;
  }
  function walkCollectGroupPaths(group, out){
    if (!group || !group.numProperties) return;
    for (var i=1;i<=group.numProperties;i++){
      var p = group.property(i);
      if (!p) continue;
      if (p.propertyType === PropertyType.PROPERTY){
        if (p.matchName.indexOf("ADBE Vector Shape")===0) out.push(p);
      } else {
        walkCollectGroupPaths(p, out);
      }
    }
  }
  function collectSelectedPathsFromSelection(comp){
    var paths = [];
    var seen = {};
    function pushUnique(p){
      var id = p.propertyPath ? p.propertyPath : (p.toString()+"_"+p.propertyIndex);
      if (seen[id]) return; seen[id]=true; paths.push(p);
    }
    try{
      var props = comp.selectedProperties || [];
      for (var i=0;i<props.length;i++){
        var pr = props[i];
        if (pr.propertyType === PropertyType.PROPERTY &&
            pr.matchName && pr.matchName.indexOf("ADBE Vector Shape")===0){
          pushUnique(pr);
        } else if (pr.matchName === "ADBE Vector Group"){
          var tmp=[]; walkCollectGroupPaths(pr, tmp);
          for (var j=0;j<tmp.length;j++) pushUnique(tmp[j]);
        }
      }
    }catch(e){}
    return paths;
  }

  function snapFrame(comp, t){ var fd=comp.frameDuration; return Math.round(t/fd)*fd; }
  function removeAllKeys(prop){
    try{ for (var k = prop.numKeys; k >= 1; k--) prop.removeKey(k); }catch(e){}
  }
  function forceSingleKey(paths, t){
    for (var i=0;i<paths.length;i++){
      try {
        var v = paths[i].value;
        removeAllKeys(paths[i]);
        paths[i].setValueAtTime(t, v);
      } catch(e){}
    }
  }

  // append keys with offset, dedup, optional align
  function copyAllKeysAppendWithOffsetAligned(pathsA, pathsB, dt, fallbackTime, fd, refShapes, doAlign, mismatchStats){
    var n = Math.min(pathsA.length, pathsB.length);
    var EPS = Math.max(1e-7, fd*1e-4);
    for (var i=0;i<n;i++){
      var A = pathsA[i], B = pathsB[i];
      var refVal = refShapes && refShapes[i] ? refShapes[i] : null;
      try {
        // existing
        var bt = [], bv = [];
        for (var b=1;b<=B.numKeys; b++){ bt.push(B.keyTime(b)); bv.push(B.keyValue(b)); }

        // incoming
        var at = [], av = [];
        var kc = A.numKeys|0;
        if (kc === 0){
          var sv = A.value;
          if (doAlign && refVal && sv && sv.closed && refVal.closed && (sv.vertices||[]).length === (refVal.vertices||[]).length){
            sv = alignToReference(sv, refVal);
          } else if (doAlign && refVal && sv && sv.closed && (sv.vertices||[]).length !== (refVal.vertices||[]).length){
            mismatchStats.count++;
          }
          at.push(fallbackTime + dt);
          av.push(sv);
        } else {
          for (var k=1;k<=kc;k++){
            var vv = A.keyValue(k);
            if (doAlign && refVal && vv && vv.closed && refVal.closed && (vv.vertices||[]).length === (refVal.vertices||[]).length){
              vv = alignToReference(vv, refVal);
            } else if (doAlign && refVal && vv && sv.closed && (vv.vertices||[]).length !== (refVal.vertices||[]).length){
              mismatchStats.count++;
            }
            at.push(A.keyTime(k)+dt);
            av.push(vv);
          }
        }

        // merge + sort + dedup
        var T = bt.concat(at);
        var V = bv.concat(av);
        var idx = []; for (var s=0;s<T.length;s++) idx.push(s);
        idx.sort(function(a,b){ return T[a]-T[b]; });

        var T2 = [], V2 = [];
        for (var s=0;s<idx.length;s++){
          var tt = T[idx[s]], vv2 = V[idx[s]];
          if (T2.length && Math.abs(tt - T2[T2.length-1]) < EPS){
            T2[T2.length-1] = tt;
            V2[T2.length-1] = vv2; // new wins
          } else {
            T2.push(tt); V2.push(vv2);
          }
        }

        removeAllKeys(B);
        B.setValuesAtTimes(T2, V2);
        for (var k2=1;k2<=T2.length;k2++){
          try{ B.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); }catch(e){}
        }
      } catch(e){}
    }
  }

  // Easy Ease
  function easyEaseGroup(group, influence){
    if (!group || !group.numProperties) return 0;
    var total = 0;
    for (var i=1;i<=group.numProperties;i++){
      var p = group.property(i);
      if (!p) continue;
      if (p.propertyType === PropertyType.PROPERTY){
        var n = p.numKeys|0;
        if (n>0){
          var ein = [new KeyframeEase(0, influence)];
          var eout = [new KeyframeEase(0, influence)];
          for (var k=1;k<=n;k++){
            try{
              p.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
              p.setTemporalEaseAtKey(k, ein, eout);
            }catch(e){}
          }
        }
      } else {
        total += easyEaseGroup(p, influence);
      }
    }
    return total;
  }
  function easyEaseShapeLayer(shapeLayer, influence){
    try{
      var root = shapeLayer.property("ADBE Root Vectors Group");
      if (root) easyEaseGroup(root, influence);
      var tr = shapeLayer.property("ADBE Transform Group");
      if (tr) easyEaseGroup(tr, influence);
    }catch(e){}
  }

  // recolor keys by top groups
  function recolorKeysByTopShapeGroups(shapeLayer) {
    if (!shapeLayer || !(shapeLayer instanceof ShapeLayer)) return 0;
    var PALETTE = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16];

    function hashStr(s) { s = String(s||""); var h = 0; for (var i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0;} return Math.abs(h); }
    function paintPropKeys(prop, labelIdx) {
      if (!prop || prop.propertyType !== PropertyType.PROPERTY) return 0;
      var n = prop.numKeys|0; if (n < 1) return 0;
      var changed = 0;
      for (var k = 1; k <= n; k++) { try { prop.setLabelAtKey(k, labelIdx); changed++; } catch(e){} }
      return changed;
    }
    function walkAndPaint(groupProp, labelIdx) {
      var total = 0;
      if (!groupProp || !groupProp.numProperties) return 0;
      for (var i = 1; i <= groupProp.numProperties; i++) {
        var p = groupProp.property(i);
        if (!p) continue;
        if (p.propertyType === PropertyType.PROPERTY) total += paintPropKeys(p, labelIdx);
        else total += walkAndPaint(p, labelIdx);
      }
      return total;
    }

    var root = shapeLayer.property("ADBE Root Vectors Group");
    if (!root) return 0;

    var totalChanged = 0;
    for (var gi = 1; gi <= root.numProperties; gi++) {
      var grp = root.property(gi);
      if (!grp || grp.matchName !== "ADBE Vector Group") continue;
      var gName = grp.name || ("Group " + gi);
      var label = PALETTE[ hashStr(gName) % PALETTE.length ];
      totalChanged += walkAndPaint(grp, label);
    }
    return totalChanged;
  }

  // top groups helpers
  function getTopVectorGroups(shapeLayer){
    var res = [];
    var root = shapeLayer.property("ADBE Root Vectors Group");
    if (!root) return res;
    for (var i=1;i<=root.numProperties;i++){
      var gp = root.property(i);
      if (gp && gp.matchName === "ADBE Vector Group") res.push(gp);
    }
    return res;
  }
  function shiftAllKeysUnder(group, dt){
    if (!group || !group.numProperties || dt===0) return 0;
    var moved = 0;
    for (var i=1;i<=group.numProperties;i++){
      var p = group.property(i);
      if (!p) continue;

      if (p.propertyType === PropertyType.PROPERTY){
        var n = p.numKeys|0;
        if (n>0){
          var times = [], vals = [], inInterp=[], outInterp=[], inEase=[], outEase=[];
          for (var k=1;k<=n;k++){
            times.push(p.keyTime(k) + dt);
            vals.push(p.keyValue(k));
            inInterp.push(p.keyInInterpolationType(k));
            outInterp.push(p.keyOutInterpolationType(k));
            inEase.push(p.keyInTemporalEase(k));
            outEase.push(p.keyOutTemporalEase(k));
          }
          removeAllKeys(p);
          p.setValuesAtTimes(times, vals);
          for (var k2=1;k2<=times.length;k2++){
            try{
              p.setInterpolationTypeAtKey(k2, inInterp[k2-1], outInterp[k2-1]);
              p.setTemporalEaseAtKey(k2, inEase[k2-1], outEase[k2-1]);
            }catch(e){}
          }
          moved += times.length;
        }
      } else {
        moved += shiftAllKeysUnder(p, dt);
      }
    }
    return moved;
  }
  function staggerTopGroups(shapeLayer, dtPerGroup, topToBottom){
    if (!dtPerGroup || dtPerGroup===0) return 0;
    var groups = getTopVectorGroups(shapeLayer);
    var moved = 0;
    var n = groups.length;
    for (var i=0;i<n;i++){
      var rank = topToBottom ? i : (n-1-i);
      var dt = dtPerGroup * rank;
      moved += shiftAllKeysUnder(groups[i], dt);
    }
    return moved;
  }

  // ===== First-Vertex tools =====
  function indexByBottom(verts){
    var idx=0, bestY=-Infinity, bestX= Infinity;
    for (var i=0;i<verts.length;i++){
      var p=verts[i];
      if (p[1]>bestY || (p[1]===bestY && p[0]<bestX)){ bestY=p[1]; bestX=p[0]; idx=i; }
    }
    return idx;
  }
  function indexByTop(verts){
    var idx=0, bestY= Infinity, bestX= Infinity;
    for (var i=0;i<verts.length;i++){
      var p=verts[i];
      if (p[1]<bestY || (p[1]===bestY && p[0]<bestX)){ bestY=p[1]; bestX=p[0]; idx=i; }
    }
    return idx;
  }
  function indexByLeft(verts){
    var idx=0, bestX= Infinity, bestY= Infinity;
    for (var i=0;i<verts.length;i++){
      var p=verts[i];
      if (p[0]<bestX || (p[0]===bestX && p[1]<bestY)){ bestX=p[0]; bestY=p[1]; idx=i; }
    }
    return idx;
  }
  function indexByRight(verts){
    var idx=0, bestX=-Infinity, bestY= Infinity;
    for (var i=0;i<verts.length;i++){
      var p=verts[i];
      if (p[0]>bestX || (p[0]===bestX && p[1]<bestY)){ bestX=p[0]; bestY=p[1]; idx=i; }
    }
    return idx;
  }
  function nearestIndexToPoint(verts, refPt){
    var idx=0, best= Infinity;
    for (var i=0;i<verts.length;i++){
      var dx=verts[i][0]-refPt[0], dy=verts[i][1]-refPt[1];
      var d=dx*dx+dy*dy;
      if (d<best){ best=d; idx=i; }
    }
    return idx;
  }
  function rotateShapeToIndex(S, idx){
    if (!S || !S.closed) return S;
    var v=S.vertices||[], i=S.inTangents||[], o=S.outTangents||[];
    if (!v || v.length<1) return S;
    var rot = rotateArrays(v,i,o, idx);
    var out = new Shape();
    out.closed = true;
    out.vertices = rot.v.slice();
    out.inTangents = rot.i.slice();
    out.outTangents = rot.o.slice();
    return out;
  }
  function setFirstVertexOnAllKeys(pathProp, mode){
    if (!pathProp || pathProp.matchName.indexOf("ADBE Vector Shape")!==0) return 0;
    var changed = 0;
    try{
      var n = pathProp.numKeys|0;

      var pickIndexFn = null;
      var refPoint = null;

      if (mode==="TOP") pickIndexFn = function(v){ return indexByTop(v); };
      else if (mode==="BOTTOM") pickIndexFn = function(v){ return indexByBottom(v); };
      else if (mode==="LEFT") pickIndexFn = function(v){ return indexByLeft(v); };
      else if (mode==="RIGHT") pickIndexFn = function(v){ return indexByRight(v); };
      else if (mode==="REF_FIRSTKEY"){
        if (n>0){
          var v0 = pathProp.keyValue(1);
          if (v0 && v0.closed && (v0.vertices||[]).length>0){
            refPoint = [v0.vertices[0][0], v0.vertices[0][1]];
            pickIndexFn = function(v){ return nearestIndexToPoint(v, refPoint); };
          }
        } else {
          var vv = pathProp.value;
          if (vv && vv.closed && (vv.vertices||[]).length>0){
            refPoint = [vv.vertices[0][0], vv.vertices[0][1]];
            pickIndexFn = function(v){ return nearestIndexToPoint(v, refPoint); };
          }
        }
      }

      if (!pickIndexFn) return 0;

      if (n===0){
        var val = pathProp.value;
        if (!val || !val.closed) return 0;
        var idx = pickIndexFn(val.vertices||[]);
        var rot = rotateShapeToIndex(val, idx);
        pathProp.setValue(rot);
        return 1;
      }

      var times=[], vals=[], inInterp=[], outInterp=[], inEase=[], outEase=[];
      for (var k=1;k<=n;k++){
        var t = pathProp.keyTime(k);
        var v = pathProp.keyValue(k);
        if (v && v.closed){
          var idx = pickIndexFn(v.vertices||[]);
          v = rotateShapeToIndex(v, idx);
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
      for (var k2=1;k2<=times.length;k2++){
        try{
          pathProp.setInterpolationTypeAtKey(k2, inInterp[k2-1], outInterp[k2-1]);
          pathProp.setTemporalEaseAtKey(k2, inEase[k2-1], outEase[k2-1]);
        }catch(e){}
      }
    }catch(e){}
    return changed;
  }

  // ===== UI =====
  var S = sel2Text();
  if (!S.comp) { fail("Open a composition first."); return; }

  var w = new Window("palette", "FONTAN AE", undefined, {resizeable:true});
  w.orientation = "column";
  w.alignChildren = ["fill", "top"];
  w.margins = 12; w.spacing = 10;

  // Tabs
  var tabs = w.add("tabbedpanel");
  tabs.alignChildren = ["fill","top"];
  tabs.margins = 0; tabs.spacing = 0;
  var tabCreate = tabs.add("tab", undefined, "Create");
  var tabFix    = tabs.add("tab", undefined, "Fix");

  // ===== CREATE TAB =====
  tabCreate.orientation = "column";
  tabCreate.alignChildren = ["fill","top"];
  tabCreate.margins = 0; tabCreate.spacing = 8;

  // +++ COLUMN ADDED: "Centering"
  var list = tabCreate.add("listbox", undefined, [], {
    multiselect: false,
    showHeaders: true,
    numberOfColumns: 5,
    columnTitles: ["#", "Name", "Font", "Base", "Centering"],
    columnWidths: [30, 200, 150, 50, 120]
  });
  list.preferredSize.height = 220;

  var rowCtl = tabCreate.add("group");
  rowCtl.orientation = "row"; rowCtl.spacing = 8;
  var btnAddSel   = rowCtl.add("button", undefined, "Add Selected");
  var btnRemove   = rowCtl.add("button", undefined, "Remove");
  var btnUp       = rowCtl.add("button", undefined, "Up");
  var btnDown     = rowCtl.add("button", undefined, "Down");
  var btnSetBase  = rowCtl.add("button", undefined, "Set Base");

  var opt = tabCreate.add("group");
  opt.orientation = "row"; opt.spacing = 12;
  opt.margins = 10;
  var cbAlign = opt.add("checkbox", undefined, "Align Paths");
  cbAlign.value = true;

  // Animation panel
  var pnlAnim = tabCreate.add("panel", undefined, "Animation");
  pnlAnim.alignChildren = ["left","center"];
  pnlAnim.margins = 10; pnlAnim.spacing = 8;

  var ctl = pnlAnim.add("group");
  ctl.orientation = "row"; ctl.spacing = 10; ctl.alignChildren = ["left","center"];
  ctl.add("statictext", undefined, "Frames Offset");
  var edOffset = ctl.add("edittext", undefined, "30"); edOffset.characters = 6;

  var gst = pnlAnim.add("group");
  gst.orientation = "row"; gst.spacing = 10; gst.alignChildren = ["left","center"];
  gst.add("statictext", undefined, "Group Stagger (frames)");
  var edGStagger = gst.add("edittext", undefined, "3"); edGStagger.characters = 4;
  var dirDrop = gst.add("dropdownlist", undefined, ["Top to Bottom", "Bottom to Top"]);
  dirDrop.selection = 0;

  // --- Centering controls (apply to selected row) ---
  var pnlCenter = tabCreate.add("panel", undefined, "Centering");
  pnlCenter.alignChildren = ["left","center"];
  pnlCenter.margins = 10; pnlCenter.spacing = 8;

  var ctr = pnlCenter.add("group");
  ctr.orientation = "row"; ctr.spacing = 10; ctr.alignChildren = ["left","center"];
  var cbCenterEnable = ctr.add("checkbox", undefined, "Enable");
  var ddCenterMode = ctr.add("dropdownlist", undefined, ["Center","Left","Right"]);
  ddCenterMode.selection = 0;

  var actions = tabCreate.add("group");
  actions.orientation = "row"; actions.spacing = 10;
  actions.margins = 4;
  var btnApply = actions.add("button", undefined, "Apply");
  var btnCancel1 = actions.add("button", undefined, "Cancel"); btnCancel1.onClick = function(){ w.close(); };

  // ===== FIX TAB =====
  tabFix.orientation = "column";
  tabFix.alignChildren = ["fill","top"];
  tabFix.margins = 0; tabFix.spacing = 8;

  // shape picker + refresh
  var fixTop = tabFix.add("group");
  fixTop.orientation = "row"; fixTop.spacing = 8; fixTop.alignChildren = ["left","center"];
  fixTop.add("statictext", undefined, "Shape Layer");
  var ddShape = fixTop.add("dropdownlist", undefined, []);
  ddShape.minimumSize.width = 240;
  var btnRefresh = fixTop.add("button", undefined, "Refresh");

  // groups list with columns
  var grpLabel = tabFix.add("statictext", undefined, "Top Groups");
  var listGroups = tabFix.add("listbox", undefined, [], {
    multiselect: true,
    showHeaders: true,
    numberOfColumns: 5,
    columnTitles: ["#", "Symbol", "Paths", "Max verts", "Difference (Needs correction)"],
    columnWidths: [34, 100, 60, 80, 180]
  });
  listGroups.preferredSize.height = 320;

  // First Vertex controls
  var fvFix = tabFix.add("group");
  fvFix.orientation = "row"; fvFix.spacing = 8; fvFix.alignChildren = ["left","center"];
  fvFix.add("statictext", undefined, "First Vertex");
  fvFix.margins = 10;
  var ddFV = fvFix.add("dropdownlist", undefined, ["Bottom","Top","Left","Right","Lock to first key"]);
  ddFV.selection = 0;
  var btnApplySel = fvFix.add("button", undefined, "Apply Selection");

  // ===== DATA FOR CREATE =====
  // items[i] = {layer: TextLayer, base: bool, centEnable: bool, centMode: 0|1|2}
  var items = [];

  function centModeName(idx){
    return (idx===1)?"Left":(idx===2)?"Right":"Center";
  }
  function centStatus(it){
    return it.centEnable ? ("On: "+centModeName(it.centMode||0)) : "Off";
  }

  function clearList(){ while (list.items.length) list.remove(list.items[0]); }
  function rebuildList(){
    clearList();
    for (var i=0;i<items.length;i++){
      var it = items[i];
      var row = list.add("item", String(i+1));
      row.subItems[0].text = it.layer.name || "";
      row.subItems[1].text = fontStyle(it.layer) || "";
      row.subItems[2].text = it.base ? "★" : "";
      row.subItems[3].text = centStatus(it);
      row.layerRef = it.layer;
    }
  }
  function anyBase(){ for (var i=0;i<items.length;i++) if (items[i].base) return true; return false; }
  function setBaseIndex(idx){
    for (var i=0;i<items.length;i++) items[i].base = (i===idx);
    rebuildList();
    list.selection = (idx>=0 && idx<list.items.length) ? list.items[idx] : null;
    syncCenterControls();
  }
  function firstBaseIndex(){ for (var i=0;i<items.length;i++) if (items[i].base) return i; return -1; }

  function addUniqueTextLayersFromSelection(){
    var comp = getActiveComp(); if (!comp) return 0;
    var L = comp.selectedLayers || [];
    var already = {}; for (var i=0;i<items.length;i++) already[items[i].layer.id] = true;
    var added = 0;
    for (var j=0;j<L.length;j++){
      var lyr = L[j];
      if (!isTextLayer(lyr)) continue;
      if (already[lyr.id]) continue;
      items.push({layer:lyr, base:false, centEnable:false, centMode:0});
      added++;
    }
    if (items.length && !anyBase()) items[0].base = true;
    rebuildList();
    return added;
  }

  if (S.layers.length){
    for (var i=0;i<S.layers.length;i++) items.push({layer:S.layers[i], base:false, centEnable:false, centMode:0});
    if (items.length) items[0].base = true;
    rebuildList();
    list.selection = list.items.length ? list.items[0] : null;
  }

  function syncCenterControls(){
    var idx = list.selection ? list.selection.index : -1;
    if (idx<0){ cbCenterEnable.value=false; ddCenterMode.selection=0; return; }
    var it = items[idx];
    cbCenterEnable.value = !!it.centEnable;
    ddCenterMode.selection = (it.centMode||0);
  }
  function applyCenterControlsToItem(){
    var idx = list.selection ? list.selection.index : -1;
    if (idx<0) return;
    var it = items[idx];
    it.centEnable = !!cbCenterEnable.value;
    it.centMode = ddCenterMode.selection ? ddCenterMode.selection.index : 0;
    // update cell text
    if (list.items[idx]) list.items[idx].subItems[3].text = centStatus(it);
  }

  // UI — Create tab handlers
  btnAddSel.onClick = function(){ addUniqueTextLayersFromSelection(); };
  btnRemove.onClick = function(){
    var idx = list.selection ? list.selection.index : -1;
    if (idx<0) return;
    items.splice(idx,1);
    if (items.length && !anyBase()) items[0].base = true;
    rebuildList();
    if (items.length) list.selection = list.items[Math.min(idx, items.length-1)];
    syncCenterControls();
  };
  btnUp.onClick = function(){
    var idx = list.selection ? list.selection.index : -1;
    if (idx<=0) return;
    var t = items[idx-1]; items[idx-1] = items[idx]; items[idx] = t;
    rebuildList();
    list.selection = list.items[idx-1];
    syncCenterControls();
  };
  btnDown.onClick = function(){
    var idx = list.selection ? list.selection.index : -1;
    if (idx<0 || idx>=items.length-1) return;
    var t = items[idx+1]; items[idx+1] = items[idx]; items[idx] = t;
    rebuildList();
    list.selection = list.items[idx+1];
    syncCenterControls();
  };
  btnSetBase.onClick = function(){
    var idx = list.selection ? list.selection.index : -1;
    if (idx<0) return;
    setBaseIndex(idx);
  };
  list.onChange = function(){ syncCenterControls(); };
  list.onDoubleClick = function(){
    var idx = list.selection ? list.selection.index : -1;
    if (idx<0) return;
    setBaseIndex(idx);
  };
  cbCenterEnable.onClick = function(){ applyCenterControlsToItem(); };
  ddCenterMode.onChange = function(){ applyCenterControlsToItem(); };

  // ===== APPLY (CREATE TAB) =====
  function anchorExprCenter(){
    return (
      "// Center anchor by layer contents\n" +
      "var r = sourceRectAtTime(time, false);\n" +
      "var c = [r.left + r.width/2, r.top + r.height/2];\n" +
      "value.length==3 ? [c[0], c[1], value[2]] : c;"
    );
  }
  function positionExprCenter(){
    return (
      "// Center in comp regardless of parent\n" +
      "var compC = [thisComp.width/2, thisComp.height/2];\n" +
      "if (thisLayer.hasParent){\n" +
      "  if (parent.threeDLayer){\n" +
      "    var t = [compC[0], compC[1], value.length==3 ? value[2] : 0];\n" +
      "    parent.fromComp(t);\n" +
      "  } else {\n" +
      "    parent.fromComp(compC);\n" +
      "  }\n" +
      "} else {\n" +
      "  value.length==3 ? [compC[0], compC[1], value[2]] : compC;\n" +
      "}"
    );
  }
  function positionExprLeft(){
    return (
      "// Align to left edge (anchor centered by contents)\n" +
      "var r = thisLayer.sourceRectAtTime(time, false);\n" +
      "var y = thisComp.height/2;\n" +
      "var target = [r.width/2, y];\n" +
      "if (thisLayer.hasParent){\n" +
      "  if (parent.threeDLayer){\n" +
      "    var t = [target[0], target[1], value.length==3 ? value[2] : 0];\n" +
      "    parent.fromComp(t);\n" +
      "  } else {\n" +
      "    parent.fromComp(target);\n" +
      "  }\n" +
      "} else {\n" +
      "  value.length==3 ? [target[0], target[1], value[2]] : target;\n" +
      "}"
    );
  }
  function positionExprRight(){
    return (
      "// Align to right edge (anchor centered by contents)\n" +
      "var r = thisLayer.sourceRectAtTime(time, false);\n" +
      "var x = thisComp.width - r.width/2;\n" +
      "var y = thisComp.height/2;\n" +
      "var target = [x, y];\n" +
      "if (thisLayer.hasParent){\n" +
      "  if (parent.threeDLayer){\n" +
      "    var t = [target[0], target[1], value.length==3 ? value[2] : 0];\n" +
      "    parent.fromComp(t);\n" +
      "  } else {\n" +
      "    parent.fromComp(target);\n" +
      "  }\n" +
      "} else {\n" +
      "  value.length==3 ? [target[0], target[1], value[2]] : target;\n" +
      "}"
    );
  }

  btnApply.onClick = function(){
    var comp = getActiveComp();
    if (!comp){ fail("No active composition."); return; }
    if (!items.length){ fail("No layers in the list."); return; }
    for (var i=0;i<items.length;i++){
      if (!isTextLayer(items[i].layer)){ fail("Non-Text layer found in the list."); return; }
      if (items[i].layer.containingComp !== comp){ fail("All layers must be in the active composition."); return; }
    }

    var frames = parseInt(edOffset.text, 10); if (isNaN(frames)) frames = 30;
    var fd = comp.frameDuration; var dt = fd * frames;

    var gFrames = parseInt(edGStagger.text, 10); if (isNaN(gFrames)) gFrames = 0;
    var gDt = fd * gFrames;
    var dirTopToBottom = (dirDrop.selection ? dirDrop.selection.index === 0 : true);
    var doAlign = !!cbAlign.value;

    var baseIdx = firstBaseIndex(); if (baseIdx < 0) baseIdx = 0;

    var ordered = []; ordered.push(items[baseIdx]); for (var i=0;i<items.length;i++) if (i!==baseIdx) ordered.push(items[i]);

    app.beginUndoGroup("FONTAN AE — merge + align + stagger + ease + centering");
    var mismatchStats = {count:0};
    try {
      ensureActiveViewer(comp);

      // Convert to shapes
      var shapes = [];
      for (var i=0;i<ordered.length;i++){
        var sh = textToShapes(ordered[i].layer);
        if (!sh) throw Error("Shape not created: " + (ordered[i].layer.name||""));
        shapes.push(sh);
      }

      // Remove source text layers
      for (var i=0;i<items.length;i++){ try { items[i].layer.remove(); } catch(e){} }

      // Collect paths for all shapes
      var shapesPaths = [];
      for (var si=0; si<shapes.length; si++){ shapesPaths.push(allVectorPaths(shapes[si])); }

      var baseShape = shapes[0];
      var Pbase = shapesPaths[0];
      if (!Pbase.length) throw Error("No vector Paths in the base Shape. Check the structure.");

      var t0 = snapFrame(comp, comp.time);
      forceSingleKey(Pbase, t0);

      // reference shapes at t0
      var currentRefShapes = [];
      for (var pi2=0; pi2<Pbase.length; pi2++){
        try { currentRefShapes.push(Pbase[pi2].valueAtTime(t0, false)); } catch(e){ currentRefShapes.push(null); }
      }

      // CHAIN ALIGNMENT
      for (var si=1; si<shapes.length; si++){
        var Psrc = shapesPaths[si];
        var ofs = dt * si;
        copyAllKeysAppendWithOffsetAligned(Psrc, Pbase, ofs, t0, fd, currentRefShapes, doAlign, mismatchStats);

        var tInsert = t0 + ofs;
        currentRefShapes = [];
        for (var pi3=0; pi3<Pbase.length; pi3++){
          try { currentRefShapes.push(Pbase[pi3].valueAtTime(tInsert, false)); } catch(e){ currentRefShapes.push(null); }
        }
      }

      // Clean up extra shape layers
      for (var si2=1; si2<shapes.length; si2++){ try { shapes[si2].remove(); } catch(e){} }

      // Optional stagger by top groups
      if (gFrames > 0){ try { staggerTopGroups(baseShape, gDt, dirTopToBottom); } catch(e){} }

      try { easyEaseShapeLayer(baseShape, 33.3333333333); } catch(e){}
      try { recolorKeysByTopShapeGroups(baseShape); } catch(e){}

      // ===== Apply Centering (to final/base shape) if enabled on base item =====
      var baseItem = ordered[0]; // corresponds to baseShape
      if (baseItem && baseItem.centEnable){
        var tr = baseShape.property("ADBE Transform Group");
        if (tr){
          try {
            // Anchor Point expression (center by content)
            var ap = tr.property("ADBE Anchor Point");
            if (ap) ap.expression = anchorExprCenter();
          } catch(e){}
          try {
            // Position expression (mode-dependent)
            var pos = tr.property("ADBE Position");
            if (pos){
              var m = baseItem.centMode||0;
              if (m===0) pos.expression = positionExprCenter();
              else if (m===1) pos.expression = positionExprLeft();
              else pos.expression = positionExprRight();
            }
          } catch(e){}
        }
      }

      deselectAll(comp);
      baseShape.selected = true;

      if (mismatchStats.count>0){
        alert("Done. Note: "+mismatchStats.count+" path keys could not be aligned due to mismatched topology.");
      } else {
        alert("Done");
      }
    } catch(e){
      fail(e && e.message ? e.message : e);
    } finally {
      app.endUndoGroup();
    }
  };

  // ===== FIX TAB LOGIC =====
  function rebuildShapeDropdown(){
    ddShape.removeAll();
    var comp = getActiveComp(); if (!comp) return;
    for (var i=1;i<=comp.numLayers;i++){
      var L = comp.layer(i);
      if (isShapeLayer(L)){
        var it = ddShape.add("item", L.name);
        it.layerRef = L;
      }
    }
    if (ddShape.items.length) ddShape.selection = 0;
  }

  function groupVertexStats(group){
    // returns {paths, maxVerts, deltaMax}
    var paths = [];
    walkCollectGroupPaths(group, paths);
    var maxVerts = 0;
    var deltaMax = 0;
    for (var i=0;i<paths.length;i++){
      var p = paths[i];
      var v1Count = 0, v2Count = 0;

      if (p.numKeys >= 1){
        var v1 = p.keyValue(1);
        v1Count = (v1 && v1.vertices) ? v1.vertices.length : 0;
      } else {
        var v = p.value; v1Count = (v && v.vertices) ? v.vertices.length : 0;
      }

      if (p.numKeys >= 2){
        var v2 = p.keyValue(2);
        v2Count = (v2 && v2.vertices) ? v2.vertices.length : v1Count;
      } else {
        v2Count = v1Count;
      }

      var localMax = Math.max(v1Count, v2Count);
      var localDelta = Math.abs(v2Count - v1Count);
      if (localMax > maxVerts) maxVerts = localMax;
      if (localDelta > deltaMax) deltaMax = localDelta;
    }
    return {paths:paths.length, maxVerts:maxVerts, deltaMax:deltaMax};
  }

  function fillGroupsListFromShape(shapeLayer){
    listGroups.removeAll();
    if (!shapeLayer) return;
    var groups = getTopVectorGroups(shapeLayer);
    for (var i=0;i<groups.length;i++){
      var gp = groups[i];
      var st = groupVertexStats(gp);
      var row = listGroups.add("item", String(i+1));
      row.subItems[0].text = gp.name || ("Group " + (i+1));
      row.subItems[1].text = String(st.paths);
      row.subItems[2].text = String(st.maxVerts);
      row.subItems[3].text = String(st.deltaMax);
      row.groupRef = gp;
      row.helpTip = "Paths " + st.paths + "  Max verts K1 K2 " + st.maxVerts + "  Δ " + st.deltaMax;
    }
  }

  function currentFixMode(){
    var idx = ddFV.selection ? ddFV.selection.index : 0;
    return ["BOTTOM","TOP","LEFT","RIGHT","REF_FIRSTKEY"][idx] || "BOTTOM";
  }

  function applyFirstVertexToGroups(groups){
    if (!groups || !groups.length) return 0;
    var mode = currentFixMode();
    var changed = 0;
    for (var i=0;i<groups.length;i++){
      var paths = []; walkCollectGroupPaths(groups[i], paths);
      for (var p=0;p<paths.length;p++){
        changed += setFirstVertexOnAllKeys(paths[p], mode);
      }
    }
    return changed;
  }

  btnRefresh.onClick = function(){
    rebuildShapeDropdown();
    var sel = ddShape.selection && ddShape.selection.layerRef ? ddShape.selection.layerRef : null;
    fillGroupsListFromShape(sel);
  };
  ddShape.onChange = function(){
    var sel = ddShape.selection && ddShape.selection.layerRef ? ddShape.selection.layerRef : null;
    fillGroupsListFromShape(sel);
  };

  btnApplySel.onClick = function(){
    var comp = getActiveComp();
    if (!comp){ fail("Open a composition first."); return; }

    app.beginUndoGroup("FONTAN AE — First Vertex to selection");
    try{
      var changed = 0;
      var selected = listGroups.selection;
      if (selected && selected.length){
        var groups = [];
        for (var i=0;i<selected.length;i++){
          var r = selected[i];
          if (r && r.groupRef) groups.push(r.groupRef);
        }
        changed = applyFirstVertexToGroups(groups);
        // refresh stats
        var sel = ddShape.selection && ddShape.selection.layerRef ? ddShape.selection.layerRef : null;
        fillGroupsListFromShape(sel);
      } else {
        var paths = collectSelectedPathsFromSelection(comp);
        if (!paths.length){ fail("Select groups in the list or select Vector Paths in the timeline."); app.endUndoGroup(); return; }
        var mode = currentFixMode();
        for (var p=0;p<paths.length;p++){ changed += setFirstVertexOnAllKeys(paths[p], mode); }
      }
      alert("Done. Modified " + changed + " key(s).");
    } catch(e){
      fail(e && e.message ? e.message : e);
    } finally {
      app.endUndoGroup();
    }
  };

  // init
  rebuildShapeDropdown();
  if (ddShape.selection && ddShape.selection.layerRef) fillGroupsListFromShape(ddShape.selection.layerRef);

  // show
  tabs.selection = tabCreate;
  w.onResizing = w.onResize = function(){ this.layout.resize(); };
  w.center();
  w.show();
})();