const MODEL = "gpt-5.4-mini";

function sendJson(response, status, body) {
  response.status(status).json(body);
}

function extractText(data) {
  if (typeof data.output_text === "string") return data.output_text;

  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

function parseJson(text) {
  const clean = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(clean);
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "POST 요청만 사용할 수 있어요." });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(response, 500, { error: "서버에 OPENAI_API_KEY가 아직 설정되지 않았어요." });
    return;
  }

  const { ingredients, style } = request.body || {};
  const cleanIngredients = Array.isArray(ingredients)
    ? ingredients.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
    : [];

  if (cleanIngredients.length < 3) {
    sendJson(response, 400, { error: "재료를 3개 이상 입력해 주세요." });
    return;
  }

  const prompt = `
사용자가 가진 냉장고 재료와 원하는 방향을 보고 만들기 현실적인 음식 3개를 추천해 주세요.

보유 재료: ${cleanIngredients.join(", ")}
오늘의 방향: ${style || "간단식"}

규칙:
- 한국 가정에서 실제로 만들 수 있는 메뉴를 우선합니다.
- 보유 재료를 최대한 활용합니다.
- 부족한 재료가 너무 많은 메뉴는 피합니다.
- 메뉴 3개는 서로 분명히 달라야 합니다.
- 음식명, 추천 이유, 조리시간, 난이도, 필요한 재료, 있으면 좋은 재료, 단계별 조리법, 팁을 포함합니다.
- 응답은 아래 JSON 형식만 반환합니다. 마크다운이나 설명 문장은 넣지 마세요.

{
  "recommendations": [
    {
      "name": "음식명",
      "style": "간단식|건강식|아이반찬|술안주 중 하나",
      "time": "예: 15분",
      "level": "쉬움|보통",
      "reason": "이 재료로 이 메뉴가 적합한 이유",
      "required": ["재료"],
      "optional": ["있으면 좋은 재료"],
      "steps": ["1단계", "2단계", "3단계", "4단계"],
      "tip": "실패하지 않는 팁"
    }
  ]
}
`;

  try {
    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        instructions: "당신은 실용적인 한국 가정식 레시피를 제안하는 요리 도우미입니다. 반드시 유효한 JSON만 반환합니다.",
        input: prompt,
        max_output_tokens: 1800
      })
    });

    const data = await openaiResponse.json();
    if (!openaiResponse.ok) {
      sendJson(response, openaiResponse.status, {
        error: data.error?.message || "OpenAI API 요청에 실패했어요."
      });
      return;
    }

    const parsed = parseJson(extractText(data));
    const recommendations = Array.isArray(parsed.recommendations)
      ? parsed.recommendations.slice(0, 3)
      : [];

    sendJson(response, 200, { recommendations });
  } catch (error) {
    sendJson(response, 500, {
      error: "추천 결과를 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요."
    });
  }
}
