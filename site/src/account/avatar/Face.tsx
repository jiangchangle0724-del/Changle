import { useStore } from "../../store";
import { figBox } from "../../shared/avatar/render";
import type { PublicUser } from "../AccountContext";
import { Avatar, AV_COLORS } from "../Avatar";
import { AvatarArt } from "./art";

/**
 * The face at the top of a profile: someone with an anime look stands there whole, on a spot of
 * their own color; everyone else shows their round avatar.
 */
export function Face({ user, on }: { user: PublicUser; on: boolean }) {
  const { lang } = useStore();
  const style = { ["--av" as string]: AV_COLORS[user.ac % AV_COLORS.length] } as React.CSSProperties;
  if (on && user.look)
    return (
      <span className="me-figure" style={style}>
        <AvatarArt cfg={user.look} view="full" box={figBox(user.look)} label={lang === "zh" ? `${user.name}的头像` : `${user.name}'s avatar`} />
      </span>
    );
  return <Avatar uid={user.id} name={user.name} av={user.av} ac={user.ac} size={88} className="me-avatar" />;
}
