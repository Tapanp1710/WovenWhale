import { z } from "zod";

/** Strips control characters and collapses whitespace in free-text input. */
export const cleanText = (max: number) =>
  z
    .string()
    .transform((s) =>
      s
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .pipe(z.string().max(max));

export const requiredText = (label: string, max: number, min = 1) => cleanText(max).pipe(z.string().min(min, `${label} is required`));

/**
 * Indian mobile number. Accepts "98765 43210", "+91 98765-43210", "09876543210"
 * and normalises to E.164 ("+919876543210").
 */
export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s\-()]/g, ""))
  .transform((s) => s.replace(/^(\+?91|0)(?=\d{10}$)/, ""))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"))
  .transform((s) => `+91${s}`);

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address").max(254));

/**
 * Optional fields accept "", null or undefined as input and normalise to null,
 * so a form can submit this schema's own output back to the API unchanged.
 */
const blankable = z.union([z.string(), z.null(), z.undefined()]).transform((v) => v ?? "");

export const optionalEmailSchema = blankable
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.union([z.literal(""), z.email("Enter a valid email address").max(254)]))
  .transform((s) => s || null)
  .optional();

export const optionalText = (max: number) =>
  blankable
    .transform((s) =>
      s
        .replace(/[\u0000-\u001F\u007F]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .pipe(z.string().max(max))
    .transform((s) => s || null)
    .optional();

export const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit pincode");

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code");

export const uuidSchema = z.uuid();

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
