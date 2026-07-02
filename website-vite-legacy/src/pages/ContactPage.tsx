import { Mail, MessageSquare, Phone } from "lucide-react";
import { ContactForm } from "../components/ContactForm";

export function ContactPage() {
  return (
    <>
      <section className="border-b border-border bg-surface-elevated">
        <div className="section-container py-14 lg:py-16">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary">
            Contato
          </p>
          <h1 className="mb-4 max-w-3xl text-4xl font-bold tracking-tight text-text">
            Solicite um orçamento
          </h1>
          <p className="max-w-2xl text-lg text-text-muted">
            Preencha o formulário e nossa equipe retorna em breve. Seus dados ficam centralizados
            no Climaris para acompanhamento comercial.
          </p>
        </div>
      </section>

      <section className="section-container py-16">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <aside className="space-y-6">
            <div className="rounded-card border border-border bg-surface-elevated p-6 shadow-card">
              <h2 className="mb-4 text-lg font-semibold text-text">Fale conosco</h2>
              <ul className="space-y-4 text-sm text-text-muted">
                <li className="flex gap-3">
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-text">E-mail</p>
                    <a href="mailto:contato@climaris.com.br" className="hover:text-primary">
                      contato@climaris.com.br
                    </a>
                  </div>
                </li>
                <li className="flex gap-3">
                  <MessageSquare className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-text">Comercial</p>
                    <p>Atendimento para novas empresas e migração de sistemas.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <Phone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <p className="font-medium text-text">Já é cliente?</p>
                    <a
                      href={import.meta.env.VITE_APP_URL ?? "https://app.climaris.com.br"}
                      className="text-primary hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Acesse o sistema
                    </a>
                  </div>
                </li>
              </ul>
            </div>

            <div className="rounded-card border border-primary/15 bg-primary/5 p-6">
              <p className="text-sm leading-relaxed text-text-muted">
                Ao enviar o formulário, você concorda em ser contatado pela equipe Climaris sobre
                nossos produtos e serviços.
              </p>
            </div>
          </aside>

          <div className="rounded-card border border-border bg-surface-elevated p-6 shadow-card sm:p-8">
            <ContactForm />
          </div>
        </div>
      </section>
    </>
  );
}
