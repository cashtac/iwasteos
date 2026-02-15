/* ================================================================
   iWaste v0.3 — Dual Panel: Food + Waste side-by-side
   Pure vanilla JS. Zero dependencies.
   ================================================================ */
(function () {
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

  /* Per-panel state */
  var _panels = {
    food: { requestId: 0, stepTimer: null, analyzing: false },
    waste: { requestId: 0, stepTimer: null, analyzing: false }
  };

  /* =============================================================
     GEMINI API CONFIG
     ============================================================= */
  var GEMINI_API_KEY = 'AIzaSyDpuI1li9Q5iRYtJA0HlwE96FnlzxXfuAM';  // Replace with your key from https://aistudio.google.com/apikey
  var GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY;

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
    setTimeout(function () { t.classList.remove('visible'); }, 4000);
  }

  /* =============================================================
     3. MOCK DATA (fallback)
     ============================================================= */
  var FoodPool = [
    { detected: 'Grilled Chicken & Rice', ecoScore: 72, wasteRisk: 'Medium', wasteRiskClass: 'medium', impact: '124g wasted — 0.3 kg CO₂e', recommendation: 'Consider smaller portions next time. Most waste came from the rice.' },
    { detected: 'Pepperoni Pizza & Caesar Salad', ecoScore: 58, wasteRisk: 'High', wasteRiskClass: 'high', impact: '198g wasted — 0.5 kg CO₂e', recommendation: 'Nearly half the salad was left behind. Try a smaller side.' },
    { detected: 'Beef Tacos & Black Beans', ecoScore: 85, wasteRisk: 'Low', wasteRiskClass: 'low', impact: '72g wasted — 0.2 kg CO₂e', recommendation: 'Excellent! Minimal waste. Consider two tacos to save even more.' },
    { detected: 'Salmon Fillet & Quinoa Bowl', ecoScore: 81, wasteRisk: 'Low', wasteRiskClass: 'low', impact: '85g wasted — 0.2 kg CO₂e', recommendation: 'The fruit cup had the most waste. Grab a smaller one.' }
  ];

  var WastePool = [
    { detected: 'Plastic Bottle', correctBin: 'Recycling', binClass: 'recycle', contamRisk: 'Low', contamClass: 'low', confidence: 96, recommendation: 'Rinse before disposal. Remove cap and label if possible.' },
    { detected: 'Banana Peel', correctBin: 'Compost', binClass: 'compost', contamRisk: 'Low', contamClass: 'low', confidence: 98, recommendation: 'Breaks down in 2–5 weeks. Great for compost.' },
    { detected: 'Dirty Napkin', correctBin: 'Landfill', binClass: 'landfill', contamRisk: 'Medium', contamClass: 'medium', confidence: 91, recommendation: 'Food-soiled paper can\'t be recycled. Use cloth napkins.' },
    { detected: 'Aluminum Can', correctBin: 'Recycling', binClass: 'recycle', contamRisk: 'Low', contamClass: 'low', confidence: 97, recommendation: 'Infinitely recyclable. Rinse before disposing.' },
    { detected: 'Styrofoam Container', correctBin: 'Landfill', binClass: 'landfill', contamRisk: 'High', contamClass: 'high', confidence: 93, recommendation: 'Polystyrene isn\'t recyclable in most programs. Avoid it.' },
    { detected: 'Cardboard Tray', correctBin: 'Recycling', binClass: 'recycle', contamRisk: 'Low', contamClass: 'low', confidence: 94, recommendation: 'Clean cardboard is recyclable. Flatten to save space.' }
  ];

  var _foodIdx = 0;
  var _wasteIdx = 0;

  /* =============================================================
     4. GEMINI API CALLS
     ============================================================= */
  function fetchFoodAnalysis() {
    var dataUrl = $('food-preview').src;
    var base64 = dataUrl.split(',')[1];
    var mimeMatch = dataUrl.match(/^data:(image\/\w+);/);
    var mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    var prompt = 'You are a food waste analysis AI. Analyze this photo of a meal/plate. ' +
      'Return ONLY valid JSON (no markdown, no code fences) with these exact fields: ' +
      '"detected" (string — name of the dish, e.g. "Grilled Chicken & Rice"), ' +
      '"ecoScore" (integer 0-100 — sustainability/eco score, higher = less wasteful), ' +
      '"wasteRisk" (string — "Low", "Medium", or "High"), ' +
      '"wasteRiskClass" (string — "low", "medium", or "high"), ' +
      '"impact" (string — estimated waste in grams and CO2 equivalent, e.g. "124g wasted — 0.3 kg CO₂e"), ' +
      '"recommendation" (string — one actionable tip to reduce waste for this specific meal). ' +
      'If the image is not food, set detected to "Not a food item" with ecoScore 0 and wasteRisk "High".';

    var body = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64 } }
        ]
      }]
    };

    return fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Gemini API error: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var text = data.candidates[0].content.parts[0].text;
        text = text.replace(/```json\s*/i, '').replace(/```\s*$/i, '').trim();
        var parsed = JSON.parse(text);
        return {
          detected: parsed.detected || 'Unknown Item',
          ecoScore: parseInt(parsed.ecoScore) || 50,
          wasteRisk: parsed.wasteRisk || 'Medium',
          wasteRiskClass: parsed.wasteRiskClass || 'medium',
          impact: parsed.impact || 'Unable to estimate',
          recommendation: parsed.recommendation || 'Try to minimize food waste.'
        };
      })
      .catch(function (err) {
        console.error('Gemini analysis failed:', err);
        showToast('AI analysis failed — using demo data.');
        var d = FoodPool[_foodIdx % FoodPool.length];
        _foodIdx++;
        return d;
      });
  }

  function fetchWasteClassification() {
    var dataUrl = $('waste-preview').src;
    var base64 = dataUrl.split(',')[1];
    var mimeMatch = dataUrl.match(/^data:(image\/\w+);/);
    var mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    var prompt = 'You are a waste classification AI. Analyze this photo of a waste/trash item. ' +
      'Return ONLY valid JSON (no markdown, no code fences) with these exact fields: ' +
      '"detected" (string — name of the item, e.g. "Plastic Bottle"), ' +
      '"correctBin" (string — "Recycling", "Compost", or "Landfill"), ' +
      '"binClass" (string — "recycle", "compost", or "landfill"), ' +
      '"contamRisk" (string — "Low", "Medium", or "High"), ' +
      '"contamClass" (string — "low", "medium", or "high"), ' +
      '"confidence" (integer 0-100 — how confident you are in the classification), ' +
      '"recommendation" (string — one actionable tip about proper disposal of this item). ' +
      'If the image is not a waste item, still classify it as best you can.';

    var body = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64 } }
        ]
      }]
    };

    return fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Gemini API error: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var text = data.candidates[0].content.parts[0].text;
        text = text.replace(/```json\s*/i, '').replace(/```\s*$/i, '').trim();
        var parsed = JSON.parse(text);
        return {
          detected: parsed.detected || 'Unknown Item',
          correctBin: parsed.correctBin || 'Landfill',
          binClass: parsed.binClass || 'landfill',
          contamRisk: parsed.contamRisk || 'Medium',
          contamClass: parsed.contamClass || 'medium',
          confidence: parseInt(parsed.confidence) || 80,
          recommendation: parsed.recommendation || 'When in doubt, check local recycling guidelines.'
        };
      })
      .catch(function (err) {
        console.error('Gemini waste classification failed:', err);
        showToast('AI classification failed — using demo data.');
        var d = WastePool[_wasteIdx % WastePool.length];
        _wasteIdx++;
        return d;
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
     6. PER-PANEL: reset / setLoading / onFile
     ============================================================= */
  function resetPanel(mode) {
    var p = _panels[mode];
    if (p.stepTimer) { clearInterval(p.stepTimer); p.stepTimer = null; }
    if (p.analyzing) { p.requestId++; p.analyzing = false; }
    $(mode + '-loading').classList.remove('active');
    $(mode + '-results').classList.remove('active');
    $(mode + '-upload-zone').style.display = '';
    $(mode + '-preview').style.display = 'none';
    $(mode + '-analyze').style.display = 'none';
    $(mode + '-analyze').disabled = false;
    $(mode + '-file').value = '';
    $(mode + '-result-body').innerHTML = '';
  }

  function setPanelLoading(mode, on) {
    if (on) {
      $(mode + '-upload-zone').style.display = 'none';
      $(mode + '-analyze').style.display = 'none';
      $(mode + '-preview').style.display = 'none';
      $(mode + '-loading').classList.add('active');
    } else {
      $(mode + '-loading').classList.remove('active');
    }
  }

  function onPanelFile(mode, e) {
    var f = e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      $(mode + '-preview').src = ev.target.result;
      $(mode + '-preview').style.display = 'block';
      $(mode + '-upload-zone').style.display = 'none';
      $(mode + '-analyze').style.display = 'block';
    };
    reader.readAsDataURL(f);
  }

  /* =============================================================
     7. PER-PANEL: startAnalysis
     ============================================================= */
  function startPanelAnalysis(mode) {
    var p = _panels[mode];
    var preview = $(mode + '-preview');
    if (!preview.src || preview.style.display === 'none') return;
    if (p.analyzing) return;
    p.analyzing = true;

    var btn = $(mode + '-analyze');
    btn.disabled = true;
    var myId = ++p.requestId;

    setPanelLoading(mode, true);

    // Step labels
    var steps = mode === 'food'
      ? ['Identifying food items…', 'Estimating portions…', 'Calculating waste impact…', 'Computing EcoScore…']
      : ['Detecting material type…', 'Analyzing composition…', 'Checking bin rules…', 'Computing confidence…'];
    var si = 0;
    var sub = $(mode + '-load-sub');
    $(mode + '-load-label').textContent = mode === 'food' ? 'Analyzing with Gemini Vision' : 'Classifying waste item';
    sub.textContent = steps[0];
    p.stepTimer = setInterval(function () { si++; if (si < steps.length) sub.textContent = steps[si]; }, 450);

    // Fetch
    var fetchFn = mode === 'food' ? fetchFoodAnalysis : fetchWasteClassification;
    fetchFn().then(function (result) {
      if (myId !== p.requestId) return;
      completePanelAnalysis(mode, result);
    });
  }

  function completePanelAnalysis(mode, result) {
    var p = _panels[mode];
    if (p.stepTimer) { clearInterval(p.stepTimer); p.stepTimer = null; }
    p.analyzing = false;
    setPanelLoading(mode, false);
    $(mode + '-analyze').disabled = false;

    // Score
    var eco = mode === 'food' ? calculateEcoScore(result) : 0;
    var pts = calculatePoints(mode, result, eco);
    updateAggregates(mode, eco, pts);

    // Render
    $(mode + '-result-body').innerHTML = mode === 'food' ? renderFood(result) : renderWaste(result);
    $(mode + '-results').classList.add('active');

    setTimeout(function () {
      if (mode === 'food') {
        var ring = $('eco-fill');
        if (ring) ring.style.strokeDashoffset = 314 - (result.ecoScore / 100) * 314;
        var numEl = $('eco-num');
        if (numEl) animateNum(numEl, 0, result.ecoScore, 900);
      } else {
        var conf = $('conf-fill');
        if (conf) conf.style.width = result.confidence + '%';
      }
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
     10. SCROLL EFFECTS
     ============================================================= */
  function initScrollFx() {
    if ('IntersectionObserver' in window) {
      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.style.opacity = '1'; e.target.style.transform = 'translateY(0)'; }
        });
      }, { threshold: 0.08 });
      document.querySelectorAll('.section').forEach(function (s) {
        s.style.opacity = '0'; s.style.transform = 'translateY(28px)';
        s.style.transition = 'opacity .7s ease, transform .7s ease';
        obs.observe(s);
      });
    }
    window.addEventListener('scroll', function () {
      document.querySelector('.nav').classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
  }

  /* =============================================================
     11. INIT
     ============================================================= */
  function init() {
    loadState();

    // Food panel events
    $('food-file').addEventListener('change', function (e) { onPanelFile('food', e); });
    $('food-analyze').addEventListener('click', function () { startPanelAnalysis('food'); });

    // Waste panel events
    $('waste-file').addEventListener('change', function (e) { onPanelFile('waste', e); });
    $('waste-analyze').addEventListener('click', function () { startPanelAnalysis('waste'); });

    // Hero buttons
    $('btn-food').addEventListener('click', function (e) {
      e.preventDefault();
      $('demo').scrollIntoView({ behavior: 'smooth' });
    });
    $('btn-waste').addEventListener('click', function (e) {
      e.preventDefault();
      $('demo').scrollIntoView({ behavior: 'smooth' });
    });

    // Scroll effects
    initScrollFx();

    // Overlay
    renderOverlay();
  }

  /* =============================================================
     12. PUBLIC API
     ============================================================= */
  window.Scanner = {
    resetPanel: resetPanel
  };

  document.addEventListener('DOMContentLoaded', init);
})();
