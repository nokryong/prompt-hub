import { useEffect, useRef, useState } from "react";
import { searchPrompts } from "../lib/prompts";
import { findPromptInput, isPromptInput } from "./prompt-input";

const TOKEN_RE = /\$([^\s$]{0,30})$/;
const DROPDOWN_WIDTH = 320;

function getTriggerContext() {
  const selection = window.getSelection();
  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;

  const input = findPromptInput();
  if (!input || !input.contains(node)) return null;

  const textBefore = node.textContent.slice(0, range.startOffset);
  const match = TOKEN_RE.exec(textBefore);
  if (!match) return null;

  const charBefore = textBefore[textBefore.length - match[0].length - 1];
  if (charBefore && !/\s/.test(charBefore)) return null;

  let rect = range.getBoundingClientRect();
  if (!rect || (rect.top === 0 && rect.left === 0)) {
    rect = node.parentElement?.getBoundingClientRect();
    if (!rect) return null;
  }

  return {
    query: match[1],
    tokenLength: match[0].length,
    node,
    offset: range.startOffset,
    rect
  };
}

function insertPromptAtToken(item, ctx) {
  try {
    const selection = window.getSelection();
    const range = document.createRange();
    range.setStart(ctx.node, ctx.offset - ctx.tokenLength);
    range.setEnd(ctx.node, ctx.offset);
    selection.removeAllRanges();
    selection.addRange(range);
    if (!document.execCommand("insertText", false, item.prompt)) {
      throw new Error("insertText failed");
    }
  } catch {
    void navigator.clipboard?.writeText(item.prompt);
  }
}

export default function PromptAutocomplete() {
  const [session, setSession] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const sessionRef = useRef(null);
  const activeIndexRef = useRef(0);
  const listRef = useRef(null);

  useEffect(() => {
    sessionRef.current = session;
    activeIndexRef.current = activeIndex;
  }, [session, activeIndex]);

  useEffect(() => {
    function refresh() {
      const ctx = getTriggerContext();
      if (!ctx) {
        setSession(null);
        return;
      }

      const items = searchPrompts(ctx.query);
      if (items.length === 0) {
        setSession(null);
        return;
      }

      setSession({ ...ctx, items });
      setActiveIndex(0);
    }

    function handleInput(event) {
      if (!isPromptInput(event.target)) return;
      refresh();
    }

    function handleKeyDown(event) {
      const current = sessionRef.current;
      if (!current) return;
      const { items } = current;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((i) => (i + delta + items.length) % items.length);
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        insertPromptAtToken(items[activeIndexRef.current], current);
        setSession(null);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setSession(null);
      }
    }

    function handleMouseDown(event) {
      if (!sessionRef.current) return;
      if (listRef.current && event.composedPath().includes(listRef.current)) {
        return;
      }
      setSession(null);
    }

    document.addEventListener("input", handleInput, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => {
      document.removeEventListener("input", handleInput, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, []);

  useEffect(() => {
    listRef.current
      ?.querySelector("[data-active='true']")
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, session]);

  if (!session) return null;

  const left = Math.max(
    8,
    Math.min(session.rect.left, window.innerWidth - DROPDOWN_WIDTH - 8)
  );
  const bottom = window.innerHeight - session.rect.top + 8;

  return (
    <div
      ref={listRef}
      className="fixed z-[1000000] max-h-72 overflow-y-auto rounded-lg py-1"
      style={{
        left,
        bottom,
        width: DROPDOWN_WIDTH,
        background: "var(--bg)",
        border: "1px solid var(--border)",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.15)"
      }}
    >
      {session.items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          data-active={index === activeIndex}
          className="block w-full cursor-pointer border-0 px-3 py-2 text-left"
          style={{
            background:
              index === activeIndex ? "var(--accent-bg)" : "transparent"
          }}
          onMouseEnter={() => setActiveIndex(index)}
          onMouseDown={(event) => {
            event.preventDefault();
            insertPromptAtToken(item, session);
            setSession(null);
          }}
        >
          <div
            className="text-sm font-semibold"
            style={{ color: "var(--text-h)" }}
          >
            {item.title}
          </div>
          <div className="truncate text-xs" style={{ color: "var(--text)" }}>
            {item.description || item.prompt}
          </div>
        </button>
      ))}
      <div
        className="px-3 pb-1 pt-2 text-[11px]"
        style={{ color: "var(--text)", borderTop: "1px solid var(--border)" }}
      >
        방향키 이동 · Enter 선택 · Esc 닫기
      </div>
    </div>
  );
}
