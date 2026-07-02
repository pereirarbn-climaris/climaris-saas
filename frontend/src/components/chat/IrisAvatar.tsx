import styles from "./IrisAvatar.module.css";

export type IrisAvatarSize = "xs" | "sm" | "md" | "lg";

type Props = {
  size?: IrisAvatarSize;
  variant?: "full" | "face";
  className?: string;
};

export function IrisAvatar({ size = "md", variant = "face", className }: Props) {
  return (
    <span
      className={[
        styles.wrap,
        styles[`size_${size}`],
        variant === "face" ? styles.faceCrop : styles.full,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      <img src="/iris/iris-mascot.png" alt="" className={styles.img} draggable={false} />
    </span>
  );
}
