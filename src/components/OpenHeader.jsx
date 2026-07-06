import Header from "./Header";
import PromptsCollapse from "./collapseChildren/promptsCollapse";

export default function OpenHeader({ isOpen, setIsOpen, startResize }) {
  return (
    <>
      <button
        type="button"
        aria-label="사이드바 크기 조절"
        className="absolute left-0 top-0 h-full w-2 cursor-ew-resize bg-transparent"
        onMouseDown={startResize}
      />
      <aside className="flex h-full w-full flex-col overflow-hidden rounded-xl border bg-white text-left shadow-xl shadow-slate-950/10">
        <div className="shrink-0 border-b border-slate-200 px-4 py-3">
          <Header isOpen={isOpen} setIsOpen={setIsOpen} />
        </div>
        <PromptsCollapse />
      </aside>
    </>
  );
}
