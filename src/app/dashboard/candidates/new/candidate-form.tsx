"use client"

import { useActionState, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import Link from "next/link"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useBerufsbilder } from "@/components/berufsbild-context"
import { CANDIDATE_STATUS_OPTIONS, type CandidateStatusValue } from "@/lib/candidate-status"
import { createCandidateAction, type CreateCandidateState } from "../actions"

const schema = z.object({
  first_name: z.string().min(1, "Pflichtfeld"),
  last_name: z.string().min(1, "Pflichtfeld"),
  email: z.string().email("Ungültige E-Mail").optional().or(z.literal("")),
  phone: z.string().optional(),
  status: z.enum(CANDIDATE_STATUS_OPTIONS.map((o) => o.value) as [CandidateStatusValue, ...CandidateStatusValue[]]),
  notes: z.string().optional(),
  campaign_id: z.string().optional(),
  berufsbild: z.string().optional(),
  plz: z.string().regex(/^\d{5}$/, "PLZ muss 5-stellig sein").optional().or(z.literal("")),
  active_sourcing: z.boolean().optional(),
})

type FormValues = z.infer<typeof schema>

interface Campaign {
  id: string
  title: string
  kind: string
  berufsbild: string | null
  clients: { name: string } | null
}

export function CandidateForm({
  campaigns,
  defaultCampaignId,
  canActiveSource = false,
}: {
  campaigns: Campaign[]
  defaultCampaignId?: string
  // Haken "Active Sourcing" (Paket 89): nur Admins und Team "Sales Recruiting + Active Sourcing".
  canActiveSource?: boolean
}) {
  const bb = useBerufsbilder()
  const [state, formAction] = useActionState<CreateCandidateState, FormData>(
    createCandidateAction,
    null
  )
  const [pending, startTransition] = useTransition()

  // Aus einer Kanzlei-Kampagne (Paket 53): Kandidat wird ihr zugeordnet - Kanzleien sehen nur
  // vorqualifizierte, daher Status vorbelegt; Berufsbild aus der Kampagne.
  const defaultCampaign = campaigns.find((c) => c.id === defaultCampaignId)
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: defaultCampaign?.kind === "kanzlei" ? "vorqualifiziert" : "neu",
      campaign_id: defaultCampaignId ?? "",
      berufsbild: defaultCampaign?.berufsbild ?? "",
    },
  })
  const [campaignId, status, activeSourcing] = useWatch({ control, name: ["campaign_id", "status", "active_sourcing"] })
  const selectedCampaign = campaigns.find((c) => c.id === campaignId)
  const isKanzlei = selectedCampaign?.kind === "kanzlei"
  const statusIsAssignable = status === "vorqualifiziert"

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
    if (values.berufsbild) fd.append("berufsbild", values.berufsbild)
    if (values.plz) fd.append("plz", values.plz)
    if (canActiveSource && values.active_sourcing) fd.append("active_sourcing", "1")
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Vorname" required error={errors.first_name?.message}>
          <Input id="first_name" {...register("first_name")} placeholder="Max" />
        </Field>
        <Field label="Nachname" required error={errors.last_name?.message}>
          <Input id="last_name" {...register("last_name")} placeholder="Mustermann" />
        </Field>
      </div>

      {canActiveSource && (
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5" style={{ borderColor: activeSourcing ? "#c7d2fe" : "#dde3ea", backgroundColor: activeSourcing ? "#eef2ff" : "white" }}>
          <input type="checkbox" className="mt-0.5 h-4 w-4" {...register("active_sourcing")} />
          <span className="text-sm text-gray-800">
            Kandidat aus Active Sourcing
            <span className="block text-xs text-gray-500">
              Herkunft „Active Sourcing“ mit Tag. Sichtbar nur für Admins und das Team „Sales Recruiting + Active Sourcing“.
              {activeSourcing && !isKanzlei && campaignId ? " Eine Lead-Kampagne wird dann nicht als Herkunft gespeichert." : ""}
            </span>
          </span>
        </label>
      )}

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
        {isKanzlei && (
          <span className="text-xs" style={{ color: statusIsAssignable ? "#6b7280" : "#b45309" }}>
            {statusIsAssignable
              ? `Der Kandidat wird der Kampagne zugeordnet und erscheint bei ${selectedCampaign?.clients?.name ?? "der Kanzlei"}.`
              : "Kanzleien sehen nur vorqualifizierte Kandidaten – bitte den Status „Vorqualifiziert“ wählen."}
          </span>
        )}
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          {CANDIDATE_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Berufsbild" error={errors.berufsbild?.message}>
          <select
            id="berufsbild"
            {...register("berufsbild")}
            className="flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            style={{ borderColor: "#dde3ea", backgroundColor: "white" }}
          >
            <option value="">Kein Berufsbild</option>
            {bb.choices().map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="PLZ" error={errors.plz?.message}>
          <Input
            id="plz"
            {...register("plz")}
            placeholder="10115"
            maxLength={5}
            inputMode="numeric"
          />
        </Field>
      </div>

      <Field label="Beschreibung" error={errors.notes?.message}>
        <textarea
          id="notes"
          {...register("notes")}
          rows={3}
          placeholder="Kurzprofil, Gesprächsnotizen …"
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
