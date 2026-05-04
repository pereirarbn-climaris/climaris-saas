"use client"

import { useState } from "react"
import { ArrowLeft, Trash2, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Orcamento {
  id: string
  numero: string
  status: "enviado" | "aprovado" | "recusado" | "pendente"
  criadoEm: string
}

interface OrdemServico {
  id: string
  numero: string
  titulo: string
  status: "aberta" | "aprovada" | "em_andamento" | "concluida" | "cancelada"
  agendamento: string | null
}

interface ClientEditFormProps {
  clientId: string
  onBack: () => void
}

interface ClientData {
  razaoSocial: string
  tipo: string
  cpfCnpj: string
  nomeFantasia: string
  telefone: string
  whatsapp: string
  email: string
  indicadorIE: string
  inscricaoEstadual: string
  inscricaoMunicipal: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  orcamentos: Orcamento[]
  ordens: OrdemServico[]
}

// Mock data for budgets and service orders - must be defined before mockClientData
const mockOrcamentos: Record<string, Orcamento[]> = {
  "1": [
    { id: "1", numero: "#2", status: "enviado", criadoEm: "20/04/2026, 11:25" },
    { id: "2", numero: "#1", status: "aprovado", criadoEm: "20/04/2026, 11:15" },
  ],
  "2": [],
  "3": [
    { id: "1", numero: "#5", status: "pendente", criadoEm: "18/04/2026, 09:30" },
  ],
}

const mockOrdens: Record<string, OrdemServico[]> = {
  "1": [
    { id: "1", numero: "#15", titulo: "Orçamento - GUERINO & ALMEIDA TRANSPORTES LTDA", status: "aberta", agendamento: null },
    { id: "2", numero: "#13", titulo: "teste", status: "aprovada", agendamento: "22/04/2026, 08:00" },
  ],
  "2": [],
  "3": [
    { id: "1", numero: "#8", titulo: "Manutenção preventiva", status: "em_andamento", agendamento: "25/04/2026, 14:00" },
  ],
}

// Mock data - in production this would come from an API
const mockClientData: Record<string, ClientData> = {
  "1": {
    razaoSocial: "GUERINO & ALMEIDA TRANSPORTES LTDA",
    tipo: "cnpj",
    cpfCnpj: "10.222.758/0001-28",
    nomeFantasia: "Guerial Transportes",
    telefone: "",
    whatsapp: "",
    email: "",
    indicadorIE: "",
    inscricaoEstadual: "",
    inscricaoMunicipal: "",
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    orcamentos: mockOrcamentos["1"],
    ordens: mockOrdens["1"],
  },
  "2": {
    razaoSocial: "Robson Pereira",
    tipo: "cpf",
    cpfCnpj: "123.456.789-00",
    nomeFantasia: "Robson Pereira",
    telefone: "(16)",
    whatsapp: "(11) 98505-1385",
    email: "contato@arideal.com.br",
    indicadorIE: "",
    inscricaoEstadual: "",
    inscricaoMunicipal: "",
    cep: "09820-230",
    logradouro: "Rua Santa Yolanda",
    numero: "14",
    complemento: "",
    bairro: "Vila Santa Angelina",
    cidade: "São Bernardo do Campo",
    uf: "SP",
    orcamentos: mockOrcamentos["2"],
    ordens: mockOrdens["2"],
  },
  "3": {
    razaoSocial: "ZINGARELLI, LOURENCO & BARBOSA SOCIEDADE DE ADVOGADOS",
    tipo: "cnpj",
    cpfCnpj: "12.345.678/0001-90",
    nomeFantasia: "ZLB Advogados",
    telefone: "",
    whatsapp: "(16) 97401-3470",
    email: "",
    indicadorIE: "",
    inscricaoEstadual: "",
    inscricaoMunicipal: "",
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    orcamentos: mockOrcamentos["3"],
    ordens: mockOrdens["3"],
  },
}

export function ClientEditForm({ clientId, onBack }: ClientEditFormProps) {
  const initialData = mockClientData[clientId] || mockClientData["1"]
  
  const [formData, setFormData] = useState<ClientData>(initialData)
  const [activeTab, setActiveTab] = useState("cadastro")

  const handleChange = (field: keyof ClientData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = () => {
    // In production, this would save to an API
    console.log("Saving client data:", formData)
    onBack()
  }

  const handleDelete = () => {
    // In production, this would delete via API
    console.log("Deleting client:", clientId)
    onBack()
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <User className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Editar cliente</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro completo para faturamento e operação (CPF/CNPJ, fiscal, endereço e histórico comercial).
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="h-auto w-auto gap-1 bg-transparent p-0">
          <TabsTrigger
            value="cadastro"
            className="rounded-full border border-transparent px-5 py-2 text-sm font-medium data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Cadastro
          </TabsTrigger>
          <TabsTrigger
            value="orcamentos"
            className="rounded-full border border-border px-5 py-2 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Orçamentos ({formData.orcamentos.length})
          </TabsTrigger>
          <TabsTrigger
            value="os"
            className="rounded-full border border-border px-5 py-2 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            OS ({formData.ordens.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cadastro" className="mt-6 flex flex-col gap-6">
          {/* Identification Section */}
          <Card className="border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary">
                Identificação
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="flex flex-col gap-2">
                <Label htmlFor="razaoSocial" className="text-sm font-medium text-foreground">
                  Razão social / nome
                </Label>
                <Input
                  id="razaoSocial"
                  value={formData.razaoSocial}
                  onChange={(e) => handleChange("razaoSocial", e.target.value)}
                  className="bg-background"
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="tipo" className="text-sm font-medium text-foreground">
                    Tipo
                  </Label>
                  <Select
                    value={formData.tipo}
                    onValueChange={(value) => handleChange("tipo", value)}
                  >
                    <SelectTrigger id="tipo" className="bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cpf">CPF</SelectItem>
                      <SelectItem value="cnpj">CNPJ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cpfCnpj" className="text-sm font-medium text-foreground">
                    CPF / CNPJ
                  </Label>
                  <Input
                    id="cpfCnpj"
                    value={formData.cpfCnpj}
                    onChange={(e) => handleChange("cpfCnpj", e.target.value)}
                    className="bg-background"
                  />
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Com 14 dígitos, preenchemos razão social, fantasia e endereço quando disponível.
              </p>

              <div className="flex flex-col gap-2">
                <Label htmlFor="nomeFantasia" className="text-sm font-medium text-foreground">
                  Nome fantasia
                </Label>
                <Input
                  id="nomeFantasia"
                  value={formData.nomeFantasia}
                  onChange={(e) => handleChange("nomeFantasia", e.target.value)}
                  className="bg-background"
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="telefone" className="text-sm font-medium text-foreground">
                    Telefone
                  </Label>
                  <Input
                    id="telefone"
                    value={formData.telefone}
                    onChange={(e) => handleChange("telefone", e.target.value)}
                    placeholder="(11) 3456-7890 — fixo ou ramal"
                    className="bg-background"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="whatsapp" className="text-sm font-medium text-foreground">
                    WhatsApp
                  </Label>
                  <Input
                    id="whatsapp"
                    value={formData.whatsapp}
                    onChange={(e) => handleChange("whatsapp", e.target.value)}
                    placeholder="(11) 98765-4321 — celular com DDD"
                    className="bg-background"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-sm font-medium text-foreground">
                  E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  className="bg-background"
                />
              </div>
            </CardContent>
          </Card>

          {/* Fiscal Section */}
          <Card className="border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary">
                Fiscal
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                IE e IM quando a prefeitura ou a NF-e exigirem.
              </p>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="indicadorIE" className="text-sm font-medium text-foreground">
                    Indicador IE (NF-e)
                  </Label>
                  <Select
                    value={formData.indicadorIE}
                    onValueChange={(value) => handleChange("indicadorIE", value)}
                  >
                    <SelectTrigger id="indicadorIE" className="bg-background">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contribuinte">Contribuinte ICMS</SelectItem>
                      <SelectItem value="isento">Contribuinte isento</SelectItem>
                      <SelectItem value="naocontribuinte">Não contribuinte</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="inscricaoEstadual" className="text-sm font-medium text-foreground">
                    Inscrição estadual
                  </Label>
                  <Input
                    id="inscricaoEstadual"
                    value={formData.inscricaoEstadual}
                    onChange={(e) => handleChange("inscricaoEstadual", e.target.value)}
                    placeholder="ou ISENTO"
                    className="bg-background"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="inscricaoMunicipal" className="text-sm font-medium text-foreground">
                  Inscrição municipal
                </Label>
                <Input
                  id="inscricaoMunicipal"
                  value={formData.inscricaoMunicipal}
                  onChange={(e) => handleChange("inscricaoMunicipal", e.target.value)}
                  className="bg-background"
                />
              </div>
            </CardContent>
          </Card>

          {/* Address Section */}
          <Card className="border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary">
                Endereço
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="flex flex-col gap-2">
                <Label htmlFor="cep" className="text-sm font-medium text-foreground">
                  CEP
                </Label>
                <Input
                  id="cep"
                  value={formData.cep}
                  onChange={(e) => handleChange("cep", e.target.value)}
                  className="max-w-xs bg-background"
                  maxLength={9}
                />
                <p className="text-sm text-muted-foreground">
                  Ao completar 8 dígitos, logradouro, bairro e cidade são preenchidos pela API.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="logradouro" className="text-sm font-medium text-foreground">
                  Logradouro
                </Label>
                <Input
                  id="logradouro"
                  value={formData.logradouro}
                  onChange={(e) => handleChange("logradouro", e.target.value)}
                  className="bg-background"
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="numero" className="text-sm font-medium text-foreground">
                    Número
                  </Label>
                  <Input
                    id="numero"
                    value={formData.numero}
                    onChange={(e) => handleChange("numero", e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="complemento" className="text-sm font-medium text-foreground">
                    Complemento
                  </Label>
                  <Input
                    id="complemento"
                    value={formData.complemento}
                    onChange={(e) => handleChange("complemento", e.target.value)}
                    className="bg-background"
                  />
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="bairro" className="text-sm font-medium text-foreground">
                    Bairro
                  </Label>
                  <Input
                    id="bairro"
                    value={formData.bairro}
                    onChange={(e) => handleChange("bairro", e.target.value)}
                    className="bg-background"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cidade" className="text-sm font-medium text-foreground">
                    Cidade
                  </Label>
                  <Input
                    id="cidade"
                    value={formData.cidade}
                    onChange={(e) => handleChange("cidade", e.target.value)}
                    className="bg-background"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="uf" className="text-sm font-medium text-foreground">
                  UF
                </Label>
                <Select
                  value={formData.uf}
                  onValueChange={(value) => handleChange("uf", value)}
                >
                  <SelectTrigger id="uf" className="max-w-xs bg-background">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"].map((uf) => (
                      <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orcamentos" className="mt-6">
          <Card className="border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary">
                Orçamentos do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {formData.orcamentos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-muted-foreground">Nenhum orçamento encontrado para este cliente.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Orçamento
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Status
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Criado em
                      </TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.orcamentos.map((orcamento) => (
                      <TableRow key={orcamento.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{orcamento.numero}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              orcamento.status === "aprovado"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : orcamento.status === "enviado"
                                ? "border-sky-200 bg-sky-50 text-sky-700"
                                : orcamento.status === "recusado"
                                ? "border-red-200 bg-red-50 text-red-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }
                          >
                            {orcamento.status === "aprovado" && "Aprovado"}
                            {orcamento.status === "enviado" && "Enviado"}
                            {orcamento.status === "recusado" && "Recusado"}
                            {orcamento.status === "pendente" && "Pendente"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{orcamento.criadoEm}</TableCell>
                        <TableCell>
                          <Button variant="link" className="h-auto p-0 text-primary">
                            Abrir
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="os" className="mt-6">
          <Card className="border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary">
                OS do Cliente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {formData.ordens.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-muted-foreground">Nenhuma ordem de serviço encontrada para este cliente.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[80px] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        OS
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Título
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Status
                      </TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Agendamento
                      </TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formData.ordens.map((ordem) => (
                      <TableRow key={ordem.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{ordem.numero}</TableCell>
                        <TableCell>{ordem.titulo}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              ordem.status === "aberta"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : ordem.status === "aprovada"
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : ordem.status === "em_andamento"
                                ? "border-sky-200 bg-sky-50 text-sky-700"
                                : ordem.status === "concluida"
                                ? "border-slate-200 bg-slate-50 text-slate-700"
                                : "border-red-200 bg-red-50 text-red-700"
                            }
                          >
                            {ordem.status === "aberta" && "Aberta"}
                            {ordem.status === "aprovada" && "Aprovada"}
                            {ordem.status === "em_andamento" && "Em andamento"}
                            {ordem.status === "concluida" && "Concluída"}
                            {ordem.status === "cancelada" && "Cancelada"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {ordem.agendamento || "-"}
                        </TableCell>
                        <TableCell>
                          <Button variant="link" className="h-auto p-0 text-primary">
                            Abrir
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 pb-6">
        <Button
          variant="outline"
          onClick={onBack}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar à lista
        </Button>
        <Button onClick={handleSave} className="bg-primary hover:bg-primary/90">
          Salvar alterações
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="gap-2 border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Excluir cliente
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir cliente</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
