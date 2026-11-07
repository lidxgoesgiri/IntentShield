import { Bot, CircleCheck, CircleSlash, KeyRound, Server, ShieldCheck, Waypoints } from "lucide-react";
import { SECURITY_COPY } from "../config/section-copy";
import { SectionHeader } from "./section-header";

const ARCHITECTURE = [
  { icon: KeyRound, title: "Wallet-owned keys", body: "Your wallet signs via Wallet Standard. The app never sees a key or seed phrase." },
  { icon: ShieldCheck, title: "Client verifier", body: "Pure, deterministic checks of the exact message, in your browser." },
  { icon: Waypoints, title: "Solana Devnet RPC", body: "Blockhash, balance, fee, simulation, broadcast, confirmation." },
  { icon: Server, title: "Server-only AI API", body: "Drafts and explanations only. Keys stay on the server; output is untrusted." },
] as const;

/** S06 — Security Architecture: "Trust the checks, not the glow." Limits visible without hover. */
export function SecurityArchitecture() {
  return (
    <section id="security" data-atmosphere="0.35" aria-labelledby="security-title" className="border-t border-hairline">
      <div className="page-container py-[clamp(64px,11vw,168px)]">
        <SectionHeader index="06" eyebrow="Security architecture" title={SECURITY_COPY.title} titleId="security-title" lead={SECURITY_COPY.lead} split="lines" />

        <div className="mt-16 grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-hairline lg:mt-24 lg:grid-cols-3">
          <Column
            icon={<CircleCheck className="size-5 text-mint" aria-hidden />}
            label="Verified by the app"
            note="Deterministic. Decides whether signing unlocks."
            items={SECURITY_COPY.verified}
          />
          <Column
            icon={<Bot className="size-5 text-silver" aria-hidden />}
            label="Explained by AI"
            note="Interpretation only. Never a security decision."
            items={SECURITY_COPY.explained}
          />
          <Column
            icon={<CircleSlash className="size-5 text-warning" aria-hidden />}
            label="Not verified"
            note="Outside what any intent check can prove."
            items={SECURITY_COPY.notVerified}
          />
        </div>

        <div className="mt-16" data-reveal="stagger">
          <p className="type-eyebrow mb-6">Trust boundaries</p>
          <ol className="grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
            {ARCHITECTURE.map((node, index) => {
              const Icon = node.icon;
              return (
                <li key={node.title} className="relative space-y-3 bg-obsidian p-6">
                  <div className="flex items-center justify-between">
                    <Icon className="size-5 text-mint" aria-hidden />
                    <span className="font-mono text-[0.72rem] text-muted">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <h3 className="font-heading text-lg font-semibold text-white">{node.title}</h3>
                  <p className="text-[0.925rem] text-silver">{node.body}</p>
                </li>
              );
            })}
          </ol>
          <p className="type-caption mt-4">
            No audit, certification, or partnership is claimed. Solana Explorer proof verifies an on-chain result, not the safety of
            a recipient.
          </p>
        </div>
      </div>
    </section>
  );
}

function Column({ icon, label, note, items }: { icon: React.ReactNode; label: string; note: string; items: readonly string[] }) {
  return (
    <div className="space-y-5 bg-obsidian p-6 sm:p-8" data-reveal="">
      <div className="space-y-2">
        <h3 className="flex items-center gap-2.5 font-heading text-xl font-semibold text-white">
          {icon}
          {label}
        </h3>
        <p className="text-[0.875rem] text-muted">{note}</p>
      </div>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-[0.95rem] text-silver">
            <span aria-hidden className="mt-[0.7em] h-px w-3 shrink-0 bg-silver/40" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
