import { useMemo, useRef, useState } from "react";
import {
  FiCheck,
  FiCopy,
  FiDownload,
  FiEdit3,
  FiImage,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiUpload
} from "react-icons/fi";
import {
  IoBookmark,
  IoBookmarkOutline,
  IoEyeOffOutline,
  IoEyeOutline,
  IoSend
} from "react-icons/io5";
import { fileToThumbnail } from "../../lib/images";
import {
  addPrompt,
  buildExportPayload,
  importPromptsPayload,
  recordPromptUse,
  removePrompt,
  sortFavoritesFirst,
  updatePrompt,
  usePrompts
} from "../../lib/prompts";
import { insertPromptText } from "../../chatgpt/prompt-input";

const PLACEHOLDER_THUMB =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180"><rect width="100%" height="100%" fill="#f1f5f9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="Arial" font-size="18">PromptHub</text></svg>'
  );

const EMPTY_FORM = {
  title: "",
  description: "",
  prompt: "",
  tags: "",
  thumbnail: null
};

function toForm(prompt) {
  if (!prompt) return EMPTY_FORM;
  return {
    title: prompt.title,
    description: prompt.description ?? "",
    prompt: prompt.prompt,
    tags: (prompt.tags ?? []).join(", "),
    thumbnail: prompt.thumbnail ?? null
  };
}

function parseTags(value) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function downloadJson(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `prompthub-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatDate(timestamp) {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(timestamp);
}

export default function PromptsCollapse() {
  const prompts = usePrompts();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [mode, setMode] = useState("detail");
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const fileInputRef = useRef(null);
  const importInputRef = useRef(null);

  const filteredPrompts = useMemo(() => {
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
  }, [prompts, query]);
  const selectedPrompt = useMemo(() => {
    return prompts.find((prompt) => prompt.id === selectedId) ?? filteredPrompts[0];
  }, [filteredPrompts, prompts, selectedId]);

  const canSave = form.title.trim() !== "" && form.prompt.trim() !== "";

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
  }

  async function handleThumbnailChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      updateForm("thumbnail", await fileToThumbnail(file));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!canSave) {
      setError("제목과 프롬프트 본문을 입력해 주세요.");
      return;
    }

    const payload = {
      title: form.title,
      description: form.description,
      prompt: form.prompt,
      thumbnail: form.thumbnail,
      tags: parseTags(form.tags)
    };

    const next = mode === "edit"
      ? await updatePrompt(selectedPrompt.id, payload)
      : await addPrompt(payload);
    const saved = mode === "edit"
      ? next.find((prompt) => prompt.id === selectedPrompt.id)
      : next[next.length - 1];

    setSelectedId(saved?.id ?? null);
    setMode("detail");
  }

  async function handleUsePrompt() {
    if (!selectedPrompt) return;
    const result = await insertPromptText(selectedPrompt.prompt);
    if (result.ok) {
      await recordPromptUse(selectedPrompt.id);
    } else {
      setError(result.reason);
    }
  }

  async function handleCopyPrompt() {
    if (!selectedPrompt) return;
    await navigator.clipboard?.writeText(selectedPrompt.prompt);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await removePrompt(deleteTarget);
    setDeleteTarget(null);
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const payload = JSON.parse(await file.text());
      const next = await importPromptsPayload(payload, { mode: "merge" });
      setSelectedId(next[next.length - 1]?.id ?? null);
    } catch (err) {
      setError(err.message || "백업 파일을 가져오지 못했습니다.");
    }
  }

  const promptCountText = `${prompts.length}개 저장됨`;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-50">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleThumbnailChange}
      />
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImport}
      />

      <div className="shrink-0 space-y-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold leading-tight text-slate-950">
              내 프롬프트
            </h2>
            <p className="text-xs text-slate-500">{promptCountText}</p>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
            onClick={() => {
              setForm(EMPTY_FORM);
              setMode("new");
              setSelectedId(null);
              setError("");
            }}
          >
            <FiPlus size={14} />
            추가
          </button>
        </div>

        <label className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500 focus-within:border-slate-400 focus-within:bg-white">
          <FiSearch size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="제목, 태그, 프롬프트 검색"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 active:scale-[0.98]"
            onClick={() => downloadJson(buildExportPayload())}
          >
            <FiDownload size={13} />
            내보내기
          </button>
          <button
            type="button"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100 active:scale-[0.98]"
            onClick={() => importInputRef.current?.click()}
          >
            <FiUpload size={13} />
            가져오기
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(160px,42%)_1fr]">
        <div className="min-h-0 overflow-y-auto border-b border-slate-200 p-3">
          {filteredPrompts.length > 0 ? (
            <div className="space-y-2">
              {filteredPrompts.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  className={`grid w-full grid-cols-[56px_1fr] gap-3 rounded-lg border p-2 text-left transition hover:border-slate-300 hover:bg-white active:scale-[0.99] ${
                    selectedPrompt?.id === prompt.id
                      ? "border-slate-400 bg-white shadow-sm"
                      : "border-transparent bg-transparent"
                  }`}
                  onClick={() => {
                    setSelectedId(prompt.id);
                    setMode("detail");
                    setDeleteTarget(null);
                    setError("");
                  }}
                >
                  <img
                    src={prompt.thumbnail || PLACEHOLDER_THUMB}
                    alt={`${prompt.title} 썸네일`}
                    className="h-14 w-14 rounded-md object-cover"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-slate-950">
                        {prompt.title}
                      </span>
                      {prompt.isFavorite ? (
                        <IoBookmark className="shrink-0 text-amber-500" size={13} />
                      ) : null}
                    </span>
                    <span className="line-clamp-2 text-xs leading-5 text-slate-500">
                      {prompt.description || prompt.prompt}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex h-full min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-4 text-center">
              <p className="text-sm font-semibold text-slate-900">
                검색 결과가 없습니다.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                다른 키워드를 입력하거나 새 프롬프트를 추가하세요.
              </p>
            </div>
          )}
        </div>

        <div className="min-h-0 overflow-y-auto bg-white p-4">
          {mode === "new" || mode === "edit" ? (
            <form className="space-y-3" onSubmit={handleSave}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-950">
                  {mode === "edit" ? "프롬프트 수정" : "새 프롬프트"}
                </h3>
                <button
                  type="button"
                  className="text-xs font-medium text-slate-500 hover:text-slate-900"
                  onClick={() => setMode("detail")}
                >
                  취소
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  aria-label="썸네일 선택"
                  className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-slate-300 hover:bg-slate-100"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {form.thumbnail ? (
                    <img
                      src={form.thumbnail}
                      alt="선택한 썸네일"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <FiImage size={18} />
                  )}
                </button>
                <div className="min-w-0 flex-1 space-y-2">
                  <input
                    value={form.title}
                    onChange={(event) => updateForm("title", event.target.value)}
                    placeholder="제목"
                    className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                  />
                  <input
                    value={form.description}
                    onChange={(event) =>
                      updateForm("description", event.target.value)
                    }
                    placeholder="짧은 설명"
                    className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              <input
                value={form.tags}
                onChange={(event) => updateForm("tags", event.target.value)}
                placeholder="태그: anime, pixel, oil"
                className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-slate-400"
              />
              <textarea
                value={form.prompt}
                onChange={(event) => updateForm("prompt", event.target.value)}
                placeholder="ChatGPT 이미지 생성 프롬프트를 입력하세요."
                rows={7}
                className="w-full resize-none rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 text-slate-900 outline-none focus:border-slate-400"
              />

              {error ? <p className="text-xs text-red-600">{error}</p> : null}

              <button
                type="submit"
                disabled={!canSave}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <FiCheck size={15} />
                저장
              </button>
            </form>
          ) : selectedPrompt ? (
            <section className="space-y-4">
              <div className="flex gap-3">
                <img
                  src={selectedPrompt.thumbnail || PLACEHOLDER_THUMB}
                  alt={`${selectedPrompt.title} 썸네일`}
                  className="h-24 w-24 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold text-slate-950">
                        {selectedPrompt.title}
                      </h3>
                      <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-500">
                        {selectedPrompt.description || "설명이 없습니다."}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-md border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-100"
                      aria-label={
                        selectedPrompt.isFavorite
                          ? "즐겨찾기 해제"
                          : "즐겨찾기"
                      }
                      onClick={() =>
                        updatePrompt(selectedPrompt.id, {
                          isFavorite: !selectedPrompt.isFavorite
                        })
                      }
                    >
                      {selectedPrompt.isFavorite ? (
                        <IoBookmark size={15} />
                      ) : (
                        <IoBookmarkOutline size={15} />
                      )}
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(selectedPrompt.tags ?? []).map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-slate-100 px-1.5 py-1 text-[11px] font-medium text-slate-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-slate-500">
                <div className="rounded-md bg-slate-50 p-2">
                  <strong className="block text-sm text-slate-900">
                    {selectedPrompt.usageCount}
                  </strong>
                  사용
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <strong className="block text-sm text-slate-900">
                    {selectedPrompt.isPublic ? "공개" : "비공개"}
                  </strong>
                  상태
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <strong className="block text-sm text-slate-900">
                    {formatDate(selectedPrompt.updatedAt)}
                  </strong>
                  수정
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                  {selectedPrompt.prompt}
                </p>
              </div>

              {error ? <p className="text-xs text-red-600">{error}</p> : null}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 active:scale-[0.98]"
                  onClick={handleUsePrompt}
                >
                  <IoSend size={15} />
                  사용하기
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 active:scale-[0.98]"
                  onClick={handleCopyPrompt}
                >
                  <FiCopy size={15} />
                  복사
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                  onClick={() => {
                    setForm(toForm(selectedPrompt));
                    setMode("edit");
                    setError("");
                  }}
                >
                  <FiEdit3 size={13} />
                  수정
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                  onClick={() =>
                    updatePrompt(selectedPrompt.id, {
                      isPublic: !selectedPrompt.isPublic
                    })
                  }
                >
                  {selectedPrompt.isPublic ? (
                    <IoEyeOutline size={13} />
                  ) : (
                    <IoEyeOffOutline size={13} />
                  )}
                  {selectedPrompt.isPublic ? "공개" : "비공개"}
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-red-200 bg-white px-2 text-xs font-medium text-red-600 transition hover:bg-red-50"
                  onClick={() => setDeleteTarget(selectedPrompt.id)}
                >
                  <FiTrash2 size={13} />
                  삭제
                </button>
              </div>

              {deleteTarget === selectedPrompt.id ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs font-medium text-red-700">
                    이 프롬프트를 삭제할까요?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className="h-8 flex-1 rounded-md bg-red-600 px-2 text-xs font-semibold text-white"
                      onClick={handleDelete}
                    >
                      삭제
                    </button>
                    <button
                      type="button"
                      className="h-8 flex-1 rounded-md border border-red-200 bg-white px-2 text-xs font-semibold text-red-700"
                      onClick={() => setDeleteTarget(null)}
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-sm font-semibold text-slate-900">
                아직 프롬프트가 없습니다.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                자주 쓰는 이미지 스타일을 하나 추가해 보세요.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
