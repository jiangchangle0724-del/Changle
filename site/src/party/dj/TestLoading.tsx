import { PageLoading } from "../../games/GameLoading";
import { useStore } from "../../store";

export default function TestLoading() {
  const { lang } = useStore();
  return <PageLoading lang={lang} />;
}
