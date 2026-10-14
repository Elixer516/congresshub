"use client";

import { Button } from "@/components/ui";

export default function PrintButton() {
  return <Button onClick={() => window.print()}>Print</Button>;
}
