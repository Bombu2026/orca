import Link, { type LinkProps } from "next/link";
import { type ReactNode } from "react";

type Props = LinkProps & {
  children: ReactNode;
  className?: string;
};

export function LinkUnderlineSweep({ children, className, ...linkProps }: Props): React.ReactElement {
  return (
    <Link
      {...linkProps}
      className={[
        "relative inline-block transition-colors duration-300 ease-[var(--ease-expo)]",
        "after:absolute after:left-0 after:bottom-0 after:h-px after:w-full after:bg-current",
        "after:origin-right after:scale-x-0",
        "hover:after:origin-left hover:after:scale-x-100",
        "after:transition-transform after:duration-500 after:ease-[var(--ease-expo)]",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
