import { useId, type HTMLAttributes, type ReactNode, type TdHTMLAttributes, type ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type TableProps = HTMLAttributes<HTMLTableElement> & {
  caption: ReactNode;
  /** Keep the caption for screen readers only (e.g. when a heading already says it). */
  hideCaption?: boolean;
};

/**
 * Data table in a keyboard-scrollable region so wide tables work on phones.
 * Use <Th> for headers (scope="col" by default) and <Td> for cells.
 */
export function Table({ caption, hideCaption = false, className, children, ...props }: TableProps) {
  const captionId = useId();
  return (
    <div
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      className="overflow-x-auto rounded-field border border-sky-200 bg-white"
    >
      <table className={cn("w-full border-collapse text-left text-small", className)} {...props}>
        <caption
          id={captionId}
          className={cn(hideCaption ? "sr-only" : "px-4 pt-4 pb-2 text-left font-display text-small font-semibold")}
        >
          {caption}
        </caption>
        {children}
      </table>
    </div>
  );
}

export function Th({ className, scope = "col", ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope={scope}
      className={cn("border-b-2 border-sky-200 bg-sky-50 px-4 py-3 font-display font-semibold whitespace-nowrap", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-sky-200 px-4 py-3 align-top", className)} {...props} />;
}
