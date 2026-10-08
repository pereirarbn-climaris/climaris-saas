"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Wrench,
  Package,
  Plus,
  Clock,
  DollarSign,
  Trash2,
  Search,
} from "lucide-react"

interface Servico {
  id: number
  nome: string
  quantidade: number
  preco: number
  tempo: number
}

interface Produto {
  id: number
  nome: string
  quantidade: number
  preco: number
}

interface OSServicosEProdutosProps {
  servicos: Servico[]
  produtos: Produto[]
  tempoTotal: number
  valorServicos: number
  valorProdutos: number
  valorTotal: number
  isEditing?: boolean
}

export function OSServicosEProdutos({
  servicos,
  produtos,
  tempoTotal,
  valorServicos,
  valorProdutos,
  valorTotal,
  isEditing = false,
}: OSServicosEProdutosProps) {
  return (
    <div className="space-y-6">
      {/* Serviços */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-muted-foreground">
            <Wrench className="h-4 w-4" />
            Serviços da OS
          </CardTitle>
          {isEditing && (
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Adicionar serviço
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {servicos.length > 0 ? (
            <div className="space-y-3">
              {servicos.map((servico) => (
                <div
                  key={servico.id}
                  className="group flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Wrench className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{servico.nome}</p>
                      <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {servico.tempo}min
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          R$ {servico.preco.toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {isEditing ? (
                      <>
                        <Input
                          type="number"
                          defaultValue={servico.quantidade}
                          className="w-20 text-center"
                          min={1}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Badge variant="secondary" className="text-sm font-medium">
                        {servico.quantidade}x
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-8">
              <Wrench className="h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhum serviço adicionado.
              </p>
              {isEditing && (
                <Button variant="outline" size="sm" className="mt-4 gap-2">
                  <Search className="h-4 w-4" />
                  Buscar serviços
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Produtos */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-muted-foreground">
            <Package className="h-4 w-4" />
            Produtos da OS
          </CardTitle>
          {isEditing && (
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Adicionar produto
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {produtos.length > 0 ? (
            <div className="space-y-3">
              {produtos.map((produto) => (
                <div
                  key={produto.id}
                  className="group flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                      <Package className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{produto.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        R$ {produto.preco.toFixed(2).replace(".", ",")} /un
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {isEditing ? (
                      <>
                        <Input
                          type="number"
                          defaultValue={produto.quantidade}
                          className="w-20 text-center"
                          min={1}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Badge variant="secondary" className="text-sm font-medium">
                        {produto.quantidade}x
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-8">
              <Package className="h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhum produto adicionado.
              </p>
              {isEditing && (
                <Button variant="outline" size="sm" className="mt-4 gap-2">
                  <Search className="h-4 w-4" />
                  Buscar produtos
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumo */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold text-muted-foreground">
            Resumo
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-2 divide-x divide-border sm:grid-cols-4">
            {/* Tempo Total */}
            <div className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tempo Total
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">{tempoTotal}min</p>
              <p className="text-xs text-muted-foreground">Base para o horário final</p>
            </div>

            {/* Serviços */}
            <div className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Serviços
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                R$ {valorServicos.toFixed(2).replace(".", ",")}
              </p>
              <p className="text-xs text-muted-foreground">Soma dos serviços da OS</p>
            </div>

            {/* Produtos */}
            <div className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Produtos
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                R$ {valorProdutos.toFixed(2).replace(".", ",")}
              </p>
              <p className="text-xs text-muted-foreground">Soma dos produtos da OS</p>
            </div>

            {/* Total Geral */}
            <div className="bg-primary/5 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">
                Total Geral
              </p>
              <p className="mt-1 text-2xl font-bold text-primary">
                R$ {valorTotal.toFixed(2).replace(".", ",")}
              </p>
              <p className="text-xs text-primary/70">Valor previsto da ordem</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Button for editing */}
      {isEditing && (
        <div className="flex justify-end gap-3">
          <Button variant="outline">Salvar rascunho</Button>
          <Button>Continuar para planejamento</Button>
        </div>
      )}
    </div>
  )
}
