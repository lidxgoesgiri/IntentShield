import { countChangedCharacters, diffCharacters } from "@/lib/format/address";
import { cn } from "@/lib/utils";

/**
 * Full-length address with changed characters highlighted (text + underline,
 * not color alone). Truncation is never used for comparisons.
 */
export function AddressDiff({ expected, actual, className }: { expected: string; actual: string; className?: string }) {
  const segments = diffCharacters(expected, actual);
  const changed = countChangedCharacters(expected, actual);
  return (
    <span className={cn("font-data break-all", className)}>
      {segments.map((segment, index) =>
        segment.changed ? (
          <mark
            key={index}
            className="rounded-[3px] bg-warning/20 px-[1px] text-warning underline decoration-warning decoration-2 underline-offset-4"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
      <span className="sr-only">
        {changed === 0 ? " (identical)" : ` (${changed} of ${Math.max(expected.length, actual.length)} characters differ)`}
      </span>
    </span>
  );
}
