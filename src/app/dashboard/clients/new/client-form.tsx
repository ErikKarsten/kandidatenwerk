"use client"

import { useActionState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { createClientAction, type CreateClientState } from "../actions"

const schema = z.object({
  name: z.string().min(1, "Pflichtfeld"),
  contact_name: z.string().optional(),
  contact_email: z.string().email("Ungültige E-Mail-Adresse").or(z.literal("")).optional(),
  phone: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function ClientForm() {
  const [state, formAction] = useActionState<CreateClientState, FormData>(
    createClientAction,
    null
  )
  const [pending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  function onSubmit(values: FormValues) {
    const fd = new FormData()
    fd.append("name", values.name)
    if (values.contact_name) fd.append("contact_name", values.contact_name)
    if (values.contact_email) fd.append("contact_email", values.contact_email)
    if (values.phone) fd.append("phone", values.phone)
    startTransition(() => formAction(fd))
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <Field label="Unternehmensname" required error={errors.name?.message}>
        <Input id="name" {...register("name")} placeholder="Muster GmbH" aria-invalid={!!errors.name} />
      </Field>

      <Field label="Kontaktperson" error={errors.contact_name?.message}>
        <Input id="contact_name" {...register("contact_name")} placeholder="Max Mustermann" />
      </Field>

      <Field label="E-Mail" error={errors.contact_email?.message}>
        <Input
          id="contact_email"
          type="email"
          {...register("contact_email")}
          placeholder="kontakt@muster.de"
          aria-invalid={!!errors.contact_email}
        />
      </Field>

      <Field label="Telefon" error={errors.phone?.message}>
        <Input id="phone" type="tel" {...register("phone")} placeholder="+49 30 123456" />
      </Field>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending} style={{ backgroundColor: "#1e56a0" }}>
          {pending ? "Wird gespeichert…" : "Kunde anlegen"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/dashboard/clients">Abbrechen</Link>
        </Button>
      </div>
    </form>
  )
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
