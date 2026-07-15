"use client"

import { useActionState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"
import { createCampaignAction, type CreateCampaignState } from "../actions"

const schema = z.object({
  title: z.string().min(1, "Pflichtfeld"),
  client_id: z.string().min(1, "Bitte einen Kunden auswählen"),
  description: z.string().optional(),
  status: z.enum(["active", "paused", "completed"]),
  meta_campaign_id: z.string().optional(),
  berufsbild: z.string().optional(),
  plz: z.string().regex(/^\d{5}$/, "PLZ muss 5-stellig sein").optional().or(z.literal("")),
  radius_km: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface Client {
  id: string
  name: string
}

export function CampaignForm({ clients, defaultClientId }: { clients: Client[]; defaultClientId?: string | null }) {
  const [state, formAction] = useActionState<CreateCampaignState, FormData>(
    createCampaignAction,
    null
  )
  const [pending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: "active", client_id: defaultClientId ?? "", radius_km: "25" },
  })

  function onSubmit(values: FormValues) {
    const fd = new FormData()
    fd.append("title", values.title)
    fd.append("client_id", values.client_id)
    fd.append("status", values.status)
    if (values.description) fd.append("description", values.description)
    if (values.meta_campaign_id) fd.append("meta_campaign_id", values.meta_campaign_id)
    if (values.berufsbild) fd.append("berufsbild", values.berufsbild)
    if (values.plz) fd.append("plz", values.plz)
    if (values.radius_km) fd.append("radius_km", values.radius_km)
    startTransition(() => formAction(fd))
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      <Field label="Titel" required error={errors.title?.message}>
        <Input id="title" {...register("title")} placeholder="Herbst-Recruiting 2026" aria-invalid={!!errors.title} />
      </Field>

      <Field label="Kunde" required error={errors.client_id?.message}>
        <select
          id="client_id"
          {...register("client_id")}
          className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          style={{ borderColor: "#dde3ea", backgroundColor: "white" }}
          defaultValue=""
        >
          <option value="" disabled>Kunden auswählen…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {clients.length === 0 && (
          <p className="text-xs text-amber-600">
            Noch kein Kunde angelegt.{" "}
            <Link href="/dashboard/clients/new" className="underline">Kunden anlegen</Link>
          </p>
        )}
      </Field>

      <Field label="Status" error={errors.status?.message}>
        <select
          id="status"
          {...register("status")}
          className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          style={{ borderColor: "#dde3ea", backgroundColor: "white" }}
        >
          <option value="active">Aktiv</option>
          <option value="paused">Pausiert</option>
          <option value="completed">Abgeschlossen</option>
        </select>
      </Field>

      <Field label="Beschreibung" error={errors.description?.message}>
        <textarea
          id="description"
          {...register("description")}
          rows={3}
          placeholder="Kurze Beschreibung der Kampagne…"
          className="flex w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          style={{ borderColor: "#dde3ea" }}
        />
      </Field>

      <Field label="Meta-Kampagnen-ID" error={errors.meta_campaign_id?.message}>
        <Input
          id="meta_campaign_id"
          {...register("meta_campaign_id")}
          placeholder="123456789"
          className="font-mono"
        />
      </Field>

      <Field label="Berufsbild" error={errors.berufsbild?.message}>
        <select
          id="berufsbild"
          {...register("berufsbild")}
          className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          style={{ borderColor: "#dde3ea", backgroundColor: "white" }}
          defaultValue=""
        >
          <option value="">Kein Berufsbild</option>
          {BERUFSBILD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="PLZ" error={errors.plz?.message}>
          <Input
            id="plz"
            {...register("plz")}
            placeholder="10115"
            maxLength={5}
            inputMode="numeric"
          />
        </Field>
        <Field label="Umkreis (km)" error={errors.radius_km?.message}>
          <Input
            id="radius_km"
            type="number"
            {...register("radius_km")}
            placeholder="25"
          />
        </Field>
      </div>

      {state?.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={pending} style={{ backgroundColor: "#1e56a0" }}>
          {pending ? "Wird gespeichert…" : "Kampagne anlegen"}
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/dashboard/campaigns">Abbrechen</Link>
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
