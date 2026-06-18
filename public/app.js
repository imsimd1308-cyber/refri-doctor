const ingredientForm = document.querySelector("#ingredientForm");
const ingredientInput = document.querySelector("#ingredientInput");
const ingredientChips = document.querySelector("#ingredientChips");
const ingredientCount = document.querySelector("#ingredientCount");
const clearButton = document.querySelector("#clearButton");
const recommendButton = document.querySelector("#recommendButton");
const results = document.querySelector("#results");
const stylePicker = document.querySelector("#stylePicker");
const recipeTemplate = document.querySelector("#recipeTemplate");

const MAX_INGREDIENTS = 5;
const DAILY_RECOMMENDATION_LIMIT = 10;
const USAGE_KEY = "naengteol-doctor-usage";
let ingredients = [];
let selectedStyle = "간단식";
let currentRecommendations = [];

function normalize(value) {
  return value.trim().replace(/\s+/g, "");
}

function addIngredient(value) {
  const item = normalize(value);
  if (!item || ingredients.includes(item) || ingredients.length >= MAX_INGREDIENTS) return;
  ingredients = [...ingredients, item];
  renderIngredients();
}

function addIngredients(value) {
  value
    .split(/[,\s/]+/)
    .map(normalize)
    .filter(Boolean)
    .forEach(addIngredient);
}

function removeIngredient(item) {
  ingredients = ingredients.filter((ingredient) => ingredient !== item);
  renderIngredients();
}

function renderIngredients() {
  ingredientChips.innerHTML = "";
  ingredientCount.textContent = ingredients.length;
  recommendButton.disabled = ingredients.length < 3;

  ingredients.forEach((item) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = item;

    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `${item} 삭제`);
    button.textContent = "x";
    button.addEventListener("click", () => removeIngredient(item));

    chip.append(button);
    ingredientChips.append(chip);
  });
}

function setLoading(isLoading) {
  recommendButton.disabled = isLoading || ingredients.length < 3;
  recommendButton.textContent = isLoading ? "냉장고 분석 중..." : "추천받기";
}

function renderMessage(message) {
  results.innerHTML = `<div class="empty-state">${message}</div>`;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getUsage() {
  try {
    const usage = JSON.parse(localStorage.getItem(USAGE_KEY) || "{}");
    if (usage.date === getTodayKey() && Number.isInteger(usage.count)) return usage;
  } catch {
    // Ignore broken local storage data and start a fresh counter.
  }

  return { date: getTodayKey(), count: 0 };
}

function saveUsage(usage) {
  localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
}

function hasDailyQuota() {
  return getUsage().count < DAILY_RECOMMENDATION_LIMIT;
}

function recordRecommendationUse() {
  const usage = getUsage();
  saveUsage({ date: getTodayKey(), count: usage.count + 1 });
}

async function requestRecommendations() {
  const response = await fetch("./api/recommend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ingredients,
      style: selectedStyle
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "추천을 가져오지 못했어요.");
  }

  if (!Array.isArray(data.recommendations) || data.recommendations.length === 0) {
    throw new Error("추천 결과가 비어 있어요. 재료를 조금 다르게 넣어보세요.");
  }

  return data.recommendations.slice(0, 3);
}

async function renderRecommendations() {
  if (ingredients.length < 3) {
    renderMessage("재료를 3개 이상 넣으면 냉털박사가 만들기 쉬운 메뉴 3가지를 골라줘요.");
    return;
  }

  if (!hasDailyQuota()) {
    renderMessage(`오늘 추천 가능 횟수 ${DAILY_RECOMMENDATION_LIMIT}회를 모두 사용했어요. 내일 다시 이용해 주세요.`);
    return;
  }

  setLoading(true);
  renderMessage("입력한 재료와 오늘의 방향을 보고 있어요.");

  try {
    currentRecommendations = await requestRecommendations();
    recordRecommendationUse();
    results.innerHTML = "";

    currentRecommendations.forEach((recipe, index) => {
      const card = recipeTemplate.content.firstElementChild.cloneNode(true);
      card.querySelector(".badge").textContent = recipe.style || selectedStyle;
      card.querySelector(".time").textContent = recipe.time || "20분 안팎";
      card.querySelector("h3").textContent = recipe.name;
      card.querySelector(".recipe-reason").textContent = recipe.reason;
      card.querySelector(".recipe-button").addEventListener("click", () => renderRecipeDetail(index));
      results.append(card);
    });
  } catch (error) {
    renderMessage(`${error.message}<br />Vercel 환경변수에 OPENAI_API_KEY가 설정되어 있는지도 확인해 주세요.`);
  } finally {
    setLoading(false);
  }
}

function renderList(items) {
  return items.map((item) => `<li>${item}</li>`).join("");
}

function renderRecipeDetail(index) {
  const recipe = currentRecommendations[index];
  if (!recipe) return;

  results.innerHTML = `
    <article class="recipe-detail">
      <div class="detail-meta">
        <span>${recipe.time || "20분 안팎"}</span>
        <span>${recipe.level || "쉬움"}</span>
        <span>${recipe.style || selectedStyle}</span>
      </div>
      <h3>${recipe.name}</h3>
      <p class="recipe-reason">${recipe.reason}</p>

      <h4>필요한 재료</h4>
      <ul>${renderList(recipe.required || ingredients)}</ul>

      <h4>있으면 좋은 재료</h4>
      <ul>${renderList(recipe.optional || [])}</ul>

      <h4>만드는 법</h4>
      <ol>${renderList(recipe.steps || [])}</ol>

      <p class="notice">${recipe.tip || "간은 마지막에 보고 조절하면 실패 확률이 낮아져요."}</p>
      <button class="secondary-button" type="button" id="backToResults">다른 추천 보기</button>
      <button class="reset-button" type="button" id="resetAll">처음부터 다시</button>
    </article>
  `;

  document.querySelector("#backToResults").addEventListener("click", renderStoredRecommendations);
  document.querySelector("#resetAll").addEventListener("click", resetAll);
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderStoredRecommendations() {
  results.innerHTML = "";
  currentRecommendations.forEach((recipe, index) => {
    const card = recipeTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector(".badge").textContent = recipe.style || selectedStyle;
    card.querySelector(".time").textContent = recipe.time || "20분 안팎";
    card.querySelector("h3").textContent = recipe.name;
    card.querySelector(".recipe-reason").textContent = recipe.reason;
    card.querySelector(".recipe-button").addEventListener("click", () => renderRecipeDetail(index));
    results.append(card);
  });
}

function resetAll() {
  ingredients = [];
  currentRecommendations = [];
  results.innerHTML = "";
  renderIngredients();
  ingredientInput.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

ingredientForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addIngredients(ingredientInput.value);
  ingredientInput.value = "";
  ingredientInput.focus();
});

document.querySelectorAll("[data-ingredient]").forEach((button) => {
  button.addEventListener("click", () => addIngredient(button.dataset.ingredient));
});

stylePicker.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-style]");
  if (!button) return;

  selectedStyle = button.dataset.style;
  stylePicker.querySelectorAll("button").forEach((item) => {
    const isActive = item === button;
    item.classList.toggle("active", isActive);
    item.setAttribute("aria-checked", String(isActive));
  });
});

clearButton.addEventListener("click", () => {
  resetAll();
});

recommendButton.addEventListener("click", renderRecommendations);

renderIngredients();

