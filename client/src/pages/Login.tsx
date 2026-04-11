import React, { FormEvent, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, GraduationCap, Loader2, Mail, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TurnstileWidget } from "@/components/TurnstileWidget";

type AuthMode = "login" | "register" | "verify";

function looksLikeEmail(identifier: string) {
  return identifier.includes("@");
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallback;
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
  }

  return null;
}

export default function Login() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();
  const authConfigQuery = trpc.auth.config.useQuery();

  const [mode, setMode] = useState<AuthMode>("login");
  const [identifier, setIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const turnstileSiteKey = authConfigQuery.data?.turnstileSiteKey ?? null;
  const guestAccessEnabled = authConfigQuery.data?.guestAccessEnabled ?? false;

  useEffect(() => {
    if (!loading && isAuthenticated) {
      setLocation("/app");
    }
  }, [isAuthenticated, loading, setLocation]);

  useEffect(() => {
    if (mode !== "register") {
      setCaptchaToken(null);
    }
  }, [mode]);

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedIdentifier = identifier.trim().toLowerCase();
    if (!normalizedIdentifier || !loginPassword) {
      toast.error("请输入用户名/邮箱和密码。");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = looksLikeEmail(normalizedIdentifier)
        ? await authClient.signIn.email({
            email: normalizedIdentifier,
            password: loginPassword,
            callbackURL: "/app",
          })
        : await authClient.signIn.username({
            username: normalizedIdentifier,
            password: loginPassword,
            callbackURL: "/app",
          });

      if (result && typeof result === "object" && "error" in result && result.error) {
        throw result.error;
      }

      setLocation("/app");
    } catch (error: unknown) {
      if (getErrorCode(error) === "EMAIL_NOT_VERIFIED") {
        if (looksLikeEmail(normalizedIdentifier)) {
          setPendingVerificationEmail(normalizedIdentifier);
          setVerificationCode("");
          setMode("verify");
          toast.error("邮箱尚未验证，请先输入验证码。");
          return;
        }

        setPendingVerificationEmail("");
        setVerificationCode("");
        setMode("verify");
        toast.error("请输入账号绑定的邮箱地址，然后继续验证。");
        return;
      }

      toast.error(getErrorMessage(error, "登录失败，请检查账号或密码。"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedUsername = registerUsername.trim().toLowerCase();
    const normalizedEmail = registerEmail.trim().toLowerCase();

    if (!normalizedUsername || !normalizedEmail || !registerPassword) {
      toast.error("请完整填写注册信息。");
      return;
    }

    if (registerPassword !== confirmPassword) {
      setConfirmPasswordError("两次输入的密码不一致");
      return;
    }

    if (turnstileSiteKey && !captchaToken) {
      toast.error("请先完成人机验证。");
      return;
    }

    setIsSubmitting(true);
    setConfirmPasswordError("");

    try {
      const result = await authClient.signUp.email({
        email: normalizedEmail,
        password: registerPassword,
        name: normalizedUsername,
        username: normalizedUsername,
        ...(turnstileSiteKey && captchaToken
          ? {
              fetchOptions: {
                headers: {
                  "x-captcha-response": captchaToken,
                },
              },
            }
          : {}),
      });

      if (result && typeof result === "object" && "error" in result && result.error) {
        throw result.error;
      }

      setPendingVerificationEmail(normalizedEmail);
      setVerificationCode("");
      setMode("verify");
      toast.success("验证码已发送，请检查邮箱。");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "注册失败，请稍后重试。"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const email = pendingVerificationEmail.trim().toLowerCase();
    const otp = verificationCode.trim();

    if (!email || !otp) {
      toast.error("请输入验证码。");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await authClient.emailOtp.verifyEmail({
        email,
        otp,
      });

      if (result && typeof result === "object" && "error" in result && result.error) {
        throw result.error;
      }

      toast.success("邮箱验证成功，请使用账号密码登录。");
      setMode("login");
      setIdentifier(email);
      setVerificationCode("");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "验证码无效或已过期。"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerificationCode = async () => {
    const email = pendingVerificationEmail.trim().toLowerCase();

    if (!email) {
      toast.error("请输入邮箱地址。");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      });

      if (result && typeof result === "object" && "error" in result && result.error) {
        throw result.error;
      }

      toast.success("验证码已重新发送。");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "重新发送验证码失败。"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderLoginForm = () => (
    <form className="space-y-4" onSubmit={handleLoginSubmit}>
      <div className="space-y-2">
        <Label htmlFor="login-identifier">用户名或邮箱</Label>
        <div className="relative">
          <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="login-identifier"
            autoComplete="username"
            placeholder="learner_01 或 learner@example.com"
            className="pl-10"
            value={identifier}
            onChange={event => setIdentifier(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="login-password">密码</Label>
        <div className="relative">
          <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="请输入密码"
            className="pl-10"
            value={loginPassword}
            onChange={event => setLoginPassword(event.target.value)}
          />
        </div>
      </div>

      <Button className="w-full" disabled={isSubmitting} type="submit">
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "登录"}
      </Button>
    </form>
  );

  const renderRegisterForm = () => (
    <form className="space-y-4" onSubmit={handleRegisterSubmit}>
      <div className="space-y-2">
        <Label htmlFor="register-username">用户名</Label>
        <div className="relative">
          <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="register-username"
            autoComplete="username"
            placeholder="learner_01"
            className="pl-10"
            value={registerUsername}
            onChange={event => setRegisterUsername(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-email">邮箱</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            placeholder="learner@example.com"
            className="pl-10"
            value={registerEmail}
            onChange={event => setRegisterEmail(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-password">密码</Label>
        <Input
          id="register-password"
          type="password"
          autoComplete="new-password"
          placeholder="至少 8 位"
          value={registerPassword}
          onChange={event => setRegisterPassword(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-password">再次输入密码</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          placeholder="再次输入密码"
          value={confirmPassword}
          onChange={event => {
            setConfirmPassword(event.target.value);
            if (confirmPasswordError) {
              setConfirmPasswordError("");
            }
          }}
        />
        {confirmPasswordError ? (
          <p className="text-sm text-destructive">{confirmPasswordError}</p>
        ) : null}
      </div>

      {turnstileSiteKey ? (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <TurnstileWidget siteKey={turnstileSiteKey} onTokenChange={setCaptchaToken} />
        </div>
      ) : null}

      <Button className="w-full" disabled={isSubmitting} type="submit">
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "创建账号"}
      </Button>
    </form>
  );

  const renderVerifyForm = () => (
    <form className="space-y-4" onSubmit={handleVerifySubmit}>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">输入验证码</h2>
        <p className="text-sm text-muted-foreground">
          {pendingVerificationEmail
            ? `验证码已发送到 ${pendingVerificationEmail}，请输入后继续。`
            : "请输入账号绑定的邮箱地址，再输入验证码继续。"}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="verification-email">邮箱地址</Label>
        <Input
          id="verification-email"
          type="email"
          autoComplete="email"
          placeholder="learner@example.com"
          value={pendingVerificationEmail}
          onChange={event => setPendingVerificationEmail(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="verification-code">验证码</Label>
        <Input
          id="verification-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="6 位验证码"
          value={verificationCode}
          onChange={event => setVerificationCode(event.target.value)}
        />
      </div>

      <div className="flex gap-3">
        <Button className="flex-1" disabled={isSubmitting} type="submit">
          {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "验证邮箱"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleResendVerificationCode}
          disabled={isSubmitting}
        >
          重新发送验证码
        </Button>
      </div>

      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={() => setMode("login")}
      >
        返回登录
      </Button>
    </form>
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md border-border/60 shadow-xl">
          <CardContent className="p-6 text-center text-muted-foreground">
            正在加载登录状态...
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center">
        <Card className="w-full border-border/60 shadow-xl">
          <CardHeader className="space-y-4 text-center">
            <button
              type="button"
              onClick={() => setLocation("/")}
              className="inline-flex items-center justify-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              返回首页
            </button>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <GraduationCap className="h-7 w-7 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                欢迎来到 AI Tutor
              </h1>
              <CardDescription>
                使用用户名或邮箱登录，或创建新账号继续学习。
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {mode === "verify" ? (
              renderVerifyForm()
            ) : (
              <Tabs
                value={mode}
                onValueChange={value => {
                  setMode(value === "register" ? "register" : "login");
                  setConfirmPasswordError("");
                }}
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">登录</TabsTrigger>
                  <TabsTrigger value="register">注册</TabsTrigger>
                </TabsList>
                <div className="pt-5">
                  {mode === "login" ? renderLoginForm() : renderRegisterForm()}
                </div>
              </Tabs>
            )}

            {guestAccessEnabled ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setLocation("/app")}
              >
                游客进入
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
