import { API } from "../../config";
import { useStore } from "../../store";
import type { PublicUser } from "../AccountContext";
import { Avatar, AV_COLORS } from "../Avatar";

/**
 * The face at the top of a profile: someone with an AI-drawn anime figure stands there whole, on a
 * spot of their own color; everyone else shows their round avatar.
 */
export function Face({ user }: { user: PublicUser }) {
  const { lang } = useStore();
  const style = { ["--av" as string]: AV_COLORS[user.ac % AV_COLORS.length] } as React.CSSProperties;
  if (user.figure)
    return (
      <span className="me-figure" style={style}>
        <img src={`${API}/figure/${user.id}?v=${user.av}`} alt={lang === "zh" ? `${user.name}的头像` : `${user.name}'s avatar`} width={300} height={400} decoding="async" />
      </span>
    );
  return <Avatar uid={user.id} name={user.name} av={user.av} ac={user.ac} size={88} className="me-avatar" />;
}
