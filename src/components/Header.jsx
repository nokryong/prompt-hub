import { IoSettingsOutline } from "react-icons/io5";
import { LuPanelRightClose } from "react-icons/lu";
import { Button } from "sud-ui";

const logoSrc = globalThis.chrome?.runtime?.getURL
  ? globalThis.chrome.runtime.getURL("logo.svg")
  : "/logo.svg";

export default function Header({ isOpen, setIsOpen }) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <img src={logoSrc} alt="PromptHub" className="h-8 w-auto" />
      <div className="flex items-center gap-1">
        <Button
          ariaLabel="설정"
          icon={<IoSettingsOutline size={16} />}
          className="w-1"
          disabled
        />
        <Button
          ariaLabel="사이드바 닫기"
          ariaExpanded={isOpen}
          icon={<LuPanelRightClose size={16} />}
          onClick={() => setIsOpen(!isOpen)}
          className="w-1"
        />
      </div>
    </div>
  );
}
