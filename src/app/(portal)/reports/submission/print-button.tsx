'use client';

import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/primitives';

export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer aria-hidden className="size-4" />
      In / Lưu PDF
    </Button>
  );
}
