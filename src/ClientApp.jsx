import { Button } from "sud-ui";
import { LuPanelRightOpen } from "react-icons/lu";
import { useEffect, useRef, useState } from "react";
import OpenHeader from "./components/OpenHeader.jsx";

const COLLAPSED_WIDTH = 60;
const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 340;
const MAX_WIDTH = 640;

function clampWidth(width) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

export default function ClientApp() {
  const [isOpen, setIsOpen] = useState(true);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const frameRef = useRef(null);

  useEffect(() => {
    function handleMouseMove(event) {
      if (!isDraggingRef.current) return;
      const nextWidth = clampWidth(window.innerWidth - event.clientX);

      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = requestAnimationFrame(() => {
        setPanelWidth(nextWidth);
      });
    }

    function handleMouseUp() {
      isDraggingRef.current = false;
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  function startResize(event) {
    event.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <div
      className={`fixed top-[5vh] right-0 z-[999999] h-[90vh] p-3 ${
        isDragging ? "" : "transition-[width] duration-200 ease-out"
      }`}
      style={{ width: isOpen ? panelWidth : COLLAPSED_WIDTH }}
    >
      {isOpen ? (
        <OpenHeader
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          startResize={startResize}
        />
      ) : (
        <Button
          type="button"
          aria-label="Open sidebar"
          onClick={() => setIsOpen(true)}
          icon={<LuPanelRightOpen size={18} />}
          shadow="sm"
          className="w-full"
        />
      )}
    </div>
  );
}
