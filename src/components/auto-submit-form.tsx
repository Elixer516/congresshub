"use client";

import type { FormHTMLAttributes } from "react";

// A GET form that reloads the list as soon as a dropdown filter changes (typing still waits for Search).
export default function AutoSubmitForm(props: FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form
      {...props}
      onChange={(e) => {
        if (e.target instanceof HTMLSelectElement) e.currentTarget.requestSubmit();
      }}
    />
  );
}
