"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  User,
  FileText,
  Phone,
  MapPin,
  AlertCircle,
  Search,
  ChevronRight,
} from "lucide-react"

interface Cliente {
  nome: string
  documento: string
  contato: string
  endereco: string
}

const statusConfig = {
  rascunho: { label: "Rascunho", color: "bg-slate-100 text-slate-700" },
  pendente: { label: "Pendente", color: "bg-amber-100 text-amber-700" },
  aprovada: { label: "Aprovada", color: "bg-emerald-100 text-emerald-700" },
  em_execucao: { label: "Em Execução", color: "bg-blue-100 text-blue-700" },
  concluida: { label: "Concluída", color: "bg-green-100 text-green-700" },
  cancelada: { label: "Cancelada", color: "bg-red-100 text-red-700" },
}

interface OSDadosIniciaisProps {
  cliente: Cliente | null
  status: keyof typeof statusConfig
  observacoes: string
  isEditing?: boolean
}

export function OSDadosIniciais({
  cliente,
  status,
  observacoes,
  isEditing = false,
}: OSDadosIniciaisProps) {
  return (
    <div className="space-y-6">
      {/* Dados Principais */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-muted-foreground">
            <User className="h-4 w-4" />
            Dados Principais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Cliente e Status */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Cliente</label>
              {isEditing ? (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar cliente..."
                    className="pl-9"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <span className="font-medium">{cliente?.nome}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Status</label>
              {isEditing ? (
                <Select defaultValue={status}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="aprovada">Aprovada</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <Badge variant="secondary" className={statusConfig[status].color}>
                    {statusConfig[status].label}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Documento e Contato */}
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileText className="h-4 w-4" />
                Documento
              </label>
              {isEditing ? (
                <Input placeholder="CPF ou CNPJ" />
              ) : (
                <p className="rounded-lg border border-border bg-muted/30 p-3 font-mono text-sm">
                  {cliente?.documento || "-"}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Phone className="h-4 w-4" />
                Contato
              </label>
              {isEditing ? (
                <Input placeholder="Telefone" />
              ) : (
                <p className="rounded-lg border border-border bg-muted/30 p-3">
                  {cliente?.contato || "-"}
                </p>
              )}
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <MapPin className="h-4 w-4" />
              Endereço
            </label>
            {isEditing ? (
              <Input placeholder="Endereço completo" />
            ) : (
              <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                {cliente?.endereco || "-"}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Observações */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-muted-foreground">
            Observações
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <Textarea
              placeholder="Informações importantes para a equipe e para o atendimento."
              className="min-h-[120px] resize-none"
            />
          ) : (
            <div className="min-h-[80px] rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              {observacoes || "Nenhuma observação adicionada."}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Alert */}
      <Alert className="border-primary/20 bg-primary/5">
        <AlertCircle className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm text-primary">
          Preencha os dados principais da OS e avance para incluir serviços e produtos.
        </AlertDescription>
      </Alert>

      {/* Action Button for editing */}
      {isEditing && (
        <div className="flex justify-end">
          <Button>Salvar e continuar</Button>
        </div>
      )}
    </div>
  )
}
