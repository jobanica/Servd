import { z } from "zod";

/**
 * Validation schemas for menu management. We validate on the server (in the
 * actions) so malformed input never reaches the database — the UI is just a
 * convenience layer.
 */

// Prices arrive from forms as peso strings; coerce + bound them here.
const pesoAmount = z.coerce
  .number({ message: "Enter a valid amount" })
  .min(0, "Cannot be negative")
  .max(1_000_000, "Too large");

// Modifier deltas may be negative (e.g. -₱10 to remove an ingredient).
const pesoDelta = z.coerce
  .number({ message: "Enter a valid amount" })
  .min(-1_000_000)
  .max(1_000_000);

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

export const menuItemSchema = z.object({
  categoryId: z.string().uuid("Pick a category"),
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  pricePesos: pesoAmount,
  isAvailable: z.coerce.boolean().default(true),
});

export const modifierGroupSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80),
    required: z.coerce.boolean().default(false),
    minSelect: z.coerce.number().int().min(0).max(50).default(0),
    maxSelect: z.coerce.number().int().min(1).max(50).default(1),
  })
  .refine((g) => g.maxSelect >= g.minSelect, {
    message: "Max selections must be ≥ min selections",
    path: ["maxSelect"],
  })
  .refine((g) => !g.required || g.minSelect >= 1, {
    message: "A required group must allow at least 1 selection",
    path: ["minSelect"],
  });

export const modifierSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  priceDeltaPesos: pesoDelta.default(0),
});

// Image upload constraints (validated server-side before hitting storage).
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// Menu item videos (short clips).
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
