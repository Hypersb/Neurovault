export const dynamic = 'force-dynamic'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--primary))] mb-4">
            <span className="text-lg font-bold text-[hsl(var(--primary-foreground))]">N</span>
          </div>
          <h1 className="text-xl font-semibold">NeuroVault</h1>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
            AI Cognitive Infrastructure
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}
