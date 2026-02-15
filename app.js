// iWasteOS v0.1
// Public Stable Release
// Static demo build
/* ================================================================
   iWaste — Application Logic
   Pure vanilla JS. Zero dependencies. Backend-ready architecture.
   ================================================================ */

/* ----------------------------------------------------------------
   1. MOCK DATA — FOOD SCAN RESULTS
   Each entry simulates a Gemini Vision food analysis response.
   Future: replace fetchFoodAnalysis() body with real API call.
   ---------------------------------------------------------------- */
var FoodPool = [
  {
    detected: 'Grilled Chicken & Rice',
    ecoScore: 72,
    wasteRisk: 'Medium',
    wasteRiskClass: 'medium',
    impact: '124g wasted — 0.3 kg CO₂e',
    recommendation: 'Consider smaller portions next time. Most waste came from the rice.'
  },
  {
    detected: 'Pepperoni Pizza & Caesar Salad',
    ecoScore: 58,
    wasteRisk: 'High',
    wasteRiskClass: 'high',
    impact: '198g wasted — 0.5 kg CO₂e',
    recommendation: 'Nearly half the salad was left behind. Try a smaller side.'
  },
  {
    detected: 'Beef Tacos & Black Beans',
    ecoScore: 85,
    wasteRisk: 'Low',
    wasteRiskClass: 'low',
    impact: '72g wasted — 0.2 kg CO₂e',
    recommendation: 'Excellent! Minimal waste. Consider two tacos to save even more.'
  },
  {
    detected: 'Salmon Fillet & Quinoa Bowl',
    ecoScore: 81,
    wasteRisk: 'Low',
    wasteRiskClass: 'low',
    impact: '85g wasted — 0.2 kg CO₂e',
    recommendation: 'The fruit cup had the most waste. Grab a smaller one.'
  }
];

/* ----------------------------------------------------------------
   2. MOCK DATA — WASTE CLASSIFICATION RESULTS
   ---------------------------------------------------------------- */
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

/* ----------------------------------------------------------------
   3. ASYNC AI SIMULATION FUNCTIONS
   Promise-based, isolated. Swap body with fetch() in Phase 2.
   ---------------------------------------------------------------- */

/** @returns {Promise<Object>} Simulated food analysis */
async function fetchFoodAnalysis() {
  return new Promise(function(resolve) {
    var d = FoodPool[_foodIdx % FoodPool.length];
    _foodIdx++;
    setTimeout(function() { resolve(d); }, 1800 + Math.random() * 400);
  });
}

/** @returns {Promise<Object>} Simulated waste classification */
async function fetchWasteClassification() {
  return new Promise(function(resolve) {
    var d = WastePool[_wasteIdx % WastePool.length];
    _wasteIdx++;
    setTimeout(function() { resolve(d); }, 1500 + Math.random() * 500);
  });
}

/* ----------------------------------------------------------------
   4. UI HELPERS
   ---------------------------------------------------------------- */

function animateNum(el, from, to, dur) {
  var start = performance.now();
  (function tick(now) {
    var p = Math.min((now - start) / dur, 1);
    el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  })(performance.now());
}

/* ----------------------------------------------------------------
   5. SCANNER CONTROLLER
   ---------------------------------------------------------------- */
var Scanner = {
  mode: null,

  init: function() {
    document.getElementById('tab-food').addEventListener('click', function() { Scanner.setMode('food'); });
    document.getElementById('tab-waste').addEventListener('click', function() { Scanner.setMode('waste'); });
    document.getElementById('btn-food').addEventListener('click', function(e) {
      e.preventDefault();
      document.getElementById('demo').scrollIntoView({ behavior: 'smooth' });
      setTimeout(function() { Scanner.setMode('food'); }, 500);
    });
    document.getElementById('btn-waste').addEventListener('click', function(e) {
      e.preventDefault();
      document.getElementById('demo').scrollIntoView({ behavior: 'smooth' });
      setTimeout(function() { Scanner.setMode('waste'); }, 500);
    });
    document.getElementById('scan-file').addEventListener('change', Scanner.onFile);
    document.getElementById('scan-analyze').addEventListener('click', Scanner.analyze);
    document.getElementById('scan-again').addEventListener('click', function() { Scanner.reset(); });
    Scanner.setMode('food');
  },

  setMode: function(mode) {
    Scanner.mode = mode;
    Scanner.reset();
    document.getElementById('tab-food').classList.toggle('active', mode === 'food');
    document.getElementById('tab-waste').classList.toggle('active', mode === 'waste');
    document.getElementById('demo-title-text').textContent =
      mode === 'food' ? 'Food Mode — Scan Your Plate' : 'Waste Mode — Classify Your Trash';
  },

  reset: function() {
    document.getElementById('scan-loading').classList.remove('active');
    document.getElementById('scan-results').classList.remove('active');
    document.getElementById('scan-upload-zone').style.display = '';
    document.getElementById('scan-preview').style.display = 'none';
    document.getElementById('scan-analyze').style.display = 'none';
    document.getElementById('scan-file').value = '';
    document.getElementById('scan-result-body').innerHTML = '';
  },

  onFile: function(e) {
    var f = e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      document.getElementById('scan-preview').src = ev.target.result;
      document.getElementById('scan-preview').style.display = 'block';
      document.getElementById('scan-upload-zone').style.display = 'none';
      document.getElementById('scan-analyze').style.display = 'block';
    };
    reader.readAsDataURL(f);
  },

  analyze: async function() {
    var btn = document.getElementById('scan-analyze');
    btn.disabled = true;
    document.getElementById('scan-preview').style.display = 'none';
    btn.style.display = 'none';
    var loading = document.getElementById('scan-loading');
    loading.classList.add('active');

    var steps = Scanner.mode === 'food'
      ? ['Identifying food items…','Estimating portions…','Calculating waste impact…','Computing EcoScore…']
      : ['Detecting material type…','Analyzing composition…','Checking bin rules…','Computing confidence…'];
    var si = 0;
    var sub = document.getElementById('load-sub');
    document.getElementById('load-label').textContent = Scanner.mode === 'food' ? 'Analyzing with Gemini Vision' : 'Classifying waste item';
    sub.textContent = steps[0];
    var iv = setInterval(function() { si++; if (si < steps.length) sub.textContent = steps[si]; }, 450);

    var result = Scanner.mode === 'food' ? await fetchFoodAnalysis() : await fetchWasteClassification();
    clearInterval(iv);
    loading.classList.remove('active');
    btn.disabled = false;

    document.getElementById('scan-result-body').innerHTML =
      Scanner.mode === 'food' ? Scanner.renderFood(result) : Scanner.renderWaste(result);
    document.getElementById('scan-results').classList.add('active');

    setTimeout(function() {
      var ring = document.getElementById('eco-fill');
      if (ring) ring.style.strokeDashoffset = 314 - (result.ecoScore / 100) * 314;
      var numEl = document.getElementById('eco-num');
      if (numEl) animateNum(numEl, 0, result.ecoScore, 900);
      var conf = document.getElementById('conf-fill');
      if (conf) conf.style.width = result.confidence + '%';
    }, 60);
  },

  renderFood: function(d) {
    var clr = d.ecoScore >= 70 ? 'var(--green)' : d.ecoScore >= 50 ? 'var(--amber)' : 'var(--red)';
    var cls = d.ecoScore >= 70 ? 'green' : d.ecoScore >= 50 ? 'amber' : 'red';
    var h = '<div class="eco-block"><div class="eco-ring"><svg viewBox="0 0 110 110">' +
      '<circle cx="55" cy="55" r="50" class="track"/>' +
      '<circle cx="55" cy="55" r="50" class="fill" id="eco-fill" style="stroke:' + clr + '" transform="rotate(-90 55 55)"/>' +
      '</svg><div class="num" id="eco-num" style="color:' + clr + '">0</div></div><div class="eco-label">ECOSCORE</div></div>';
    h += '<div class="r-cards">';
    h += '<div class="r-card"><h4>Detected Item</h4><div class="val">' + d.detected + '</div></div>';
    h += '<div class="r-card"><h4>Waste Risk</h4><span class="risk-badge ' + d.wasteRiskClass + '">' + d.wasteRisk + '</span><p style="color:var(--txt2);margin-top:8px;font-size:13px">' + d.impact + '</p></div>';
    h += '<div class="tip-box"><span class="tip-icon">💡</span><span>' + d.recommendation + '</span></div>';
    h += '</div>';
    return h;
  },

  renderWaste: function(d) {
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
};

/* ----------------------------------------------------------------
   6. SCROLL EFFECTS + NAV
   ---------------------------------------------------------------- */
var ScrollFx = {
  init: function() {
    // Section reveal
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
    // Nav scroll state
    window.addEventListener('scroll', function() {
      document.querySelector('.nav').classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });
  }
};

/* ----------------------------------------------------------------
   7. INIT
   ---------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function() {
  Scanner.init();
  ScrollFx.init();
});
