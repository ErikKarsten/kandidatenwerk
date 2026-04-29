import { Briefcase } from "lucide-react"
import { LoginForm } from "./login-form"

export const metadata = {
  title: "Anmelden – Kandidatenwerk",
}

export default function LoginPage() {
  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ backgroundColor: "#f0f4f8" }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: "#0f2137" }}
          >
            <Briefcase size={22} style={{ color: "#4ba3c3" }} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900">Kandidatenwerk</h1>
            <p className="mt-1 text-sm text-gray-500">Melde dich mit deinem Account an</p>
          </div>
        </div>

        <div
          className="rounded-2xl border bg-white p-6 shadow-sm"
          style={{ borderColor: "#dde3ea" }}
        >
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
