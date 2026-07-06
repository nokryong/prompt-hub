import { createRoot } from "react-dom/client";
import App from "../App.jsx";

export function injectApp(styles) {
  if (document.getElementById("prompthub-root")) return;

  const host = document.createElement("div");
  host.id = "prompthub-root";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  if (styles) {
    const style = document.createElement("style");
    // sud-ui declares variables on :root. Inside Shadow DOM, :host is the root.
    style.textContent = styles.replace(/:root\b/g, ":host");
    shadow.appendChild(style);
  }

  const mount = document.createElement("div");
  shadow.appendChild(mount);

  createRoot(mount).render(<App />);
}
