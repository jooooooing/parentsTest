/* ==============================================================
   QUIZ DATA — loaded from external JSON files
   ============================================================== */
const QUIZ_STAGES = {};

async function loadQuizStage(stageId) {
  if (QUIZ_STAGES[stageId]) return QUIZ_STAGES[stageId];
  const res = await fetch(`data/${stageId}.json`);
  if (!res.ok) throw new Error(`퀴즈 데이터를 불러올 수 없습니다: ${stageId}`);
  const data = await res.json();
  QUIZ_STAGES[stageId] = data;
  return data;
}


/* ==============================================================
   SCORING ENGINE
   ============================================================== */
const Scoring = {
  calculateResults(stageId, answers) {
    const stage = QUIZ_STAGES[stageId];
    const questions = stage.questions;

    let totalCorrect = 0;
    const categoryScores = {};

    stage.categories.forEach(cat => {
      categoryScores[cat.id] = { correct: 0, total: 0, name: cat.name, icon: cat.icon };
    });

    questions.forEach((q, i) => {
      const cat = categoryScores[q.category];
      cat.total++;
      if (answers[i] === q.correct) {
        cat.total && cat.correct++;
        totalCorrect++;
      }
    });

    const pct = Math.round((totalCorrect / questions.length) * 100);
    const personality = stage.personalityTypes.find(t => pct >= t.minPct);

    return {
      totalCorrect,
      totalQuestions: questions.length,
      percentage: pct,
      personality,
      categoryScores
    };
  }
};


/* ==============================================================
   UTILITY — Fisher-Yates shuffle
   ============================================================== */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}


/* ==============================================================
   QUIZ ENGINE — UI + state management
   ============================================================== */
const Quiz = (() => {
  let stageId = "newborn-0-6";
  let currentIndex = 0;
  let answers = [];
  let answered = false;

  function getStage() { return QUIZ_STAGES[stageId]; }

  async function start() {
    try {
      await loadQuizStage(stageId);
    } catch (e) {
      alert(e.message);
      return;
    }
    const stage = getStage();

    // Shuffle questions each time the quiz starts
    stage.questions = shuffleArray(stage.questions);

    currentIndex = 0;
    answers = new Array(stage.questions.length).fill(-1);
    answered = false;

    showScreen("screen-quiz");
    buildCategoryDots();
    renderQuestion();
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function buildCategoryDots() {
    const stage = getStage();
    const container = document.getElementById("categoryDots");
    container.innerHTML = stage.categories
      .map((_, i) => `<span class="cat-dot" data-cat="${i}"></span>`)
      .join("");
  }

  function renderQuestion() {
    const stage = getStage();
    const q = stage.questions[currentIndex];
    const cat = stage.categories.find(c => c.id === q.category);
    answered = false;

    // Update meta
    document.getElementById("questionCount").textContent = `${currentIndex + 1} / ${stage.questions.length}`;
    document.getElementById("categoryLabel").innerHTML = `${cat.icon} ${cat.name}`;

    // Progress
    const pct = ((currentIndex) / stage.questions.length) * 100;
    document.getElementById("progressFill").style.width = `${pct}%`;

    // Category dots
    const catIndex = stage.categories.findIndex(c => c.id === q.category);
    document.querySelectorAll(".cat-dot").forEach((dot, i) => {
      dot.classList.toggle("active", i === catIndex);
      const catId = stage.categories[i].id;
      const catQuestions = stage.questions.filter(qq => qq.category === catId);
      const catFirstIndex = stage.questions.indexOf(catQuestions[0]);
      dot.classList.toggle("done", currentIndex > catFirstIndex + catQuestions.length - 1);
    });

    // Question content
    const letters = ["A", "B", "C", "D"];
    const area = document.getElementById("questionArea");
    area.innerHTML = `
      <p class="question-text">${q.question}</p>
      <ul class="options-list">
        ${q.options.map((opt, i) => `
          <li>
            <button class="option-btn" data-index="${i}" onclick="Quiz.answer(${i})">
              <span class="opt-letter">${letters[i]}</span>
              <span>${opt}</span>
            </button>
          </li>
        `).join("")}
      </ul>
      <div id="explanationSlot"></div>
      <div class="next-area" id="nextArea" style="display:none;">
        <button class="btn btn-primary btn-next" onclick="Quiz.next()">
          ${currentIndex < stage.questions.length - 1 ? "다음 문제 →" : "결과 보기 🎉"}
        </button>
      </div>
    `;
  }

  function answer(selected) {
    if (answered) return;
    answered = true;
    answers[currentIndex] = selected;

    const stage = getStage();
    const q = stage.questions[currentIndex];
    const buttons = document.querySelectorAll(".option-btn");

    buttons.forEach((btn, i) => {
      btn.classList.add("disabled");
      if (i === q.correct) btn.classList.add("correct");
      if (i === selected && selected !== q.correct) btn.classList.add("wrong");
    });

    // Show explanation
    const slot = document.getElementById("explanationSlot");
    slot.innerHTML = `
      <div class="explanation-box">
        <strong>${selected === q.correct ? "✅ 정답!" : "💡 알고 계셨나요?"}</strong>
        ${q.explanation}
      </div>
    `;

    document.getElementById("nextArea").style.display = "flex";
  }

  function next() {
    const stage = getStage();
    if (currentIndex < stage.questions.length - 1) {
      currentIndex++;
      renderQuestion();
    } else {
      showResults();
    }
  }

  function showResults() {
    const results = Scoring.calculateResults(stageId, answers);
    const r = results;
    const p = r.personality;

    document.getElementById("progressFill").style.width = "100%";
    showScreen("screen-results");

    const catBreakdown = Object.values(r.categoryScores).map(cat => {
      const catPct = Math.round((cat.correct / cat.total) * 100);
      return `
        <div class="breakdown-item">
          <span class="cat-icon">${cat.icon}</span>
          <div class="cat-info">
            <div class="cat-name">
              <span>${cat.name}</span>
              <span>${cat.correct}/${cat.total}</span>
            </div>
            <div class="breakdown-bar">
              <div class="breakdown-bar-fill" style="width: 0%" data-target="${catPct}"></div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    document.getElementById("resultsContent").innerHTML = `
      <div class="result-badge" style="background: ${p.color}22;">${p.emoji}</div>
      <h2 class="result-type">${p.name}</h2>
      <p class="result-tier">${p.tagline}</p>

      <div class="score-ring-wrapper">
        <svg class="score-ring" viewBox="0 0 130 130">
          <defs>
            <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="var(--primary)" />
              <stop offset="100%" stop-color="var(--accent)" />
            </linearGradient>
          </defs>
          <circle class="score-ring-bg" cx="65" cy="65" r="55" />
          <circle class="score-ring-fill" cx="65" cy="65" r="55" id="scoreRing" />
        </svg>
        <div class="score-center">
          <div class="score-number" id="scoreAnimated">0%</div>
          <div class="score-label">${r.totalQuestions}문제 중 ${r.totalCorrect}문제 정답</div>
        </div>
      </div>

      <p class="result-description">${p.description}</p>

      <div class="breakdown">
        <h3>영역별 결과</h3>
        ${catBreakdown}
      </div>

      <div class="share-card" id="shareCard">
        <div class="share-card-inner">
          <div class="share-emoji">${p.emoji}</div>
          <div class="share-type">${p.name}</div>
          <div class="share-score">${r.percentage}%</div>
          <div class="share-tagline">${p.tagline}</div>
          <div class="share-brand">아빠, 육아 얼마나 알아? · 테스트 해보기!</div>
        </div>
      </div>

      <div class="cta-section">
        <button class="btn btn-share" onclick="Quiz.share()">
          📤 아내 / 동료 아빠에게 공유하기
        </button>
        <div class="btn-group">
          <button class="btn btn-secondary" onclick="Quiz.copyResult()">📋 결과 복사</button>
          <button class="btn btn-secondary" onclick="Quiz.start()">🔄 다시 풀기</button>
        </div>
      </div>
    `;

    // Animate score ring
    requestAnimationFrame(() => {
      const circumference = 2 * Math.PI * 55; // ~345.6
      const offset = circumference * (1 - r.percentage / 100);
      const ring = document.getElementById("scoreRing");
      if (ring) {
        ring.style.strokeDasharray = circumference;
        ring.style.strokeDashoffset = circumference;
        requestAnimationFrame(() => {
          ring.style.strokeDashoffset = offset;
        });
      }

      // Animate score number
      animateNumber("scoreAnimated", 0, r.percentage, 1500);

      // Animate breakdown bars
      setTimeout(() => {
        document.querySelectorAll(".breakdown-bar-fill").forEach(bar => {
          bar.style.width = bar.dataset.target + "%";
        });
      }, 400);
    });
  }

  function animateNumber(elementId, start, end, duration) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const startTime = performance.now();
    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      el.textContent = current + "%";
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function share() {
    const results = Scoring.calculateResults(stageId, answers);
    const p = results.personality;
    const text = `${p.emoji} 나의 아빠 육아 등급: "${p.name}" (${results.percentage}%)! 너는 몇 점? 도전해봐:`;

    if (navigator.share) {
      navigator.share({
        title: "아빠, 육아 얼마나 알아?",
        text: text,
        url: window.location.href
      }).catch(() => { });
    } else {
      copyToClipboard(text + " " + window.location.href);
      showToast("공유 텍스트가 클립보드에 복사되었습니다!");
    }
  }

  function copyResult() {
    const results = Scoring.calculateResults(stageId, answers);
    const p = results.personality;
    const cats = Object.values(results.categoryScores);
    const breakdown = cats.map(c => `  ${c.icon} ${c.name}: ${c.correct}/${c.total}`).join("\n");
    const text = `${p.emoji} 나의 아빠 육아 등급: ${p.name}\n🏆 점수: ${results.percentage}% (${results.totalCorrect}/${results.totalQuestions})\n\n${breakdown}\n\n"${p.tagline}"\n\n테스트 해보기: ${window.location.href}`;

    copyToClipboard(text);
    showToast("결과가 복사되었습니다! 붙여넣기로 공유하세요 📋");
  }

  function copyToClipboard(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  function showToast(msg) {
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
  }

  function reset() {
    currentIndex = 0;
    answers = [];
    answered = false;
    showScreen("screen-landing");
  }

  return { start, answer, next, share, copyResult, reset };
})();
