"use client"

import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface InventoryItem {
  id: string
  productId: string
  produto: string
  sku: string
  saldo: number
  reservado: number
  disponivel: number
  status: "ativo" | "inativo"
}

const inventoryData: InventoryItem[] = [
  { id: "1", productId: "1", produto: "Arruela Liza Zincada 1/4", sku: "ARRUELA-LIZA-7SCD", saldo: 10, reservado: 0, disponivel: 10, status: "ativo" },
  { id: "2", productId: "2", produto: "Bomba de água EOS", sku: "BOMBA-DE-AGU-C4O2", saldo: 0, reservado: 0, disponivel: 0, status: "ativo" },
  { id: "3", productId: "3", produto: "Bucha de Plastico 08 c/ Anel", sku: "BUCHA-DE-PLA-Z350", saldo: 0, reservado: 0, disponivel: 0, status: "ativo" },
  { id: "4", productId: "4", produto: "Cabo de comando 100 cobre PP4×1,5", sku: "CABO-DE-COMA-P0YS", saldo: 0, reservado: 4, disponivel: -4, status: "ativo" },
  { id: "5", productId: "5", produto: "Cabo de comando 100 cobre PP4×2,5", sku: "CABO-DE-COMA-NJ7H", saldo: 0, reservado: 0, disponivel: 0, status: "ativo" },
  { id: "6", productId: "6", produto: "Cabo de comando 100 cobre PP5×1,5mm", sku: "CABO-DE-COMA-1AJ8", saldo: 0, reservado: 0, disponivel: 0, status: "ativo" },
  { id: "7", productId: "7", produto: "Fita PVC Branca 10mmx10m", sku: "FITA-PVC-BRA-WE6L", saldo: 0, reservado: 2, disponivel: -2, status: "ativo" },
  { id: "8", productId: "8", produto: "Mangueira Crista 3/8", sku: "MANGUEIRA-CR-22D5", saldo: 0, reservado: 6, disponivel: -6, status: "ativo" },
  { id: "9", productId: "9", produto: "Parafuso Sextavado Rosca Soberba 1/450mm", sku: "PARAFUSO-SEX-9KYO", saldo: 0, reservado: 12, disponivel: -12, status: "ativo" },
  { id: "10", productId: "10", produto: "Parafuso Sextavado Rosca Soberba 3/16×55mm", sku: "PARAFUSO-SEX-UDS9", saldo: 0, reservado: 8, disponivel: -8, status: "ativo" },
  { id: "11", productId: "11", produto: "Suporte Condensadora 430mm", sku: "SUPORTE-COND-4NO2", saldo: 0, reservado: 2, disponivel: -2, status: "ativo" },
  { id: "12", productId: "12", produto: "Tubo Isolante de Poliester 1/2 Branco", sku: "TUBO-ISOLANT-89Q5", saldo: 0, reservado: 0, disponivel: 0, status: "ativo" },
  { id: "13", productId: "13", produto: "Tubo Isolante de Poliester 1/4 Branco", sku: "TUBO-ISOLANT-EQ1U", saldo: 0, reservado: 4, disponivel: -4, status: "ativo" },
  { id: "14", productId: "14", produto: "Tubo Isolante de Poliester 3/8 Branco", sku: "TUBO-ISOLANT-NZYB", saldo: 0, reservado: 4, disponivel: -4, status: "ativo" },
  { id: "15", productId: "15", produto: "Tubo de Cobre 1/4", sku: "TUBO-DE-COBR-D618", saldo: 0, reservado: 6, disponivel: -6, status: "ativo" },
]

export function InventoryTable() {
  return (
    <Card className="border-border">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Produto
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  SKU
                </TableHead>
                <TableHead className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Saldo
                </TableHead>
                <TableHead className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Reservado
                </TableHead>
                <TableHead className="text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Disponível
                </TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inventoryData.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium text-foreground">
                    {item.produto}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {item.sku}
                  </TableCell>
                  <TableCell className="text-center text-foreground">
                    {item.saldo}
                  </TableCell>
                  <TableCell className="text-center text-foreground">
                    {item.reservado}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-center font-medium",
                      item.disponivel < 0 ? "text-red-500" : "text-foreground"
                    )}
                  >
                    {item.disponivel}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {item.status === "ativo" ? "Ativo" : "Inativo"}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/produtos/${item.productId}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Editar cadastro
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
