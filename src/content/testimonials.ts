/**
 * Real, permitted reviews only (spec §7 item 11): add one here with the
 * parent's written permission. The home page hides the section while empty.
 */
export interface Testimonial {
  quote: string;
  /** How the parent agreed to be named, e.g. "Parent of a Year 11 student". */
  attribution: string;
}

export const testimonials: Testimonial[] = [];
