import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup } from "@testing-library/preact";
import { afterEach } from "vitest";

GlobalRegistrator.register();

afterEach(() => {
  cleanup();
});
