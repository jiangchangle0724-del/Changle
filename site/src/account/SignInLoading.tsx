import { Sheet } from "../components/Sheet";
import { Skeleton } from "../ui/Skeleton";
import { useStore } from "../store";
import { useAccount } from "./AccountContext";

/** A dismissible sign-in sheet while the form's file is still on its way. */
export function SignInLoading() {
  const { lang } = useStore();
  const { signInOpen, openSignIn } = useAccount();
  const zh = lang === "zh";
  return (
    <Sheet open={signInOpen} onClose={() => openSignIn(false)} title={zh ? "登录 / 注册" : "Sign in or sign up"}>
      <Skeleton lang={lang} lines={2} height="var(--tap)" slowText={zh ? "网有点慢，马上就好" : "Slow connection, nearly there"} />
    </Sheet>
  );
}
