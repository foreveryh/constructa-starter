"use client";

import { cn } from "~/lib/utils";
import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";

type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(
  ({ className, children, ...props }: ResponseProps) => {
    // Debug logging
    console.log('[Response] Render:', {
      childrenType: typeof children,
      childrenValue: children,
      hasChildren: children !== undefined && children !== null,
    });

    // Ensure children is a string
    const safeChildren = (children ?? '') as string;

    return (
      <Streamdown
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          className,
        )}
        {...props}
      >
        {safeChildren}
      </Streamdown>
    );
  },
  (prevProps, nextProps) => {
    const isEqual = prevProps.children === nextProps.children;
    console.log('[Response] Memo comparison:', {
      prevChildren: prevProps.children,
      nextChildren: nextProps.children,
      isEqual,
    });
    return isEqual;
  },
);

Response.displayName = "Response";
