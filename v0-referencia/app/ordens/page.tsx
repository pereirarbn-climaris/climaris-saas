"use client"

import { useState } from "react"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  ClipboardList,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  User,
  FileText,
} from "lucide-react"

const statusConfig = {
  rascunho: { label: "Rascunho", color: "bg-slate-100 text-slate-700 border-slate-200" },
  pendente: { label: "Pendente", color: "bg-amber-100 text-amber-700 border-amber-200" },
  aprovada: { label: "Aprovada", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  em_execucao: { label: "Em Execução", color: "bg-blue-100 text-blue-700 border-blue-200" },
  concluida: { label: "Concluída", color: "bg-green-100 text-green-700 border-green-200" },
  cancelada: { label: "Cancelada", color: "bg-red-100 text-red-700 border-red-200" },
}

const mockOrdens = [
  {
    id: 35,
    cliente: "Robson Pereira",
    servico: "Limpeza e higienização da condensadora hi-wall de 12000BTUs",
    status: "aprovada" as const,
    dataAgendada: "24/04/2026, 14:50",
    tecnico: "Robson Ferreira",
    total: 170.0,
    createdAt: "22/04/2026",
  },
  {
    id: 34,
    cliente: "Maria Silva",
    servico: "Instalação de ar condicionado split 18000BTUs",
    status: "em_execucao" as const,
    dataAgendada: "24/04/2026, 09:00",
    tecnico: "Carlos Santos",
    total: 450.0,
    createdAt: "20/04/2026",
  },
  {
    id: 33,
    cliente: "João Costa",
    servico: "Manutenção preventiva + limpeza de filtros",
    status: "concluida" as const,
    dataAgendada: "23/04/2026, 16:00",
    tecnico: "Robson Ferreira",
    total: 280.0,
    createdAt: "19/04/2026",
  },
  {
    id: 32,
    cliente: "Ana Oliveira",
    servico: "Reparo de vazamento de gás refrigerante",
    status: "pendente" as const,
    dataAgendada: "25/04/2026, 10:30",
    tecnico: null,
    total: 350.0,
    createdAt: "18/04/2026",
  },
  {
    id: 31,
    cliente: "Pedro Souza",
    servico: "Higienização completa do sistema de climatização",
    status: "rascunho" as const,
    dataAgendada: null,
    tecnico: null,
    total: 220.0,
    createdAt: "17/04/2026",
  },
  {
    id: 30,
    cliente: "Carla Mendes",
    servico: "Instalação de duto para ar condicionado central",
    status: "cancelada" as const,
    dataAgendada: "20/04/2026, 08:00",
    tecnico: "Carlos Santos",
    total: 1200.0,
    createdAt: "15/04/2026",
  },
]

const stats = [
  { label: "Total de OS", value: 156, icon: ClipboardList, color: "text-primary" },
  { label: "Em Aberto", value: 12, icon: Clock, color: "text-amber-600" },
  { label: "Concluídas", value: 138, icon: CheckCircle, color: "text-emerald-600" },
  { label: "Canceladas", value: 6, icon: XCircle, color: "text-red-500" },
]

export default function OrdensPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("todos")

  const filteredOrdens = mockOrdens.filter((ordem) => {
    const matchesSearch =
      ordem.cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ordem.servico.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ordem.id.toString().includes(searchTerm)
    const matchesStatus = statusFilter === "todos" || ordem.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="flex min-h-screen bg-background">
      <DashboardSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activePath="/ordens"
      />

      <div className="flex flex-1 flex-col">
        <DashboardHeader
          companyName="Ar Ideal Climatizadora"
          breadcrumb="Ordens de serviço"
          userName="Robson Pereira"
          userEmail="contato@arideal.com.br"
        />

        <main className="flex-1 p-6">
          <div className="mx-auto max-w-7xl">
            {/* Header */}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Ordens de Serviço</h1>
                <p className="text-muted-foreground">
                  Gerencie todas as ordens de serviço da sua empresa
                </p>
              </div>
              <Link href="/ordens/nova">
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Nova OS
                </Button>
              </Link>
            </div>

            {/* Stats */}
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.map((stat) => (
                <Card key={stat.label}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                      <stat.icon className={`h-6 w-6 ${stat.color}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Filters */}
            <Card className="mb-6">
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por cliente, serviço ou número..."
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os status</SelectItem>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="aprovada">Aprovada</SelectItem>
                    <SelectItem value="em_execucao">Em Execução</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                    <SelectItem value="cancelada">Cancelada</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[80px]">OS</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="hidden lg:table-cell">Serviço</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Agendamento</TableHead>
                      <TableHead className="hidden xl:table-cell">Técnico</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrdens.map((ordem) => (
                      <TableRow key={ordem.id} className="group">
                        <TableCell>
                          <Link
                            href={`/ordens/${ordem.id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            #{ordem.id}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <span className="font-medium">{ordem.cliente}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden max-w-[250px] truncate lg:table-cell">
                          {ordem.servico}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusConfig[ordem.status].color}
                          >
                            {statusConfig[ordem.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {ordem.dataAgendada ? (
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              {ordem.dataAgendada}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {ordem.tecnico || (
                            <span className="text-muted-foreground">Não atribuído</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          R$ {ordem.total.toFixed(2).replace(".", ",")}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem asChild>
                                <Link href={`/ordens/${ordem.id}`} className="flex items-center gap-2">
                                  <Eye className="h-4 w-4" />
                                  Visualizar
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/ordens/${ordem.id}`} className="flex items-center gap-2">
                                  <Edit className="h-4 w-4" />
                                  Editar
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {filteredOrdens.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12">
                    <FileText className="h-12 w-12 text-muted-foreground/50" />
                    <p className="mt-4 text-lg font-medium text-muted-foreground">
                      Nenhuma ordem encontrada
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Tente ajustar os filtros ou criar uma nova OS
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  )
}
