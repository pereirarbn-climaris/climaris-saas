"use client"

import { useRouter } from "next/navigation"
import { ChevronRight, Copy, Clock, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface Service {
  id: string
  nome: string
  descricao: string
  tempoExecucao: string
  preco: number
  custoMateriais: number
  lucroEstimado: number
  margemPercentual: number
  status: "ativo" | "inativo"
}

const mockServices: Service[] = [
  {
    id: "1",
    nome: "Instalação de ar-condicionado hi-wall de até 12000BTUs",
    descricao: "Instalação completa com materiais básicos inclusos",
    tempoExecucao: "4h",
    preco: 600.00,
    custoMateriais: 248.83,
    lucroEstimado: 351.17,
    margemPercentual: 58.5,
    status: "ativo",
  },
  {
    id: "2",
    nome: "Limpeza e higienização da condensadora hi-wall de 12000BTUs",
    descricao: "Limpeza completa com produtos especializados",
    tempoExecucao: "40min",
    preco: 170.00,
    custoMateriais: 0.00,
    lucroEstimado: 170.00,
    margemPercentual: 100,
    status: "ativo",
  },
  {
    id: "3",
    nome: "Manutenção preventiva split 18000BTUs",
    descricao: "Verificação completa e limpeza de filtros",
    tempoExecucao: "1h 30min",
    preco: 250.00,
    custoMateriais: 35.00,
    lucroEstimado: 215.00,
    margemPercentual: 86,
    status: "ativo",
  },
  {
    id: "4",
    nome: "Instalação de ar-condicionado cassete",
    descricao: "Instalação completa para ambientes comerciais",
    tempoExecucao: "6h",
    preco: 1200.00,
    custoMateriais: 450.00,
    lucroEstimado: 750.00,
    margemPercentual: 62.5,
    status: "ativo",
  },
  {
    id: "5",
    nome: "Recarga de gás R410A",
    descricao: "Recarga de gás refrigerante",
    tempoExecucao: "1h",
    preco: 350.00,
    custoMateriais: 180.00,
    lucroEstimado: 170.00,
    margemPercentual: 48.6,
    status: "inativo",
  },
]

export function ServicesTable() {
  const router = useRouter()

  const handleRowClick = (serviceId: string) => {
    router.push(`/servicos/${serviceId}`)
  }

  const formatCurrency = (value: number) => {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    })
  }

  const copyToClipboard = (text: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-[35%] py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Serviço
              </TableHead>
              <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Tempo
                </div>
              </TableHead>
              <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                Preço
              </TableHead>
              <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                Custo
              </TableHead>
              <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
                Lucro
              </TableHead>
              <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">
                Status
              </TableHead>
              <TableHead className="w-[100px] py-4"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockServices.map((service) => (
              <TableRow
                key={service.id}
                className="group cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => handleRowClick(service.id)}
              >
                <TableCell className="py-4">
                  <div className="space-y-1">
                    <p className="font-medium text-foreground leading-tight">{service.nome}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{service.descricao}</p>
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 items-center rounded-lg bg-muted/50 px-3">
                      <span className="text-sm font-medium text-foreground">{service.tempoExecucao}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-4 text-right">
                  <span className="text-sm font-semibold text-foreground">
                    {formatCurrency(service.preco)}
                  </span>
                </TableCell>
                <TableCell className="py-4 text-right">
                  <span className="text-sm text-muted-foreground">
                    {formatCurrency(service.custoMateriais)}
                  </span>
                </TableCell>
                <TableCell className="py-4 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-sm font-semibold text-emerald-600">
                      {formatCurrency(service.lucroEstimado)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {service.margemPercentual}% margem
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-4 text-center">
                  <Badge
                    variant="outline"
                    className={
                      service.status === "ativo"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 font-medium"
                        : "border-slate-200 bg-slate-50 text-slate-600 font-medium"
                    }
                  >
                    {service.status === "ativo" ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell className="py-4">
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={(e) => copyToClipboard(service.nome, e)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Copiar nome</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRowClick(service.id) }}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar serviço
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); copyToClipboard(service.nome, e as any) }}>
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicar serviço
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir serviço
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {/* Footer */}
        <div className="border-t border-border/50 bg-muted/20 px-6 py-3">
          <p className="text-sm text-muted-foreground">
            Mostrando <span className="font-medium text-foreground">{mockServices.length}</span> de{" "}
            <span className="font-medium text-foreground">{mockServices.length}</span> serviços
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
