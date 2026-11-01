import { z } from "zod";

export const MESSAGE_MAX = 2000;

const oneLine = (max: number, tooLong: string) =>
  z
    .string()
    .trim()
    .max(max, tooLong)
    .refine((v) => !/[\r\n]/.test(v), "Use a single line");

/** The contact form. Nothing is stored: the message is emailed to the business inbox. */
export const contactSchema = z.object({
  name: oneLine(100, "Keep your name under 100 characters").pipe(z.string().min(1, "Enter your name")),
  email: z.string().trim().toLowerCase().max(254, "Enter a valid email address").pipe(z.email("Enter a valid email address")),
  phone: oneLine(30, "Keep the phone number under 30 characters").transform((v) => v || null),
  message: z
    .string()
    .trim()
    .min(1, "Write a message")
    .max(MESSAGE_MAX, "Keep your message under 2,000 characters"),
});

export type ContactInput = z.infer<typeof contactSchema>;
export type ContactField = keyof ContactInput;
