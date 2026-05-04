"use client"

import { useRouter } from "next/navigation"
import { ChevronRight, Copy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
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

interface Product {
  id: string
  nome: string
  sku: string
  compra: number
  venda: number
  margem: number
  status: "ativo" | "inativo"
}

const mockProducts: Product[] = [
  { id: "1", nome: "Arruela Liza Zincada 1/4", sku: "ARRUELA-LIZA-7SCD", compra: 0.30, venda: 0.60, margem: 0.30, status: "ativo" },
  { id: "2", nome: "Bomba de água EOS", sku: "BOMBA-DE-AGU-C4O2", compra: 220.00, venda: 320.00, margem: 100.00, status: "ativo" },
  { id: "3", nome: "Bucha de Plastico 08 c/ Anel", sku: "BUCHA-DE-PLA-Z350", compra: 0.05, venda: 0.10, margem: 0.05, status: "ativo" },
  { id: "4", nome: "Cabo de comando 100 cobre PP4×1,5", sku: "CABO-DE-COMA-P0YS", compra: 3.25, venda: 7.00, margem: 3.75, status: "ativo" },
  { id: "5", nome: "Cabo de comando 100 cobre PP4×2,5", sku: "CABO-DE-COMA-NJ7H", compra: 15.45, venda: 23.00, margem: 7.55, status: "ativo" },
  { id: "6", nome: "Cabo de comando 100 cobre PP5×1,5mm", sku: "CABO-DE-COMA-1AJ8", compra: 4.20, venda: 10.00, margem: 5.80, status: "ativo" },
  { id: "7", nome: "Fita PVC Branca 10mmx10m", sku: "FITA-PVC-BRA-WE6L", compra: 3.00, venda: 6.00, margem: 3.00, status: "ativo" },
  { id: "8", nome: "Mangueira Crista 3/8", sku: "MANGUEIRA-CR-22D5", compra: 7.10, venda: 15.00, margem: 7.90, status: "ativo" },
  { id: "9", nome: "Parafuso Sextavado Rosca Soberba 1/450mm", sku: "PARAFUSO-SEX-9KYO", compra: 0.85, venda: 1.00, margem: 0.15, status: "ativo" },
  { id: "10", nome: "Parafuso Sextavado Rosca Soberba 3/16×55mm", sku: "PARAFUSO-SEX-UDS9", compra: 0.61, venda: 1.00, margem: 0.39, status: "ativo" },
  { id: "11", nome: "Suporte Condensadora 430mm", sku: "SUPORTE-COND-4NO2", compra: 25.00, venda: 50.00, margem: 25.00, status: "ativo" },
  { id: "12", nome: "Tubo de Cobre 1/4", sku: "TUBO-DE-COBR-D618", compra: 20.67, venda: 40.00, margem: 19.33, status: "ativo" },
  { id: "13", nome: "Tubo de Cobre 3/8", sku: "TUBO-DE-COBR-1FWV", compra: 31.80, venda: 60.00, margem: 28.20, status: "ativo" },
  { id: "14", nome: "Tubo Isolante de Poliester 1/2 Branco", sku: "TUBO-ISOLANT-89Q5", compra: 4.90, venda: 8.00, margem: 3.10, status: "ativo" },
]

function formatCurrency(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}`
}

export function ProductsTable() {
  const router = useRouter()

  const handleRowClick = (productId: string) => {
    router.push(`/produtos/${productId}`)
  }

  const handleCopySku = (e: React.MouseEvent, sku: string) => {
    e.stopPropagation()
    navigator.clipboard.writeText(sku)
  }

  return (
    <Card className="border-border">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Nome
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                SKU
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Compra
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Venda
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Margem
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockProducts.map((product) => (
              <TableRow
                key={product.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleRowClick(product.id)}
              >
                <TableCell className="font-medium">{product.nome}</TableCell>
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {product.sku}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatCurrency(product.compra)}
                </TableCell>
                <TableCell>{formatCurrency(product.venda)}</TableCell>
                <TableCell>{formatCurrency(product.margem)}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      product.status === "ativo"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-red-200 bg-red-50 text-red-700"
                    }
                  >
                    {product.status === "ativo" ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={(e) => handleCopySku(e, product.sku)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Copiar SKU</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <CardFooter className="justify-center border-t border-border py-4">
        <p className="text-sm text-muted-foreground">
          Mostrando {mockProducts.length} de {mockProducts.length} produtos
        </p>
      </CardFooter>
    </Card>
  )
}
