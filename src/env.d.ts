// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../.astro/types.d.ts" />

declare namespace App {
  interface Locals {
    /** Email of the signed-in admin on /admin routes; null everywhere else. */
    adminEmail: string | null;
  }
}
