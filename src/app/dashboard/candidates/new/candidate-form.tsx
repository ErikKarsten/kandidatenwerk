"use client"

import { useActionState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { createCandidateAction, type CreateCandidateState } from "../actions"

const schema = z.object({
  first_name: z.string().min(1, "Pflichtfeld"),
  last_name: z.string().min(1, "Pflichtfeld"),
  email: z.string().email("Ungültige E-Mail").optional().or(z.literal("")),
  phone: z.string().optional(),
  status: z.enum(["neu", "interview", "vorgestellt", "platziert", "abgelehnt"]),
  notes: z.string().optional(),
  campaign_id: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Campaign {
  id: string
  title: string
  clients: { name: string } | null
}

export function CandidateForm({
  campaigns,
  defaultCampaignId,
}: {
  campaigns: Campaign[]
  defaultCampaignId?: string
}) {
  const [state, formAction] = useActionState<CreateCandidateState, FormData>(
    createCandidateAction,
    null
  )
  const [pending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: "neu",
      campaign_id: defaultCampaignId ?? "",
    },
  })

  const cancelHref = defaultCampaignId
    ? `/dashboard/campaigns/${defaultCampaignId}`
    : "/dashboard/candidates"

  function onSubmit(values: FormValues) {
    const fd = new FormData()
    fd.append("first_name", values.first_name)
    fd.append("last_name", values.last_name)
    fd.append("status", values.status)
    if (values.email) fd.append("email", values.email)
    if (values.phone) fd.append("phone", values.phone)
    if (values.notes) fd.append("notes", values.notes)
    if (values.campaign_id) fd.append("campaign_id", values.campaign_id)
    fd.append(
      "redirect_to",
      values.campaign_id
        ? `/dashboard/campaigns/${values.campaign_id}`
        : "/dashboard/candidates"
    )
    startTransition(() => formAction(fd))
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Vorname" required error={errors.first_name?.message}>
          <Input id="first_name" {...register("first_name")} placeholder="Max" />
        </Field>
        <Field label="Nachname" required error={errors.last_name?.message}>
          <Input id="last_name" {...register("last_name")} placeholder="Mustermann" />
        </Field>
      </div>

      <Field label="Kampagne" error={errors.campaign_id?.message}>
        <select
          id="campaign_id"
          {...register("campaign_id")}
          className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          style={{ borderColor: "#dde3ea", backgroundColor: "white" }}
        >
          <option value="">Keine Kampagne</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}{c.clients?.name ? ` (${c.clients.name})` : ""}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="E-Mail" error={errors.email?.message}>
          <Input id="email" type="email" {...register("email")} placeholder="max@example.de" />
        </Field>
        <Field label="Telefon" error={errors.phone?.message}>
          <Input id="phone" type="tel" {...register("phone")} placeholder="+49 151 12345678" />
        </Field>
      </div>

      <Field label="Status" error={errors.status?.message}>
        <select
          id="status"
          {...register("status")}
          className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          style={{ borderColor: "#dde3ea", backgroundColor: "white" }}
        >
          <option value="neu">Neu</option>
          <option value="interview">Interview</option>
          <option value="vorgestellt">Vorgestellt</option>
          <option value="platziert">Platziert</option>
          <option value="abgelehnt">Abgelehnt</option>
        </select>
      </Field>

      <Field label="Notizen" error={errors.notes?.message}>
        <textarea
          id="notes"
          {...register("notes")}
          rows={3}
          placeholder="Interne Notizen zum Kandidaten…"
          className="flex w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          style={{ borderColor: "#dde3ea" }}
        />
      </Field>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending} style={{ backgroundColor: "#1e56a0" }}>
          {pending ? "Wird gespeichert…" : "Kandidat anlegen"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href={cancelHref}>Abbrechen</Link>
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
