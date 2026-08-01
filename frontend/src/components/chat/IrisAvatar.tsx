import styles from "./IrisAvatar.module.css";

export type IrisAvatarSize = "xs" | "sm" | "md" | "lg";

type Props = {
  size?: IrisAvatarSize;
  className?: string;
};

export function IrisAvatar({ size = "md", className }: Props) {
  return (
    <span className={[styles.wrap, styles[`size_${size}`], className].filter(Boolean).join(" ")} aria-hidden>
      <img src="/iris/iris-avatar.png" alt="" className={styles.img} draggable={false} />
    </span>
  );
}
