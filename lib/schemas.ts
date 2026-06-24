import { z } from 'zod';

// ============================================================
// KANDIDATEN-REGISTRIERUNG (Anmeldung)
// ============================================================
export const candidateSignupSchema = z.object({
  email: z
    .string('Email muss ein Text sein')
    .email('Das ist keine gültige Email!'),
  
  firstName: z
    .string('Name muss ein Text sein')
    .min(2, 'Mindestens 2 Buchstaben!')
    .max(50, 'Max. 50 Zeichen!'),
  
  lastName: z
    .string('Name muss ein Text sein')
    .min(2, 'Mindestens 2 Buchstaben!')
    .max(50, 'Max. 50 Zeichen!'),
  
  phone: z
    .string('Telefonnummer muss ein Text sein')
    .regex(/^[\d\s\-+()]{8,}$/, 'Ungültige Telefonnummer!'),
  
  password: z
    .string('Passwort muss ein Text sein')
    .min(12, 'Mindestens 12 Zeichen!')
    .regex(/[A-Z]/, 'Braucht einen Großbuchstaben!')
    .regex(/[0-9]/, 'Braucht eine Nummer!'),
  
  acceptTerms: z
    .boolean('Das muss true/false sein')
    .refine(val => val === true, 'Du musst den Regeln zustimmen!'),
});

// ============================================================
// KANDIDATEN-LOGIN (Anmeldung)
// ============================================================
export const candidateLoginSchema = z.object({
  email: z
    .string('Email muss ein Text sein')
    .email('Das ist keine gültige Email!'),
  
  password: z
    .string('Passwort muss ein Text sein')
    .min(1, 'Passwort erforderlich'),
});

// ============================================================
// JOB-BEWERBUNG
// ============================================================
export const jobApplicationSchema = z.object({
  jobId: z
    .string('Job ID muss ein Text sein')
    .uuid('Das ist keine gültige ID!'),
  
  candidateId: z
    .string('Kandidaten ID muss ein Text sein')
    .uuid('Das ist keine gültige ID!'),
  
  message: z
    .string('Nachricht muss ein Text sein')
    .min(10, 'Mindestens 10 Zeichen!')
    .max(5000, 'Max. 5000 Zeichen!'),
});

// ============================================================
// TypeScript-Typen (Automatisch aus Schemas generiert)
// ============================================================
export type CandidateSignup = z.infer<typeof candidateSignupSchema>;
export type CandidateLogin = z.infer<typeof candidateLoginSchema>;
export type JobApplication = z.infer<typeof jobApplicationSchema>;
