import { Camera, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AvatarCfg } from "../shared/avatar/cfg";
import { useStore } from "../store";
import type { Gender } from "./AccountContext";
import { Avatar, AV_COLORS } from "./Avatar";
import { AvatarArt } from "./avatar/art";
import { AvatarMaker } from "./avatar/Maker";

/** What a profile shows as its face: the anime look, a photo, or neither (the first letter). */
export type FaceKind = "anime" | "photo" | "none";

/** The maker's starting style from the profile's gender (the choices stay open to everyone). */
const styleFor = (g: Gender | ""): AvatarCfg["start"] => (g === "female" ? "f" : g === "male" ? "m" : "x");

export type ProfileValues = { name: string; phone: string; city: string; gender: Gender | ""; bio: string; ac: number };

const CITIES = ["Vancouver", "Burnaby", "Richmond", "Surrey", "Coquitlam", "North Vancouver", "New Westminster", "Victoria", "Toronto", "Calgary", "Montreal", "Seattle", "Beijing", "Shanghai", "Shenzhen", "Guangzhou", "Hong Kong", "Taipei"];

/** Square-crop a photo to 320px JPEG, small enough to keep and quick to load. */
export async function toAvatarBlob(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const c = document.createElement("canvas");
    c.width = c.height = 320;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, side, side, 0, 0, 320, 320);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", 0.86));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function ProfileForm({
  initial,
  mode,
  show,
  look,
  photo,
  uid,
  av,
  busy,
  error,
  onLook,
  onUseLook,
  onPhoto,
  onRemovePhoto,
  onSubmit,
}: {
  initial: ProfileValues;
  mode: "signup" | "edit";
  /** the face others see */
  show: FaceKind;
  /** the anime look, kept even while a photo shows */
  look?: AvatarCfg | null;
  /** a picked photo not uploaded yet (sign-up) */
  photo?: Blob | null;
  uid?: string;
  av?: number;
  busy?: boolean;
  error?: string;
  /** a look made or changed in the maker, to show from now on */
  onLook: (c: AvatarCfg) => void;
  /** show the look you have again, instead of the photo */
  onUseLook: () => void;
  onPhoto: (b: Blob) => void;
  onRemovePhoto?: () => void;
  onSubmit: (v: ProfileValues, adult: boolean) => void;
}) {
  const { lang } = useStore();
  const zh = lang === "zh";
  const [making, setMaking] = useState(false);
  const [v, setV] = useState<ProfileValues>(initial);
  const [adult, setAdult] = useState(mode === "edit");
  const [preview, setPreview] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = (p: Partial<ProfileValues>) => setV((x) => ({ ...x, ...p }));

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const u = URL.createObjectURL(photo);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  const genders: { id: Gender; zh: string; en: string }[] = [
    { id: "female", zh: "女", en: "Female" },
    { id: "male", zh: "男", en: "Male" },
    { id: "nonbinary", zh: "非二元", en: "Non-binary" },
    { id: "private", zh: "不透露", en: "Prefer not to say" },
  ];
  const valid = v.name.trim() && (v.phone.match(/\d/g) ?? []).length >= 7 && v.city.trim() && v.gender && (mode === "edit" || v.bio.trim()) && adult;

  return (
    <form
      className="profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid && !busy) onSubmit(v, adult);
      }}
    >
      <div className="pf-face" style={{ ["--av" as string]: AV_COLORS[v.ac % AV_COLORS.length] } as React.CSSProperties}>
        <button type="button" className="pf-photo" onClick={() => (show === "photo" ? file.current?.click() : setMaking(true))} aria-label={show === "photo" ? (zh ? "换照片" : "Change photo") : look ? (zh ? "改动漫头像" : "Change your anime avatar") : zh ? "做动漫头像" : "Make an anime avatar"}>
          {show === "anime" && look ? (
            <AvatarArt cfg={look} view="head" className="avatar pf-look" style={{ width: 92, height: 92 }} />
          ) : show === "photo" && preview ? (
            <img src={preview} alt="" className="avatar" style={{ width: 92, height: 92 }} />
          ) : (
            <Avatar uid={show === "photo" ? uid : undefined} name={v.name || "?"} av={show === "photo" ? av : 0} ac={v.ac} size={92} />
          )}
          <span className="pf-cam">{show === "photo" ? <Camera size={16} /> : <Sparkles size={16} />}</span>
        </button>
        <div className="pf-face-side">
          <div className="seg seg-sm pf-kind" role="group" aria-label={zh ? "头像用哪个" : "Which face to show"}>
            <button type="button" aria-pressed={show === "anime"} onClick={() => (show !== "anime" && look ? onUseLook() : setMaking(true))}>
              <Sparkles size={14} />
              {zh ? "动漫头像" : "Anime"}
            </button>
            <button type="button" aria-pressed={show === "photo"} onClick={() => file.current?.click()}>
              <Camera size={14} />
              {zh ? "真照片" : "Photo"}
            </button>
          </div>
          <span className="field-label">{zh ? "头像底色" : "Backdrop"}</span>
          <div className="swatches">
            {AV_COLORS.slice(0, 10).map((c, i) => (
              <button key={c} type="button" className={`av-swatch ${v.ac === i ? "is-on" : ""}`} style={{ background: c }} onClick={() => set({ ac: i })} aria-label={`${zh ? "底色" : "Backdrop"} ${i + 1}`} aria-pressed={v.ac === i} />
            ))}
          </div>
          {show !== "none" && onRemovePhoto && (
            <button type="button" className="link-btn" onClick={onRemovePhoto}>
              <Trash2 size={13} /> {zh ? "不用头像" : "No avatar"}
            </button>
          )}
        </div>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void toAvatarBlob(f).then(onPhoto).catch(() => {});
          }}
        />
        <AvatarMaker
          open={making}
          initial={look}
          start={styleFor(v.gender)}
          onClose={() => setMaking(false)}
          onDone={(c) => {
            setMaking(false);
            onLook(c);
          }}
        />
      </div>

      <label className="field-label" htmlFor="pf-name">
        {zh ? "名字" : "Name"}
      </label>
      <div className="field">
        <input id="pf-name" value={v.name} onChange={(e) => set({ name: e.target.value })} maxLength={20} autoComplete="nickname" placeholder={zh ? "大家怎么叫你" : "What friends call you"} />
      </div>

      <label className="field-label" htmlFor="pf-phone">
        {zh ? "手机号" : "Phone"}
      </label>
      <div className="field">
        <input id="pf-phone" value={v.phone} onChange={(e) => set({ phone: e.target.value })} maxLength={24} inputMode="tel" autoComplete="tel" placeholder="+1 604 555 0123" />
      </div>

      <label className="field-label" htmlFor="pf-city">
        {zh ? "居住城市" : "City"}
      </label>
      <div className="field">
        <input id="pf-city" value={v.city} onChange={(e) => set({ city: e.target.value })} maxLength={40} list="pf-cities" autoComplete="address-level2" placeholder={zh ? "比如：Vancouver" : "e.g. Vancouver"} />
        <datalist id="pf-cities">
          {CITIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <span className="field-label">{zh ? "性别" : "Gender"}</span>
      <div className="picker pf-genders" role="group">
        {genders.map((g) => (
          <button key={g.id} type="button" className="chip" aria-pressed={v.gender === g.id} onClick={() => set({ gender: g.id })}>
            {zh ? g.zh : g.en}
          </button>
        ))}
      </div>

      <label className="field-label" htmlFor="pf-bio">
        {zh ? "个人简介" : "Bio"}
      </label>
      <div className="field">
        <textarea id="pf-bio" rows={3} value={v.bio} onChange={(e) => set({ bio: e.target.value })} maxLength={200} placeholder={zh ? "爱好、酒量、拿手游戏……" : "What you're into, your go-to drink, your best game…"} />
      </div>

      {mode === "signup" && (
        <label className="pf-check">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          <span>{zh ? "我已满 19 岁" : "I'm 19 or older"}</span>
        </label>
      )}
      <p className="hint pf-privacy">{zh ? "手机号和邮箱只有你自己看得到。名字、头像、城市、性别和简介会显示在你的主页上。" : "Only you can see your phone and email. Your name, photo, city, gender and bio show on your profile."}</p>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!valid || busy}>
        {busy ? (zh ? "保存中" : "Saving") : mode === "signup" ? (zh ? "完成注册" : "Create my profile") : zh ? "保存" : "Save"}
      </button>
    </form>
  );
}
