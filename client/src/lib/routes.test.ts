import { describe, expect, it } from "vitest";
import { appRoutes, getCurrentAppPath, isActiveAppRoute } from "./routes";

describe("appRoutes", () => {
  it("builds absolute wouter routes with the escape prefix", () => {
    expect(appRoutes.explore()).toBe("~/app");
    expect(appRoutes.chat()).toBe("~/app/chat");
    expect(appRoutes.courses()).toBe("~/app/courses");
    expect(appRoutes.dashboard()).toBe("~/app/dashboard");
    expect(appRoutes.history()).toBe("~/app/history");
  });

  it("builds a conversation route for numeric ids", () => {
    expect(appRoutes.conversation(42)).toBe("~/app/chat/42");
  });

  it("builds a conversation route for string ids", () => {
    expect(appRoutes.conversation("draft")).toBe("~/app/chat/draft");
  });
});

describe("getCurrentAppPath", () => {
  it("normalizes the nested root location to the app root", () => {
    expect(getCurrentAppPath("/")).toBe("/app");
  });

  it("normalizes nested child locations into absolute app paths", () => {
    expect(getCurrentAppPath("/chat/42")).toBe("/app/chat/42");
    expect(getCurrentAppPath("/courses")).toBe("/app/courses");
  });

  it("leaves already absolute app paths unchanged", () => {
    expect(getCurrentAppPath("/app/history")).toBe("/app/history");
  });
});

describe("isActiveAppRoute", () => {
  it("matches nested conversation locations to the conversation menu route", () => {
    expect(isActiveAppRoute("/chat/42", appRoutes.chat())).toBe(true);
  });

  it("does not mark explore active when a deeper route is selected", () => {
    expect(isActiveAppRoute("/courses", appRoutes.explore())).toBe(false);
  });
});
