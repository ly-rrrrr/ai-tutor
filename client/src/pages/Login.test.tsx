import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Login from "./Login";
import { authClient } from "@/lib/auth-client";

const setLocation = vi.fn();

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    isAuthenticated: false,
    loading: false,
  }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      username: vi.fn(),
      email: vi.fn(),
    },
    signUp: {
      email: vi.fn(),
    },
    emailOtp: {
      verifyEmail: vi.fn(),
      sendVerificationOtp: vi.fn(),
    },
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      config: {
        useQuery: () => ({ data: { guestAccessEnabled: true } }),
      },
    },
  },
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/login", setLocation] as const,
}));

const mockedAuthClient = vi.mocked(authClient);

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLocation.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  function getSubmitButton(label: RegExp) {
    const buttons = screen
      .getAllByRole("button", { name: label })
      .filter(button => button.getAttribute("type") === "submit");

    expect(buttons.length).toBeGreaterThan(0);
    return buttons[0] as HTMLButtonElement;
  }

  it("routes login to username sign-in when the identifier has no @", async () => {
    const user = userEvent.setup();
    render(<Login />);

    await user.type(screen.getByLabelText(/用户名或邮箱/i), "learner_01");
    await user.type(screen.getByLabelText(/^密码$/i), "correct horse battery staple");
    await user.click(getSubmitButton(/^登录$/i));

    expect(authClient.signIn.username).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "learner_01",
        password: "correct horse battery staple",
      })
    );
  });

  it("routes login to email sign-in when the identifier contains @", async () => {
    const user = userEvent.setup();
    render(<Login />);

    await user.type(screen.getByLabelText(/用户名或邮箱/i), "learner@example.com");
    await user.type(screen.getByLabelText(/^密码$/i), "correct horse battery staple");
    await user.click(getSubmitButton(/^登录$/i));

    expect(authClient.signIn.email).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "learner@example.com",
        password: "correct horse battery staple",
      })
    );
  });

  it("blocks registration when password confirmation does not match", async () => {
    const user = userEvent.setup();
    render(<Login />);

    await user.click(screen.getByRole("tab", { name: /注册/i }));
    await user.type(screen.getByLabelText(/用户名/i), "learner_01");
    await user.type(screen.getByLabelText(/邮箱/i), "learner@example.com");
    await user.type(screen.getByLabelText(/^密码$/i), "password-123");
    await user.type(screen.getByLabelText(/再次输入密码/i), "password-456");
    await user.click(getSubmitButton(/^创建账号$/i));

    expect(screen.getByText(/两次输入的密码不一致/i)).toBeDefined();
  });

  it("moves to the verify-email step after successful registration", async () => {
    const user = userEvent.setup();
    mockedAuthClient.signUp.email.mockResolvedValueOnce({ error: null } as never);

    render(<Login />);

    await user.click(screen.getByRole("tab", { name: /注册/i }));
    await user.type(screen.getByLabelText(/用户名/i), "learner_01");
    await user.type(screen.getByLabelText(/邮箱/i), "learner@example.com");
    await user.type(screen.getByLabelText(/^密码$/i), "password-123");
    await user.type(screen.getByLabelText(/再次输入密码/i), "password-123");
    await user.click(getSubmitButton(/^创建账号$/i));

    expect(screen.getByRole("heading", { name: /输入验证码/i })).toBeDefined();
  });

  it("resends the verification code from the verify-email step", async () => {
    const user = userEvent.setup();
    mockedAuthClient.signUp.email.mockResolvedValueOnce({ error: null } as never);

    render(<Login />);

    await user.click(screen.getByRole("tab", { name: /注册/i }));
    await user.type(screen.getByLabelText(/用户名/i), "learner_01");
    await user.type(screen.getByLabelText(/邮箱/i), "learner@example.com");
    await user.type(screen.getByLabelText(/^密码$/i), "password-123");
    await user.type(screen.getByLabelText(/再次输入密码/i), "password-123");
    await user.click(getSubmitButton(/^创建账号$/i));
    await user.click(screen.getByRole("button", { name: /重新发送验证码/i }));

    expect(mockedAuthClient.emailOtp.sendVerificationOtp).toHaveBeenCalledWith({
      email: "learner@example.com",
      type: "email-verification",
    });
  });

  it("shows the guest entry action when guest access is enabled", () => {
    render(<Login />);

    expect(
      screen
        .getAllByRole("button", { name: /游客进入/i })
        .filter(button => button.getAttribute("type") === "button")[0]
    ).toBeDefined();
  });
});
