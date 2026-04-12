import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClickableText from "./ClickableText";

describe("ClickableText", () => {
  afterEach(() => {
    cleanup();
  });

  it("ignores common stop words while keeping meaningful words clickable", async () => {
    const user = userEvent.setup();
    const onWordClick = vi.fn();

    render(<ClickableText text="the airport" onWordClick={onWordClick} />);

    await user.click(screen.getByText("the"));
    expect(onWordClick).not.toHaveBeenCalled();

    await user.click(screen.getByText("airport"));
    expect(onWordClick).toHaveBeenCalledWith("airport");
  });
});
