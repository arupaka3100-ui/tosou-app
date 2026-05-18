<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>塗装面積 AI計測</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Hiragino Kaku Gothic ProN',sans-serif;background:#f5f5f0;min-height:100vh;padding-bottom:80px}
header{background:#1a1a2e;color:white;padding:14px 20px;display:flex;align-items:center;justify-content:space-between}
header h1{font-size:16px;font-weight:600}
.beta{font-size:11px;background:#e94560;padding:2px 8px;border-radius:20px}
.container{padding:16px;max-width:600px;margin:0 auto}
.card{background:white;border-radius:12px;padding:18px;margin-bottom:14px;border:1px solid #e0e0d8}
.card-title{font-size:12px;font-weight:600;color:#888;margin-bottom:12px}
.note-box{background:#fffbf0;border:1px solid #f0e0a0;border-radius:8px;padding:12px;font-size:12px;color:#886600;margin-bottom:14px;line-height:1.6}
.btn{width:100%;border:none;border-radius:12px;padding:15px;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px;font-family:inherit}
.btn-primary{background:#e94560;color:white}
.btn-green{background:#2d9e5a;color:white}
.btn-blue{background:#0066cc;color:white}
.btn-orange{background:#e07000;color:white}
.btn-outline{background:white;color:#1a1a2e;border:1.5px solid #e0e0d8}
.btn-gray{background:#888;color:white}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-sm{padding:10px;font-size:13px;border-radius:8px;margin-bottom:8px}
.hidden{display:none}
.spinner{width:17px;height:17px;border:2px solid rgba(255,255,255,.4);border-top-color:white;border-radius:50%;animation:spin .7s linear infinite;display:none}
@keyframes spin{to{transform:rotate(360deg)}}

/* ローディング */
.loading-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(26,26,46,.92);z-index:500;display:none;flex-direction:column;align-items:center;justify-content:center;gap:20px}
.loading-overlay.show{display:flex}
.loading-text{color:white;font-size:15px;font-weight:600}
.loading-sub{color:rgba(255,255,255,.6);font-size:12px}
.brush-wrap{width:260px;height:50px;position:relative}
.brush-track{position:absolute;bottom:10px;left:0;width:100%;height:8px;background:rgba(255,255,255,.15);border-radius:4px}
.brush-paint{position:absolute;bottom:10px;left:0;width:0%;height:8px;background:linear-gradient(90deg,#8B4513,#e07000,#ff9900);border-radius:4px}
.brush-icon{position:absolute;bottom:12px;font-size:26px;left:0}

/* 描画エリア */
.draw-wrap{position:relative;border-radius:8px;overflow:hidden;margin-bottom:10px;touch-action:none;-webkit-user-select:none;user-select:none;background:#000}
.draw-img{width:100%;display:block}
.draw-canvas{position:absolute;top:0;left:0;width:100%;height:100%}
.cursor-indicator{position:absolute;width:20px;height:20px;border:3px solid white;border-radius:50%;pointer-events:none;display:none;transform:translate(-50%,-100%);margin-top:-10px;box-shadow:0 0 0 2px rgba(0,0,0,.5)}

/* ステータスバー */
.status-bar{background:#1a1a2e;color:white;border-radius:8px;padding:12px;margin-bottom:10px;font-size:13px;font-weight:600;text-align:center}
.status-bar.green{background:#2d9e5a}
.status-bar.orange{background:#e07000}
.status-bar.blue{background:#0066cc}

/* 開口部リスト */
.opening-list{margin-bottom:10px}
.opening-item{display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;border:1.5px solid #e0e0d8;margin-bottom:8px;cursor:pointer}
.opening-item.active{border-color:#0066cc;background:#f0f8ff}
.opening-item.done{border-color:#2d9e5a;background:#f0fff4}
.opening-color{width:16px;height:16px;border-radius:4px;flex-shrink:0}
.opening-label{flex:1;font-size:13px;font-weight:600}
.opening-size{font-size:12px;color:#888}
.opening-status{font-size:12px;font-weight:600}

/* 実測入力 */
.measure-card{background:#f0f8ff;border:2px solid #0066cc;border-radius:12px;padding:16px;margin-bottom:14px}
.measure-title{font-size:13px;font-weight:700;color:#0066cc;margin-bottom:14px}
.measure-row{margin-bottom:14px}
.measure-label{font-size:13px;font-weight:600;margin-bottom:6px;display:block}
.req{font-size:10px;background:#cc3333;color:white;padding:1px 6px;border-radius:8px;margin-left:6px}
.measure-input-row{display:flex;align-items:center;gap:8px}
.measure-input{flex:1;border:2px solid #b8d8f8;border-radius:8px;padding:12px;font-size:22px;font-family:inherit;background:white;text-align:center;font-weight:700;-webkit-appearance:none}
.measure-input:focus{outline:none;border-color:#0066cc}
.measure-unit{font-size:14px;color:#888;white-space:nowrap}

/* 結果 */
.result-card{background:#1a1a2e;color:white;border-radius:12px;padding:18px;margin-bottom:14px}
.metrics{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.metric{background:rgba(255,255,255,.08);border-radius:8px;padding:11px}
.metric-label{font-size:11px;color:rgba(255,255,255,.6);margin-bottom:3px}
.metric-value{font-size:20px;font-weight:700}
.metric-value.red{color:#ff6b7a}
.detail-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.08);font-size:12px}
.detail-row:last-child{border-bottom:none}
.copy-btn{width:100%;background:rgba(255,255,255,.12);color:white;border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:11px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;margin-top:10px}
</style>
</head>
<body>

<div class="loading-overlay" id="loadingOverlay">
  <div class="brush-wrap">
    <div class="brush-track"></div>
    <div class="brush-paint" id="brushPaint"></div>
    <div class="brush-icon" id="brushIcon">🖌️</div>
  </div>
  <div class="loading-text" id="loadingText">AI解析中...</div>
  <div class="loading-sub" id="loadingSub">しばらくお待ちください</div>
</div>

<header><h1>塗装面積 AI計測</h1><span class="beta">Beta</span></header>
<div class="container">

  <!-- Step1: アップロード -->
  <div id="step1">
    <div class="card">
      <div class="card-title">外壁写真をアップロード</div>
      <div style="position:relative;border:2px dashed #e0e0d8;border-radius:8px;background:white;overflow:hidden">
        <div id="uploadPlaceholder" style="padding:40px 20px;text-align:center">
          <div style="font-size:40px;margin-bottom:10px">🏠</div>
          <div style="font-size:15px;font-weight:600;margin-bottom:6px">写真をタップして選択</div>
          <div style="font-size:12px;color:#888">カメラまたはライブラリから</div>
        </div>
        <img id="uploadPreview" style="width:100%;display:none;border-radius:8px">
        <input type="file" id="fileInput" accept="image/*" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:pointer" onchange="onFileChange(this)">
      </div>
      <button class="btn btn-outline btn-sm" id="retakeBtn" style="display:none;margin-top:8px" onclick="document.getElementById('fileInput').click()">📷 撮り直す</button>
    </div>
    <div class="note-box">建物全体が写るよう少し離れて撮影してください。</div>
    <button class="btn btn-primary" id="step1Next" onclick="goToStep2()" disabled>次へ →</button>
  </div>

  <!-- Step2: 外枠を描く -->
  <div id="step2" class="hidden">
    <div class="status-bar" id="step2Status">外壁の外枠を指でなぞって囲んでください</div>
    <div class="draw-wrap" id="drawWrap">
      <img id="drawImg" class="draw-img">
      <canvas id="drawCanvas" class="draw-canvas"></canvas>
      <div class="cursor-indicator" id="cursorIndicator"></div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <button class="btn btn-outline btn-sm" style="margin:0" onclick="clearOutline()">やり直す</button>
      <button class="btn btn-primary btn-sm" style="margin:0;flex:1" id="confirmOutlineBtn" onclick="confirmOutline()" disabled>外枠を確定する</button>
    </div>
    <div class="note-box">外壁全体（塗装する範囲）の外側を指でなぞってください。指の上に現在位置が表示されます。</div>
  </div>

  <!-- Step3: 開口部を描く -->
  <div id="step3" class="hidden">
    <div class="status-bar blue" id="step3Status">開口部をなぞってください</div>
    <div class="draw-wrap" id="drawWrap3">
      <img id="drawImg3" class="draw-img">
      <canvas id="drawCanvas3" class="draw-canvas"></canvas>
      <div class="cursor-indicator" id="cursorIndicator3"></div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <button class="btn btn-outline btn-sm" style="margin:0" onclick="clearOpening()">やり直す</button>
      <button class="btn btn-blue btn-sm" style="margin:0;flex:1" id="confirmOpeningBtn" onclick="confirmOpening()" disabled>この開口部を確定する</button>
    </div>

    <!-- 開口部リスト -->
    <div class="card">
      <div class="card-title">認識した開口部（タップして選択）</div>
      <div class="opening-list" id="openingList"></div>
      <button class="btn btn-outline btn-sm" style="margin:0" onclick="addManualOpening()">＋ 手動で開口部を追加</button>
    </div>
    <div class="note-box" id="step3Note">開口部（窓・ドア）を1つずつなぞってください。全て完了したら次へ進んでください。</div>
    <button class="btn btn-green" id="step3Next" onclick="goToStep4()">次へ：実測値を入力する →</button>
  </div>

  <!-- Step4: 実測値入力・計算 -->
  <div id="step4" class="hidden">
    <div class="measure-card">
      <div class="measure-title">📏 外枠の実測値を入力</div>
      <div class="measure-row">
        <label class="measure-label">横幅<span class="req">必須</span><br><small style="font-weight:400;color:#888">地面レベルで測定</small></label>
        <div class="measure-input-row">
          <input type="number" class="measure-input" id="widthInput" placeholder="8.0" step="0.1" min="0.1" inputmode="decimal">
          <span class="measure-unit">m</span>
        </div>
      </div>
      <div class="measure-row">
        <label class="measure-label">高さ<span class="req">必須</span><br><small style="font-weight:400;color:#888">距離計で測定</small></label>
        <div class="measure-input-row">
          <input type="number" class="measure-input" id="heightInput" placeholder="5.0" step="0.1" min="0.1" inputmode="decimal">
          <span class="measure-unit">m</span>
        </div>
      </div>
      <button class="btn btn-green" id="calcBtn" onclick="doCalc()">
        <div class="spinner" id="calcSpinner"></div>
        <span id="calcBtnText">📐 面積を計算する</span>
      </button>
      <div style="color:#cc3333;font-size:13px;margin-top:8px;display:none" id="calcErr"></div>
    </div>

    <!-- 結果写真（枠表示） -->
    <div class="card" id="resultPhotoCard" style="display:none">
      <div class="card-title">計算結果（写真上に表示）</div>
      <div style="position:relative;border-radius:8px;overflow:hidden">
        <img id="resultImg" style="width:100%;display:block;border-radius:8px">
        <canvas id="resultCanvas" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none"></canvas>
      </div>
    </div>

    <!-- 数値結果 -->
    <div id="resultCard" class="hidden">
      <div class="result-card">
        <div class="metrics">
          <div class="metric"><div class="metric-label">外壁面積</div><div class="metric-value" id="rWall">—</div></div>
          <div class="metric"><div class="metric-label">塗装面積</div><div class="metric-value red" id="rPaint">—</div></div>
        </div>
        <div id="rDetails"></div>
        <button class="copy-btn" onclick="copyResult()">📋 jimuuにコピーする</button>
      </div>
    </div>

    <button class="btn btn-outline" style="margin-top:4px" onclick="resetAll()">最初からやり直す</button>
  </div>

</div>

<script>
var COLORS = ['#e94560','#0066cc','#2d9e5a','#cc8800','#9933cc','#cc6600'];

var state = {
  imageSrc: null,
  imageBase64: null,
  imageMediaType: 'image/jpeg',
  imgNaturalW: 0,
  imgNaturalH: 0,
  outlinePoints: [],   // 外枠の輪郭点
  openings: [],        // [{id, type, points, color, sizePx}]
  currentOpeningIdx: -1,
  drawingPoints: [],
  isDrawing: false,
  brushTimer: null,
  aiOpenings: []       // AIが認識した開口部リスト
};

// ===== ファイル選択 =====
function onFileChange(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    state.imageSrc = ev.target.result;
    state.imageBase64 = ev.target.result.split(',')[1];
    state.imageMediaType = file.type || 'image/jpeg';
    document.getElementById('uploadPlaceholder').style.display = 'none';
    document.getElementById('uploadPreview').src = state.imageSrc;
    document.getElementById('uploadPreview').style.display = 'block';
    document.getElementById('retakeBtn').style.display = 'flex';
    document.getElementById('step1Next').disabled = false;
  };
  reader.readAsDataURL(file);
}

// ===== Step2: 外枠を描く =====
function goToStep2() {
  var img = document.getElementById('drawImg');
  img.src = state.imageSrc;
  img.onload = function() {
    state.imgNaturalW = img.naturalWidth;
    state.imgNaturalH = img.naturalHeight;
    initCanvas('drawCanvas', 'cursorIndicator');
    clearOutline();
  };
  show('step2');
}

function initCanvas(canvasId, cursorId) {
  var img = document.getElementById(canvasId === 'drawCanvas' ? 'drawImg' : 'drawImg3');
  var canvas = document.getElementById(canvasId);
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  // タッチイベント
  canvas.addEventListener('touchstart', function(e) { e.preventDefault(); onDrawStart(e, canvasId, cursorId); }, {passive:false});
  canvas.addEventListener('touchmove', function(e) { e.preventDefault(); onDrawMove(e, canvasId, cursorId); }, {passive:false});
  canvas.addEventListener('touchend', function(e) { onDrawEnd(e, canvasId); }, {passive:false});
  // マウスイベント
  canvas.addEventListener('mousedown', function(e) { onDrawStart(e, canvasId, cursorId); });
  canvas.addEventListener('mousemove', function(e) { onDrawMove(e, canvasId, cursorId); });
  canvas.addEventListener('mouseup', function(e) { onDrawEnd(e, canvasId); });
}

function getPos(e, canvas) {
  var rect = canvas.getBoundingClientRect();
  var scaleX = canvas.width / rect.width;
  var scaleY = canvas.height / rect.height;
  var src = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - rect.left) * scaleX,
    y: (src.clientY - rect.top) * scaleY,
    clientX: src.clientX,
    clientY: src.clientY
  };
}

function onDrawStart(e, canvasId, cursorId) {
  state.isDrawing = true;
  state.drawingPoints = [];
  var canvas = document.getElementById(canvasId);
  var p = getPos(e, canvas);
  state.drawingPoints.push(p);
  showCursor(cursorId, p.clientX, p.clientY);
}

function onDrawMove(e, canvasId, cursorId) {
  if (!state.isDrawing) return;
  var canvas = document.getElementById(canvasId);
  var p = getPos(e, canvas);
  state.drawingPoints.push(p);
  showCursor(cursorId, p.clientX, p.clientY);
  redrawCanvas(canvasId);
}

function onDrawEnd(e, canvasId) {
  if (!state.isDrawing) return;
  state.isDrawing = false;
  hideCursor(canvasId === 'drawCanvas' ? 'cursorIndicator' : 'cursorIndicator3');

  if (state.drawingPoints.length > 3) {
    if (canvasId === 'drawCanvas') {
      state.outlinePoints = state.drawingPoints.slice();
      document.getElementById('confirmOutlineBtn').disabled = false;
      document.getElementById('step2Status').textContent = '外枠が選択されました。確認して確定してください。';
    } else {
      document.getElementById('confirmOpeningBtn').disabled = false;
      document.getElementById('step3Status').textContent = '輪郭が描けました。確定してください。';
    }
  }
  redrawCanvas(canvasId);
}

// カーソル表示（指の上に表示）
function showCursor(cursorId, clientX, clientY) {
  var cursor = document.getElementById(cursorId);
  if (!cursor) return;
  cursor.style.display = 'block';
  cursor.style.left = clientX + 'px';
  cursor.style.top = (clientY - 30) + 'px'; // 指の上30px
  cursor.style.position = 'fixed';
}

function hideCursor(cursorId) {
  var cursor = document.getElementById(cursorId);
  if (cursor) cursor.style.display = 'none';
}

// キャンバス描画
function redrawCanvas(canvasId) {
  var canvas = document.getElementById(canvasId);
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (canvasId === 'drawCanvas') {
    // 外枠を描画
    drawPolygon(ctx, state.outlinePoints, '#ffffff', 3, 'rgba(255,255,255,0.1)');
    // 現在描画中
    if (state.isDrawing && state.drawingPoints.length > 1) {
      drawPolygon(ctx, state.drawingPoints, '#ffffff', 3, 'rgba(255,255,255,0.1)');
    }
  } else {
    // 確定済み開口部を描画
    state.openings.forEach(function(op) {
      drawPolygon(ctx, op.points, op.color, 2.5, op.color.replace(')', ',0.15)').replace('rgb', 'rgba'));
      // ラベル
      if (op.points.length > 0) {
        var xs = op.points.map(function(p){return p.x;});
        var ys = op.points.map(function(p){return p.y;});
        var cx = (Math.min.apply(null,xs)+Math.max.apply(null,xs))/2;
        var cy = Math.min.apply(null,ys)-8;
        ctx.fillStyle = op.color;
        var label = (state.openings.indexOf(op)+1) + ' ' + op.type;
        ctx.font = 'bold ' + Math.max(16, canvas.width/40) + 'px sans-serif';
        var tw = ctx.measureText(label).width;
        ctx.fillRect(cx-tw/2-4, cy-20, tw+8, 22);
        ctx.fillStyle = 'white';
        ctx.fillText(label, cx-tw/2, cy-2);
      }
    });
    // 現在描画中
    if (state.isDrawing && state.drawingPoints.length > 1) {
      var col = COLORS[state.openings.length % COLORS.length];
      drawPolygon(ctx, state.drawingPoints, col, 2.5, 'rgba(0,0,0,0)');
    }
  }
}

function drawPolygon(ctx, pts, strokeColor, lineWidth, fillColor) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fillColor) { ctx.fillStyle = fillColor; ctx.fill(); }
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  // 始点マーク
  ctx.fillStyle = strokeColor;
  ctx.beginPath();
  ctx.arc(pts[0].x, pts[0].y, 6, 0, Math.PI*2);
  ctx.fill();
}

function clearOutline() {
  state.outlinePoints = [];
  state.drawingPoints = [];
  var canvas = document.getElementById('drawCanvas');
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById('confirmOutlineBtn').disabled = true;
  document.getElementById('step2Status').textContent = '外壁の外枠を指でなぞって囲んでください';
}

function confirmOutline() {
  // AIで開口部を認識
  analyzeOpenings();
}

// ===== AI解析 =====
async function analyzeOpenings() {
  showLoading('AI解析中...', '開口部（窓・ドア）を認識しています');
  try {
    var res = await fetch('/api/analyze', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        step: 'analyze_area',
        imageBase64: state.imageBase64,
        imageMediaType: state.imageMediaType
      })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'APIエラー');
    state.aiOpenings = data.openings || [];
    hideLoading();
    goToStep3();
  } catch(e) {
    hideLoading();
    // エラーでも手動で追加できるようStep3へ
    state.aiOpenings = [];
    goToStep3();
  }
}

// ===== Step3: 開口部を描く =====
function goToStep3() {
  var img3 = document.getElementById('drawImg3');
  img3.src = state.imageSrc;
  img3.onload = function() {
    initCanvas('drawCanvas3', 'cursorIndicator3');
    // 外枠を薄く表示
    redrawAll3();
  };
  state.openings = [];
  buildOpeningList();
  show('step3');
}

function redrawAll3() {
  var canvas = document.getElementById('drawCanvas3');
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 外枠を薄く表示
  drawPolygon(ctx, state.outlinePoints, 'rgba(255,255,255,0.5)', 2, 'rgba(255,255,255,0.05)');

  // 確定済み開口部
  state.openings.forEach(function(op, i) {
    drawPolygon(ctx, op.points, op.color, 2.5, op.color + '33');
    if (op.points.length > 0) {
      var xs = op.points.map(function(p){return p.x;});
      var ys = op.points.map(function(p){return p.y;});
      var cx = (Math.min.apply(null,xs)+Math.max.apply(null,xs))/2;
      var cy = Math.min.apply(null,ys)-8;
      ctx.fillStyle = op.color;
      var label = (i+1) + ' ' + op.type;
      ctx.font = 'bold ' + Math.max(16, canvas.width/40) + 'px sans-serif';
      var tw = ctx.measureText(label).width;
      ctx.fillRect(cx-tw/2-4, cy-20, tw+8, 22);
      ctx.fillStyle = 'white';
      ctx.fillText(label, cx-tw/2, cy-2);
    }
  });

  // 描画中
  if (state.isDrawing && state.drawingPoints.length > 1) {
    var col = COLORS[state.openings.length % COLORS.length];
    drawPolygon(ctx, state.drawingPoints, col, 2.5, 'rgba(0,0,0,0)');
  }
}

function buildOpeningList() {
  var list = document.getElementById('openingList');
  if (state.openings.length === 0 && state.aiOpenings.length === 0) {
    list.innerHTML = '<div style="font-size:12px;color:#888;padding:8px">AIが開口部を認識できませんでした。手動で追加してください。</div>';
    return;
  }

  // AIが認識した未描画の開口部
  var html = '';
  state.aiOpenings.forEach(function(ai, i) {
    var drawn = state.openings.find(function(op) { return op.aiId === i; });
    if (!drawn) {
      html += '<div class="opening-item" onclick="selectAiOpening(' + i + ')" id="aiOp_' + i + '">' +
        '<div class="opening-color" style="background:' + COLORS[i % COLORS.length] + '"></div>' +
        '<div class="opening-label">' + ai.type + (ai.count > 1 ? ' ×' + ai.count : '') + '</div>' +
        '<div class="opening-status" style="color:#cc8800">未描画</div>' +
        '</div>';
    }
  });

  // 描画済みの開口部
  state.openings.forEach(function(op, i) {
    html += '<div class="opening-item done">' +
      '<div class="opening-color" style="background:' + op.color + '"></div>' +
      '<div class="opening-label">' + op.type + '</div>' +
      '<div class="opening-size">' + (op.widthM ? op.widthM.toFixed(2) + 'm × ' + op.heightM.toFixed(2) + 'm' : '') + '</div>' +
      '<div class="opening-status" style="color:#2d9e5a">✓</div>' +
      '</div>';
  });

  list.innerHTML = html || '<div style="font-size:12px;color:#888;padding:8px">開口部を追加してください</div>';
}

function selectAiOpening(idx) {
  state.currentOpeningIdx = idx;
  var ai = state.aiOpenings[idx];
  document.getElementById('step3Status').textContent = ai.type + 'の輪郭を指でなぞってください';
  clearOpening();
}

function addManualOpening() {
  var type = prompt('開口部の種類を入力してください（例：引き違い窓、玄関ドア、掃き出し窓）');
  if (!type) return;
  state.currentOpeningIdx = -1;
  state.aiOpenings.push({type: type, count: 1});
  state.currentOpeningIdx = state.aiOpenings.length - 1;
  document.getElementById('step3Status').textContent = type + 'の輪郭を指でなぞってください';
  clearOpening();
  buildOpeningList();
}

function clearOpening() {
  state.drawingPoints = [];
  document.getElementById('confirmOpeningBtn').disabled = true;
  redrawAll3();
}

function confirmOpening() {
  if (state.drawingPoints.length < 3) return;
  var idx = state.currentOpeningIdx >= 0 ? state.currentOpeningIdx : state.aiOpenings.length - 1;
  var ai = state.aiOpenings[idx] || {type: '開口部', count: 1};
  var col = COLORS[state.openings.length % COLORS.length];

  // バウンディングボックスを計算
  var xs = state.drawingPoints.map(function(p){return p.x;});
  var ys = state.drawingPoints.map(function(p){return p.y;});
  var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
  var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);

  state.openings.push({
    aiId: idx,
    type: ai.type,
    count: ai.count || 1,
    color: col,
    points: state.drawingPoints.slice(),
    widthPx: maxX - minX,
    heightPx: maxY - minY,
    // 外枠に対するx位置の割合（遠近補正用）
    xRatio: ((minX + maxX) / 2) / state.imgNaturalW,
    widthM: null,
    heightM: null
  });

  state.drawingPoints = [];
  document.getElementById('confirmOpeningBtn').disabled = true;
  buildOpeningList();
  redrawAll3();
  document.getElementById('step3Status').textContent = '確定しました。次の開口部をなぞるか、次へ進んでください。';
}

function goToStep4() {
  show('step4');
  document.getElementById('resultImg').src = state.imageSrc;
}

// ===== Step4: 面積計算 =====
function doCalc() {
  var w = parseFloat(document.getElementById('widthInput').value);
  var h = parseFloat(document.getElementById('heightInput').value);
  var err = document.getElementById('calcErr');
  err.style.display = 'none';
  if (!w || w <= 0) { err.textContent = '横幅を入力してください'; err.style.display = 'block'; return; }
  if (!h || h <= 0) { err.textContent = '高さを入力してください'; err.style.display = 'block'; return; }

  // 外枠のピクセルサイズを計算
  if (state.outlinePoints.length < 3) { err.textContent = '外枠が描かれていません'; err.style.display = 'block'; return; }
  var oxs = state.outlinePoints.map(function(p){return p.x;});
  var oys = state.outlinePoints.map(function(p){return p.y;});
  var outlineW = Math.max.apply(null, oxs) - Math.min.apply(null, oxs);
  var outlineH = Math.max.apply(null, oys) - Math.min.apply(null, oys);

  // 縮尺（m/px）
  var scaleW = w / outlineW;
  var scaleH = h / outlineH;

  // 外壁面積
  var wallArea = parseFloat((w * h).toFixed(1));

  // 各開口部のサイズを計算
  var totalOpening = 0;
  state.openings.forEach(function(op) {
    // x位置に応じて縮尺を補間（遠近補正）
    var scale = (scaleW + scaleH) / 2;
    op.widthM = parseFloat((op.widthPx * scale).toFixed(2));
    op.heightM = parseFloat((op.heightPx * scale).toFixed(2));
    op.areaM = parseFloat((op.widthM * op.heightM * op.count).toFixed(2));
    totalOpening += op.areaM;
  });

  totalOpening = parseFloat(totalOpening.toFixed(1));
  var paintArea = parseFloat(Math.max(0, wallArea - totalOpening).toFixed(1));

  // 結果を写真上に表示
  renderResult(w, h, scaleW, scaleH);

  // 数値結果
  document.getElementById('rWall').textContent = wallArea.toFixed(1) + ' m²';
  document.getElementById('rPaint').textContent = paintArea.toFixed(1) + ' m²';

  var details = '';
  state.openings.forEach(function(op, i) {
    details += '<div class="detail-row">' +
      '<span style="color:rgba(255,255,255,.7)">' + (i+1) + ' ' + op.type + '×' + op.count + '</span>' +
      '<span>−' + op.areaM.toFixed(1) + ' m²<br><small style="color:rgba(255,255,255,.5)">' + op.widthM.toFixed(2) + 'm×' + op.heightM.toFixed(2) + 'm</small></span>' +
      '</div>';
  });
  details += '<div class="detail-row"><span style="color:rgba(255,255,255,.7)">開口部合計</span><span>−' + totalOpening.toFixed(1) + ' m²</span></div>';
  document.getElementById('rDetails').innerHTML = details;

  document.getElementById('resultPhotoCard').style.display = 'block';
  document.getElementById('resultCard').classList.remove('hidden');
  document.getElementById('resultCard').scrollIntoView({behavior:'smooth'});

  buildOpeningList();
}

function renderResult(w, h, scaleW, scaleH) {
  var img = document.getElementById('resultImg');
  var canvas = document.getElementById('resultCanvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  var ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 外枠（白）
  drawPolygon(ctx, state.outlinePoints, 'white', 3, 'rgba(255,255,255,0.05)');

  // 開口部（色付き枠＋サイズ表示）
  state.openings.forEach(function(op, i) {
    drawPolygon(ctx, op.points, op.color, 3, op.color.replace('#', 'rgba(').replace(/(..)(..)(..)/, function(m,r,g,b){
      return parseInt(r,16)+','+parseInt(g,16)+','+parseInt(b,16);
    }) + ',0.2)');

    // サイズラベル
    var xs = op.points.map(function(p){return p.x;});
    var ys = op.points.map(function(p){return p.y;});
    var cx = (Math.min.apply(null,xs)+Math.max.apply(null,xs))/2;
    var cy = Math.min.apply(null,ys);
    ctx.fillStyle = op.color;
    var label = op.widthM.toFixed(2) + 'm×' + op.heightM.toFixed(2) + 'm';
    var fs = Math.max(14, canvas.width/50);
    ctx.font = 'bold ' + fs + 'px sans-serif';
    var tw = ctx.measureText(label).width;
    ctx.fillRect(cx-tw/2-4, cy-fs-8, tw+8, fs+6);
    ctx.fillStyle = 'white';
    ctx.fillText(label, cx-tw/2, cy-6);
  });
}

function copyResult() {
  var w = parseFloat(document.getElementById('widthInput').value);
  var h = parseFloat(document.getElementById('heightInput').value);
  var wallArea = w * h;
  var totalOp = state.openings.reduce(function(s,op){return s+op.areaM;}, 0);
  var paint = Math.max(0, wallArea - totalOp);
  var text = '【塗装面積 AI計測結果】\n';
  text += '横幅：' + w.toFixed(1) + 'm　高さ：' + h.toFixed(1) + 'm\n';
  text += '外壁面積：' + wallArea.toFixed(1) + ' m²\n';
  state.openings.forEach(function(op,i){
    text += (i+1)+' '+op.type+'×'+op.count+'：'+op.areaM.toFixed(1)+' m²（'+op.widthM.toFixed(2)+'m×'+op.heightM.toFixed(2)+'m）\n';
  });
  text += '開口部合計：' + totalOp.toFixed(1) + ' m²\n';
  text += '塗装面積：' + paint.toFixed(1) + ' m²';
  navigator.clipboard.writeText(text).then(function(){
    var btn = document.querySelector('.copy-btn');
    btn.textContent = '✅ コピーしました！';
    setTimeout(function(){ btn.textContent = '📋 jimuuにコピーする'; }, 2000);
  });
}

// ===== ローディング =====
function showLoading(text, sub) {
  document.getElementById('loadingText').textContent = text;
  document.getElementById('loadingSub').textContent = sub;
  document.getElementById('loadingOverlay').classList.add('show');
  var p = 0;
  var paint = document.getElementById('brushPaint');
  var icon = document.getElementById('brushIcon');
  state.brushTimer = setInterval(function(){
    p += 1.5; if (p > 100) p = 0;
    paint.style.width = p + '%';
    icon.style.left = 'calc(' + p + '% - 14px)';
  }, 30);
}
function hideLoading() {
  clearInterval(state.brushTimer);
  document.getElementById('loadingOverlay').classList.remove('show');
  document.getElementById('brushPaint').style.width = '0%';
  document.getElementById('brushIcon').style.left = '0px';
}

function show(id) {
  ['step1','step2','step3','step4'].forEach(function(s){
    document.getElementById(s).classList.toggle('hidden', s !== id);
  });
  window.scrollTo(0, 0);
}

function resetAll() {
  state.imageSrc = null;
  state.imageBase64 = null;
  state.outlinePoints = [];
  state.openings = [];
  state.aiOpenings = [];
  state.drawingPoints = [];
  hideLoading();
  document.getElementById('uploadPlaceholder').style.display = 'block';
  document.getElementById('uploadPreview').style.display = 'none';
  document.getElementById('uploadPreview').src = '';
  document.getElementById('retakeBtn').style.display = 'none';
  document.getElementById('fileInput').value = '';
  document.getElementById('step1Next').disabled = true;
  document.getElementById('resultCard').classList.add('hidden');
  document.getElementById('resultPhotoCard').style.display = 'none';
  show('step1');
}
</script>
</body>
</html>
