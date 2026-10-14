// Form rules for trip updates (shared by browser and server).
import { z } from "zod";
import { TRIP_STATUS, type TripStatus } from "./config";

const blankToNull = (max: number) => z.string().trim().max(max, `Keep it under ${max} characters.`).optional().transform((v) => (v ? v : null));
const passengers = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => (v === undefined || v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 1000), "Enter a number from 0 to 1000.");

export const tripSchema = z.object({
  name: z.string().trim().min(2, "Name the trip, e.g. “Van 1 — Tagum delegates”.").max(120),
  origin: blankToNull(120),
  destination: blankToNull(120),
  driver: blankToNull(120),
  passengers,
});

export const tripUpdateSchema = z.object({
  status: z.enum(Object.keys(TRIP_STATUS) as [TripStatus, ...TripStatus[]], { error: "Choose where the trip is." }),
  location: blankToNull(200),
  note: blankToNull(500),
  passengers,
  lat: z.number().min(-90).max(90).nullish().transform((v) => v ?? null),
  lng: z.number().min(-180).max(180).nullish().transform((v) => v ?? null),
});

export const mapLink = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
