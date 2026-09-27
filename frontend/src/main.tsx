import { render } from "preact";
import { App } from "./app";
import "./index.css";

const root = document.getElementById("app");
if (!root) throw new Error("#app not found");
if (
  import.meta.env.DEV &&
  new URLSearchParams(location.search).get("design-system") === "1"
) {
  import("./components/design-system-gallery").then(({ DesignSystemGallery }) =>
    render(<DesignSystemGallery />, root),
  );
} else {
  render(<App />, root);
}
