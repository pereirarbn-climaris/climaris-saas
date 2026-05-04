"use client"

import { useRouter } from "next/navigation"
import { ChevronRight, ArrowUpDown } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface Client {
  id: string
  name: string
  shortName: string
  initials: string
  email: string | null
  phone: string | null
  whatsapp: string | null
  status: "Ativo" | "Inativo"
  avatarColor: string
}

const clients: Client[] = [
  {
    id: "1",
    name: "GUERINO & ALMEIDA TRANSPORTES LTDA",
    shortName: "Guerial Transportes",
    initials: "GA",
    email: null,
    phone: null,
    whatsapp: null,
    status: "Inativo",
    avatarColor: "bg-emerald-600",
  },
  {
    id: "2",
    name: "Robson Pereira",
    shortName: "Robson Pereira",
    initials: "RP",
    email: "contato@arideal.com.br",
    phone: "(16)",
    whatsapp: "(11) 98505-1385",
    status: "Ativo",
    avatarColor: "bg-primary",
  },
  {
    id: "3",
    name: "ZINGARELLI, LOURENCO & BARBOSA SOCIEDADE DE ADVOGADOS",
    shortName: "ZLB Advogados",
    initials: "ZL",
    email: null,
    phone: null,
    whatsapp: "(16) 97401-3470",
    status: "Ativo",
    avatarColor: "bg-amber-500",
  },
]

export function ClientsTable() {
  const router = useRouter()

  const handleRowClick = (clientId: string) => {
    router.push(`/clientes/${clientId}`)
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[400px]">
              <button className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider">
                Nome
                <ArrowUpDown className="h-3 w-3" />
              </button>
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider">
              E-mail
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider">
              Telefone
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider">
              WhatsApp
            </TableHead>
            <TableHead className="text-xs font-medium uppercase tracking-wider">
              Status
            </TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <TableRow
              key={client.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => handleRowClick(client.id)}
            >
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback
                      className={`${client.avatarColor} text-xs font-medium text-white`}
                    >
                      {client.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-foreground">{client.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {client.shortName}
                    </p>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {client.email || "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {client.phone || "—"}
              </TableCell>
              <TableCell>
                {client.whatsapp ? (
                  <a
                    href={`https://wa.me/${client.whatsapp.replace(/\D/g, "")}`}
                    className="text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {client.whatsapp}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <Badge
                  variant={client.status === "Ativo" ? "default" : "secondary"}
                  className={
                    client.status === "Ativo"
                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                      : "bg-muted text-muted-foreground hover:bg-muted"
                  }
                >
                  {client.status}
                </Badge>
              </TableCell>
              <TableCell>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="border-t border-border px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Mostrando {clients.length} de {clients.length} clientes
        </p>
      </div>
    </div>
  )
}
