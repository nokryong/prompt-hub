import { useSyncExternalStore } from "react";

// 하이브리드 저장 구조
// - 텍스트(제목/설명/프롬프트/태그/플래그): chrome.storage.sync, 프롬프트당 1키
//   (구글 계정으로 기기 간 동기화. 항목당 8KB, 전체 100KB 제한)
// - 썸네일: chrome.storage.local의 맵 (용량이 커서 sync에 못 넣음 → 기기별 보관)
// - sync 용량/횟수 초과 시: 해당 프롬프트만 local(overflow)로 대피 (유실 방지)
const SYNC_PREFIX = "prompt:";
const THUMBS_KEY = "thumbnails";
const OVERFLOW_KEY = "prompts-overflow";
const LEGACY_LOCAL_KEY = "prompts"; // 이전 버전: local 단일 키에 전체 배열
const SEEDED_KEY = "seeded";
const DEV_STORAGE_KEY = "prompts"; // window.localStorage (개발 페이지 폴백)
const EXPORT_SCHEMA_VERSION = 1;

const DEFAULT_PROMPTS = [
  {
    id: "preset-watercolor",
    title: "수채화",
    description: "부드러운 번짐과 종이 질감이 살아 있는 수채화 스타일",
    prompt:
      "Illustrate in a soft watercolor style: gentle pastel palette, visible paper grain, loose expressive brush strokes, colors bleeding softly at the edges.",
    tags: ["watercolor", "soft", "illustration"]
  },
  {
    id: "preset-anime",
    title: "애니메이션",
    description: "선명한 셀 셰이딩과 역동적인 일본 애니메이션 스타일",
    prompt:
      "Illustrate in a Japanese anime style: clean line art, vivid cel shading, expressive eyes, dynamic composition, detailed background with soft lighting.",
    tags: ["anime", "cel-shading", "character"]
  },
  {
    id: "preset-pixel",
    title: "픽셀 아트",
    description: "레트로 게임 감성의 선명한 픽셀 그래픽",
    prompt:
      "Illustrate as retro pixel art: 32-bit era video game aesthetic, limited color palette, crisp dithering, chunky pixels, nostalgic arcade mood.",
    tags: ["pixel", "retro", "game"]
  },
  {
    id: "preset-oil",
    title: "유화",
    description: "두꺼운 붓터치와 명암 대비가 강한 클래식 유화",
    prompt:
      "Illustrate as a classical oil painting: thick impasto brush strokes, rich warm tones, dramatic chiaroscuro lighting, visible canvas texture.",
    tags: ["oil", "painting", "classic"]
  }
];

const syncArea = globalThis.chrome?.storage?.sync;
const localArea = globalThis.chrome?.storage?.local;
const hasChromeStorage = Boolean(syncArea && localArea);

const EMPTY = [];
let cache = null;
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

function normalizePrompt(prompt, fallbackIndex = 0) {
  const now = Date.now();
  const title =
    typeof prompt?.title === "string" && prompt.title.trim()
      ? prompt.title.trim()
      : `프롬프트 ${fallbackIndex + 1}`;
  const body =
    typeof prompt?.prompt === "string" && prompt.prompt.trim()
      ? prompt.prompt.trim()
      : "";

  return {
    id:
      typeof prompt?.id === "string" && prompt.id.trim()
        ? prompt.id
        : crypto.randomUUID(),
    title,
    description:
      typeof prompt?.description === "string" ? prompt.description.trim() : "",
    prompt: body,
    thumbnail: typeof prompt?.thumbnail === "string" ? prompt.thumbnail : null,
    tags: Array.isArray(prompt?.tags)
      ? prompt.tags.filter((tag) => typeof tag === "string" && tag.trim())
      : [],
    isFavorite: Boolean(prompt?.isFavorite),
    isPublic: Boolean(prompt?.isPublic),
    usageCount: Number.isFinite(prompt?.usageCount) ? prompt.usageCount : 0,
    createdAt: Number.isFinite(prompt?.createdAt) ? prompt.createdAt : now,
    updatedAt: Number.isFinite(prompt?.updatedAt) ? prompt.updatedAt : now
  };
}

function normalizePrompts(prompts) {
  if (!Array.isArray(prompts)) return [];
  return prompts
    .map(normalizePrompt)
    .filter((prompt) => prompt.prompt.trim() !== "");
}

// --- 저장 계층 ---

function stripThumbnail(prompt) {
  const rest = { ...prompt };
  delete rest.thumbnail;
  return rest;
}

function devWriteAll() {
  window.localStorage.setItem(DEV_STORAGE_KEY, JSON.stringify(cache ?? []));
}

async function readLocalMap(key) {
  const result = await localArea.get(key);
  return result[key] ?? {};
}

async function writeLocalMap(key, map) {
  await localArea.set({ [key]: map });
}

async function saveThumbnail(id, thumbnail) {
  const thumbs = await readLocalMap(THUMBS_KEY);
  if (thumbs[id] === (thumbnail ?? undefined)) return;
  if (thumbnail) {
    thumbs[id] = thumbnail;
  } else {
    delete thumbs[id];
  }
  await writeLocalMap(THUMBS_KEY, thumbs);
}

// 썸네일을 제외한 본문을 sync에 저장. 실패(용량/횟수 초과) 시 local로 대피.
async function persistOne(bare) {
  const overflow = await readLocalMap(OVERFLOW_KEY);
  try {
    await syncArea.set({ [SYNC_PREFIX + bare.id]: bare });
    if (overflow[bare.id]) {
      delete overflow[bare.id];
      await writeLocalMap(OVERFLOW_KEY, overflow);
    }
  } catch {
    overflow[bare.id] = bare;
    await writeLocalMap(OVERFLOW_KEY, overflow);
  }
}

async function persistPrompt(prompt) {
  if (!hasChromeStorage) {
    devWriteAll();
    return;
  }
  await persistOne(stripThumbnail(prompt));
  await saveThumbnail(prompt.id, prompt.thumbnail ?? null);
}

async function persistMany(prompts) {
  if (!hasChromeStorage) {
    devWriteAll();
    return;
  }

  const payload = {};
  prompts.forEach((prompt) => {
    payload[SYNC_PREFIX + prompt.id] = stripThumbnail(prompt);
  });

  if (Object.keys(payload).length) {
    try {
      await syncArea.set(payload);
    } catch {
      // 한 번에 저장이 실패하면 개별 저장으로 재시도 (실패분은 overflow로)
      for (const prompt of prompts) {
        await persistOne(stripThumbnail(prompt));
      }
    }
  }

  const thumbs = await readLocalMap(THUMBS_KEY);
  let thumbsChanged = false;
  prompts.forEach((prompt) => {
    if (prompt.thumbnail && thumbs[prompt.id] !== prompt.thumbnail) {
      thumbs[prompt.id] = prompt.thumbnail;
      thumbsChanged = true;
    }
  });
  if (thumbsChanged) await writeLocalMap(THUMBS_KEY, thumbs);
}

async function deleteStored(id) {
  if (!hasChromeStorage) {
    devWriteAll();
    return;
  }
  try {
    await syncArea.remove(SYNC_PREFIX + id);
  } catch {
    // 삭제 실패는 다음 저장 때 자연 복구되므로 무시
  }
  const overflow = await readLocalMap(OVERFLOW_KEY);
  if (overflow[id]) {
    delete overflow[id];
    await writeLocalMap(OVERFLOW_KEY, overflow);
  }
  await saveThumbnail(id, null);
}

async function clearAllStored() {
  if (!hasChromeStorage) return;
  const syncItems = await syncArea.get(null);
  const keys = Object.keys(syncItems).filter((key) =>
    key.startsWith(SYNC_PREFIX)
  );
  if (keys.length) await syncArea.remove(keys);
  await localArea.set({ [THUMBS_KEY]: {}, [OVERFLOW_KEY]: {} });
}

async function init() {
  if (!hasChromeStorage) {
    const raw = window.localStorage.getItem(DEV_STORAGE_KEY);
    if (raw) {
      cache = normalizePrompts(JSON.parse(raw));
    } else {
      cache = normalizePrompts(DEFAULT_PROMPTS);
      devWriteAll();
    }
    emit();
    return;
  }

  const [syncItems, localItems] = await Promise.all([
    syncArea.get(null),
    localArea.get([THUMBS_KEY, OVERFLOW_KEY, LEGACY_LOCAL_KEY, SEEDED_KEY])
  ]);

  const thumbs = localItems[THUMBS_KEY] ?? {};
  const overflow = localItems[OVERFLOW_KEY] ?? {};
  const byId = new Map();

  Object.entries(syncItems).forEach(([key, value]) => {
    if (key.startsWith(SYNC_PREFIX) && value?.id) byId.set(value.id, value);
  });
  // overflow(동기화 실패분)가 sync의 옛 사본보다 최신
  Object.values(overflow).forEach((prompt) => byId.set(prompt.id, prompt));

  // 이전 버전(local 단일 키) 데이터 마이그레이션
  const legacy = Array.isArray(localItems[LEGACY_LOCAL_KEY])
    ? normalizePrompts(localItems[LEGACY_LOCAL_KEY])
    : [];
  const migrated = legacy.filter((prompt) => !byId.has(prompt.id));
  migrated.forEach((prompt) => {
    if (prompt.thumbnail) thumbs[prompt.id] = prompt.thumbnail;
    byId.set(prompt.id, stripThumbnail(prompt));
  });

  let prompts = [...byId.values()].map((prompt) => ({
    ...prompt,
    thumbnail: thumbs[prompt.id] ?? null
  }));

  // 최초 설치(마이그레이션 대상도 없음)에만 기본 프롬프트 시드
  if (prompts.length === 0 && !localItems[SEEDED_KEY]) {
    prompts = DEFAULT_PROMPTS;
  }

  prompts = normalizePrompts(prompts);
  prompts.sort((a, b) => a.createdAt - b.createdAt);
  cache = prompts;
  emit();

  if (migrated.length || !localItems[SEEDED_KEY]) {
    await persistMany(cache);
    await localArea.set({ [SEEDED_KEY]: true });
  }
  if (localItems[LEGACY_LOCAL_KEY] !== undefined) {
    await localArea.remove(LEGACY_LOCAL_KEY);
  }
}

// 다른 기기(sync) 또는 다른 탭에서의 변경을 반영
globalThis.chrome?.storage?.onChanged?.addListener((changes, areaName) => {
  if (!cache) return;

  if (areaName === "sync") {
    let next = [...cache];
    let touched = false;

    for (const [key, change] of Object.entries(changes)) {
      if (!key.startsWith(SYNC_PREFIX)) continue;
      touched = true;
      const id = key.slice(SYNC_PREFIX.length);

      if (change.newValue === undefined) {
        next = next.filter((prompt) => prompt.id !== id);
      } else {
        const index = next.findIndex((prompt) => prompt.id === id);
        const merged = {
          ...change.newValue,
          thumbnail: index >= 0 ? next[index].thumbnail : null
        };
        if (index >= 0) {
          next[index] = merged;
        } else {
          next.push(merged);
        }
      }
    }

    if (touched) {
      cache = normalizePrompts(next);
      emit();
    }
    return;
  }

  if (areaName === "local" && changes[THUMBS_KEY]) {
    const thumbs = changes[THUMBS_KEY].newValue ?? {};
    cache = cache.map((prompt) => ({
      ...prompt,
      thumbnail: thumbs[prompt.id] ?? null
    }));
    emit();
  }
});

void init();

export function getPrompts() {
  return cache ?? EMPTY;
}

export function subscribePrompts(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePrompts() {
  return useSyncExternalStore(subscribePrompts, getPrompts);
}

export async function addPrompt({
  title,
  description = "",
  prompt,
  thumbnail = null,
  tags = []
}) {
  const now = Date.now();
  const created = normalizePrompt({
    id: crypto.randomUUID(),
    title,
    description,
    prompt,
    thumbnail,
    tags,
    isFavorite: false,
    isPublic: false,
    usageCount: 0,
    createdAt: now,
    updatedAt: now
  });

  cache = [...getPrompts(), created];
  emit();
  await persistPrompt(created);
  return cache;
}

export async function updatePrompt(id, patch) {
  const now = Date.now();
  let updated = null;

  cache = getPrompts().map((prompt) => {
    if (prompt.id !== id) return prompt;
    updated = normalizePrompt({ ...prompt, ...patch, updatedAt: now });
    return updated;
  });
  emit();

  if (updated) await persistPrompt(updated);
  return cache;
}

export async function removePrompt(id) {
  cache = getPrompts().filter((prompt) => prompt.id !== id);
  emit();
  await deleteStored(id);
  return cache;
}

export async function recordPromptUse(id) {
  // updatedAt은 건드리지 않는다 — 사용해도 목록 순서와 수정 날짜가 바뀌지 않게.
  let updated = null;

  cache = getPrompts().map((prompt) => {
    if (prompt.id !== id) return prompt;
    updated = { ...prompt, usageCount: prompt.usageCount + 1 };
    return updated;
  });
  emit();

  if (updated) await persistPrompt(updated);
  return cache;
}

export function sortFavoritesFirst(prompts) {
  return [...prompts].sort((a, b) => {
    const favoriteDelta = (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0);
    if (favoriteDelta) return favoriteDelta;
    return b.updatedAt - a.updatedAt;
  });
}

export function searchPrompts(query) {
  const prompts = getPrompts();
  const q = query.trim().toLowerCase();
  if (!q) return sortFavoritesFirst(prompts);

  return sortFavoritesFirst(
    prompts.filter((prompt) => {
      const haystack = [
        prompt.title,
        prompt.description,
        prompt.prompt,
        ...(prompt.tags ?? [])
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    })
  );
}

export function buildExportPayload() {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    prompts: getPrompts()
  };
}

export async function importPromptsPayload(payload, { mode = "merge" } = {}) {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.prompts)
      ? payload.prompts
      : null;

  if (!source) {
    throw new Error("가져올 프롬프트 목록을 찾지 못했습니다.");
  }

  const imported = normalizePrompts(source);
  if (imported.length === 0) {
    throw new Error("가져올 수 있는 프롬프트가 없습니다.");
  }

  if (mode === "replace") {
    cache = imported;
    emit();
    await clearAllStored();
    await persistMany(imported);
    return cache;
  }

  const existing = getPrompts();
  const seenIds = new Set(existing.map((prompt) => prompt.id));
  const incoming = imported.map((prompt) =>
    seenIds.has(prompt.id) ? { ...prompt, id: crypto.randomUUID() } : prompt
  );

  cache = [...existing, ...incoming];
  emit();
  await persistMany(incoming);
  return cache;
}
