/* ================================================================
   iWaste v0.2 — Stabilized Demo Engine + Score System
   Pure vanilla JS. Zero dependencies.
   ================================================================ */
(function() {
  'use strict';

  /* =============================================================
     1. APP STATE + PERSISTENCE
     ============================================================= */
  var appState = {
    totalScans: 0,
    foodScans: 0,
    wasteScans: 0,
    totalScore: 0,
    ecoScoreAvg: 0,
    accuracyAvg: 0,
    lastEcoScore: 0,
    tier: 'Beginner'
  };

  var _requestId = 0;
  var _stepTimer = null;
  var _isAnalyzing = false;
  var _currentMode = 'food';

  function loadState() {
    try {
      var s = localStorage.getItem('iwaste_state');
      if (s) {
        var p = JSON.parse(s);
        for (var k in appState) {
          if (p.hasOwnProperty(k)) appState[k] = p[k];
        }
      }
    } catch (e) { /* silent */ }
  }

  function saveState() {
    try {
      localStorage.setItem('iwaste_state', JSON.stringify(appState));
    } catch (e) { /* silent */ }
  }

  /* =============================================================
     2. SCORING ENGINE
     ============================================================= */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function calculateEcoScore(food) {
    var wasteNum = parseInt(food.impact) || 100;
    var risk = food.wasteRiskClass === 'high' ? 25 : food.wasteRiskClass === 'medium' ? 12 : 4;
    return clamp(food.ecoScore - Math.floor(risk * 0.1), 0, 100);
  }

  function calculatePoints(type, payload, eco) {
    if (type === 'food') return Math.round(eco * 0.4);
    return 15 + (appState.wasteScans > 1 ? 3 : 0);
  }

  function updateTier(score) {
    if (score >= 600) return 'Sustainable Pro';
    if (score >= 300) return 'Optimizer';
    if (score >= 100) return 'Conscious';
    return 'Beginner';
  }

  function updateAggregates(type, eco, pts) {
    appState.totalScans++;
    if (type === 'food') {
      appState.foodScans++;
      appState.lastEcoScore = eco;
      appState.ecoScoreAvg = appState.foodScans === 1
        ? eco
        : Math.round((appState.ecoScoreAvg * (appState.foodScans - 1) + eco) / appState.foodScans);
    } else {
      appState.wasteScans++;
    }
    appState.totalScore += pts;
    appState.tier = updateTier(appState.totalScore);
    saveState();
    renderOverlay();

    // Behavioral messages
    if (appState.totalScans === 3) showToast("Habit forming: you're building sustainable behavior.");
    if (appState.totalScans === 5) {
      var pct = clamp(Math.round((appState.ecoScoreAvg - 60) * 0.8), 0, 25);
      showToast('Estimated impact reduced by ~' + pct + '%. Keep scanning!');
    }
  }

  function showToast(msg) {
    var t = document.getElementById('iwaste-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('visible');
    setTimeout(function() { t.classList.remove('visible'); }, 4000);
  }

  /* =============================================================
     3. MOCK DATA
     ============================================================= */
  var FoodPool = [
    { detected:'Grilled Chicken & Rice', ecoScore:72, wasteRisk:'Medium', wasteRiskClass:'medium', impact:'124g wasted — 0.3 kg CO₂e', recommendation:'Consider smaller portions next time. Most waste came from the rice.' },
    { detected:'Pepperoni Pizza & Caesar Salad', ecoScore:58, wasteRisk:'High', wasteRiskClass:'high', impact:'198g wasted — 0.5 kg CO₂e', recommendation:'Nearly half the salad was left behind. Try a smaller side.' },
    { detected:'Beef Tacos & Black Beans', ecoScore:85, wasteRisk:'Low', wasteRiskClass:'low', impact:'72g wasted — 0.2 kg CO₂e', recommendation:'Excellent! Minimal waste. Consider two tacos to save even more.' },
    { detected:'Salmon Fillet & Quinoa Bowl', ecoScore:81, wasteRisk:'Low', wasteRiskClass:'low', impact:'85g wasted — 0.2 kg CO₂e', recommendation:'The fruit cup had the most waste. Grab a smaller one.' }
  ];

  var WastePool = [
    { detected:'Plastic Bottle', correctBin:'Recycling', binClass:'recycle', contamRisk:'Low', contamClass:'low', confidence:96, recommendation:'Rinse before disposal. Remove cap and label if possible.' },
    { detected:'Banana Peel', correctBin:'Compost', binClass:'compost', contamRisk:'Low', contamClass:'low', confidence:98, recommendation:'Breaks down in 2–5 weeks. Great for compost.' },
    { detected:'Dirty Napkin', correctBin:'Landfill', binClass:'landfill', contamRisk:'Medium', contamClass:'medium', confidence:91, recommendation:'Food-soiled paper can\'t be recycled. Use cloth napkins.' },
    { detected:'Aluminum Can', correctBin:'Recycling', binClass:'recycle', contamRisk:'Low', contamClass:'low', confidence:97, recommendation:'Infinitely recyclable. Rinse before disposing.' },
    { detected:'Styrofoam Container', correctBin:'Landfill', binClass:'landfill', contamRisk:'High', contamClass:'high', confidence:93, recommendation:'Polystyrene isn\'t recyclable in most programs. Avoid it.' },
    { detected:'Cardboard Tray', correctBin:'Recycling', binClass:'recycle', contamRisk:'Low', contamClass:'low', confidence:94, recommendation:'Clean cardboard is recyclable. Flatten to save space.' }
  ];

  var _foodIdx = 0;
  var _wasteIdx = 0;

  /* =============================================================
     4. ASYNC AI SIMULATION
     ============================================================= */
  function fetchFoodAnalysis() {
    return new Promise(function(resolve) {
      var d = FoodPool[_foodIdx % FoodPool.length];
      _foodIdx++;
      setTimeout(function() { resolve(d); }, 1800 + Math.random() * 400);
    });
  }

  function fetchWasteClassification() {
    return new Promise(function(resolve) {
      var d = WastePool[_wasteIdx % WastePool.length];
      _wasteIdx++;
      setTimeout(function() { resolve(d); }, 1500 + Math.random() * 500);
    });
  }

  /* =============================================================
     5. UI HELPERS
     ============================================================= */
  function animateNum(el, from, to, dur) {
    var start = performance.now();
    (function tick(now) {
      var p = Math.min((now - start) / dur, 1);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    })(performance.now());
  }

  function $(id) { return document.getElementById(id); }

  /* =============================================================
     6. CORE — setMode / resetScanState / setLoading
     ============================================================= */
  function setMode(mode) {
    if (_isAnalyzing) {
      // Abort in-flight analysis
      _requestId++;
      _isAnalyzing = false;
      if (_stepTimer) { clearInterval(_stepTimer); _stepTimer = null; }
    }
    _currentMode = mode;
    window.Scanner.mode = mode;
    resetScanState();
    $('tab-food').classList.toggle('active', mode === 'food');
    $('tab-waste').classList.toggle('active', mode === 'waste');
    $('demo-title-text').textContent =
      mode === 'food' ? 'Food Mode — Scan Your Plate' : 'Waste Mode — Classify Your Trash';
  }

  function resetScanState() {
    if (_stepTimer) { clearInterval(_stepTimer); _stepTimer = null; }
    $('scan-loading').classList.remove('active');
    $('scan-results').classList.remove('active');
    $('scan-upload-zone').style.display = '';
    $('scan-preview').style.display = 'none';
    $('scan-analyze').style.display = 'none';
    $('scan-analyze').disabled = false;
    $('scan-file').value = '';
    $('scan-result-body').innerHTML = '';
  }

  function setLoading(on) {
    if (on) {
      $('scan-upload-zone').style.display = 'none';
      $('scan-analyze').style.display = 'none';
      $('scan-preview').style.display = 'none';
      $('scan-loading').classList.add('active');
    } else {
      $('scan-loading').classList.remove('active');
    }
  }

  /* =============================================================
     7. CORE — startAnalysis / completeAnalysis
     ============================================================= */
  function startAnalysis() {
    // Guard: no file selected
    var preview = $('scan-preview');
    if (!preview.src || preview.style.display === 'none') return;

    // Guard: already analyzing
    if (_isAnalyzing) return;
    _isAnalyzing = true;

    var btn = $('scan-analyze');
    btn.disabled = true;

    // Capture request token
    var myId = ++_requestId;

    setLoading(true);

    // Step labels
    var steps = _currentMode === 'food'
      ? ['Identifying food items…','Estimating portions…','Calculating waste impact…','Computing EcoScore…']
      : ['Detecting material type…','Analyzing composition…','Checking bin rules…','Computing confidence…'];
    var si = 0;
    var sub = $('load-sub');
    $('load-label').textContent = _currentMode === 'food' ? 'Analyzing with Gemini Vision' : 'Classifying waste item';
    sub.textContent = steps[0];
    _stepTimer = setInterval(function() { si++; if (si < steps.length) sub.textContent = steps[si]; }, 450);

    // Fetch
    var p = _currentMode === 'food' ? fetchFoodAnalysis() : fetchWasteClassification();
    p.then(function(result) {
      // Abort check — ignore stale results
      if (myId !== _requestId) return;
      completeAnalysis(result);
    });
  }

  function completeAnalysis(result) {
    if (_stepTimer) { clearInterval(_stepTimer); _stepTimer = null; }
    _isAnalyzing = false;
    setLoading(false);
    $('scan-analyze').disabled = false;

    // Score
    var eco = _currentMode === 'food' ? calculateEcoScore(result) : 0;
    var pts = calculatePoints(_currentMode, result, eco);
    updateAggregates(_currentMode, eco, pts);

    // Render
    $('scan-result-body').innerHTML =
      _currentMode === 'food' ? renderFood(result) : renderWaste(result);
    $('scan-results').classList.add('active');

    setTimeout(function() {
      var ring = $('eco-fill');
      if (ring) ring.style.strokeDashoffset = 314 - (result.ecoScore / 100) * 314;
      var numEl = $('eco-num');
      if (numEl) animateNum(numEl, 0, result.ecoScore, 900);
      var conf = $('conf-fill');
      if (conf) conf.style.width = result.confidence + '%';
    }, 60);
  }

  /* =============================================================
     8. RENDERERS
     ============================================================= */
  function renderFood(d) {
    var clr = d.ecoScore >= 70 ? 'var(--green)' : d.ecoScore >= 50 ? 'var(--amber)' : 'var(--red)';
    var h = '<div class="eco-block"><div class="eco-ring"><svg viewBox="0 0 110 110">' +
      '<circle cx="55" cy="55" r="50" class="track"/>' +
      '<circle cx="55" cy="55" r="50" class="fill" id="eco-fill" style="stroke:' + clr + '" transform="rotate(-90 55 55)"/>' +
      '</svg><div class="num" id="eco-num" style="color:' + clr + '">0</div></div><div class="eco-label">ECOSCORE</div></div>';
    h += '<div class="r-cards">';
    h += '<div class="r-card"><h4>Detected Item</h4><div class="val">' + d.detected + '</div></div>';
    h += '<div class="r-card"><h4>Waste Risk</h4><span class="risk-badge ' + d.wasteRiskClass + '">' + d.wasteRisk + '</span><p style="color:var(--text-2);margin-top:8px;font-size:13px">' + d.impact + '</p></div>';
    h += '<div class="tip-box"><span class="tip-icon">💡</span><span>' + d.recommendation + '</span></div>';
    h += '</div>';
    return h;
  }

  function renderWaste(d) {
    var emoji = d.binClass === 'compost' ? '🌱' : d.binClass === 'recycle' ? '♻️' : '🗑️';
    var h = '<div style="text-align:center;padding:20px 0;animation:scoreIn .5s ease">' +
      '<div style="font-size:52px;margin-bottom:12px">' + emoji + '</div>' +
      '<span class="bin-badge ' + d.binClass + '">' + d.correctBin + '</span></div>';
    h += '<div class="r-cards">';
    h += '<div class="r-card"><h4>Detected Item</h4><div class="val">' + d.detected + '</div></div>';
    h += '<div class="r-card"><h4>Correct Bin</h4><span class="bin-badge ' + d.binClass + '" style="font-size:14px">' + emoji + ' ' + d.correctBin + '</span></div>';
    h += '<div class="r-card"><h4>Contamination Risk</h4><span class="risk-badge ' + d.contamClass + '">' + d.contamRisk + '</span></div>';
    h += '<div class="r-card"><h4>AI Confidence</h4><div class="conf-row"><span>Certainty</span><div class="conf-track"><div class="conf-fill" id="conf-fill" style="width:0%"></div></div><span style="font-weight:700;min-width:36px;text-align:right">' + d.confidence + '%</span></div></div>';
    h += '<div class="tip-box"><span class="tip-icon">💡</span><span>' + d.recommendation + '</span></div>';
    h += '</div>';
    return h;
  }

  /* =============================================================
     9. FLOATING DASHBOARD OVERLAY
     ============================================================= */
  function renderOverlay() {
    var el = $('stats-overlay');
    if (!el) return;
    $('stats-scans').textContent = appState.totalScans;
    $('stats-eco').textContent = appState.foodScans > 0 ? appState.ecoScoreAvg : '—';
    $('stats-tier').textContent = appState.tier;
    el.style.opacity = '1';
  }

  /* =============================================================
     10. FILE HANDLER
     ============================================================= */
  function onFileChange(e) {
    var f = e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      $('scan-preview').src = ev.target.result;
      $('scan-preview').style.display = 'block';
      $('scan-upload-zone').style.display = 'none';
      $('scan-analyze').style.display = 'block';
    };
    reader.readAsDataURL(f);
  }

  /* =============================================================
     11. SCROLL EFFECTS
     ============================================================= */
  function initScrollFx() {
    if ('IntersectionObserver' in window) {
      var obs = new IntersectionObserver(function(entries) {
        entries.forEach(function(e) {
          if (e.isIntersecting) { e.target.style.opacity = '1'; e.target.style.transform = 'translateY(0)'; }
        });
      }, { threshold: 0.08 });
      document.querySelectorAll('.section').forEach(function(s) {
        s.style.opacity = '0'; s.style.transform = 'translateY(28px)';
        s.style.transition = 'opacity .7s ease, transform .7s ease';
        obs.observe(s);
      });
    }
    window.addEventListener('scroll', function() {
      document.querySelector('.nav').classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
  }

  /* =============================================================
     12. INIT
     ============================================================= */
  function init() {
    loadState();

    // Mode tabs
    $('tab-food').addEventListener('click', function() { setMode('food'); });
    $('tab-waste').addEventListener('click', function() { setMode('waste'); });

    // Hero buttons
    $('btn-food').addEventListener('click', function(e) {
      e.preventDefault();
      $('demo').scrollIntoView({ behavior: 'smooth' });
      setTimeout(function() { setMode('food'); }, 500);
    });
    $('btn-waste').addEventListener('click', function(e) {
      e.preventDefault();
      $('demo').scrollIntoView({ behavior: 'smooth' });
      setTimeout(function() { setMode('waste'); }, 500);
    });

    // File + Analyze
    $('scan-file').addEventListener('change', onFileChange);
    $('scan-analyze').addEventListener('click', startAnalysis);

    // Set initial mode
    setMode('food');

    // Scroll effects
    initScrollFx();

    // Overlay
    renderOverlay();
  }

  /* =============================================================
     13. PUBLIC API
     ============================================================= */
  window.Scanner = {
    mode: 'food',
    reset: resetScanState
  };

  document.addEventListener('DOMContentLoaded', init);
})();
