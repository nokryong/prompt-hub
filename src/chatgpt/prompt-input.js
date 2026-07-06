const INPUT_SELECTORS = [
  "#prompt-textarea",
  'div.ProseMirror[contenteditable="true"]',
  'form [contenteditable="true"]'
];

export function findPromptInput() {
  for (const selector of INPUT_SELECTORS) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

export function isPromptInput(target) {
  if (!(target instanceof Element)) return false;
  return INPUT_SELECTORS.some((selector) => target.closest(selector));
}

async function copyToClipboard(text) {
  if (!navigator.clipboard?.writeText) return false;
  await navigator.clipboard.writeText(text);
  return true;
}

export async function insertPromptText(text, { replace = false } = {}) {
  const input = findPromptInput();

  if (!input) {
    const copied = await copyToClipboard(text);
    return {
      ok: false,
      copied,
      reason: copied
        ? "입력창을 찾지 못해 프롬프트를 클립보드에 복사했습니다."
        : "ChatGPT 입력창을 찾지 못했습니다."
    };
  }

  input.focus();

  if (replace) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  const prefix = replace || input.textContent.trim() === "" ? "" : "\n\n";
  const inserted = document.execCommand("insertText", false, `${prefix}${text}`);
  // ProseMirror는 줄바꿈을 <p>로 나누고 textContent에는 줄바꿈 문자가 없으므로
  // 공백을 제거한 뒤 비교해야 여러 줄 프롬프트도 검증된다.
  const normalize = (value) => value.replace(/\s+/g, "");
  const verified = normalize(input.textContent).includes(
    normalize(text).slice(0, 80)
  );

  if (inserted && verified) {
    return { ok: true, copied: false, reason: "입력창에 삽입했습니다." };
  }

  const copied = await copyToClipboard(text);
  return {
    ok: false,
    copied,
    reason: copied
      ? "자동 삽입에 실패해 프롬프트를 클립보드에 복사했습니다."
      : "자동 삽입에 실패했습니다."
  };
}
