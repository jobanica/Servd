"use client";

/**
 * A submit button that asks for confirmation before letting its form submit.
 * Drop it inside a `<form action={…}>` in place of a plain button when the
 * action is destructive (e.g. deleting a category).
 */
export function ConfirmSubmitButton({
  message,
  className,
  children,
}: {
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
