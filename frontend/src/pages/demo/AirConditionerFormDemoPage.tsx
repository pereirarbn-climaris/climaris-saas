import { AirConditionerForm } from "../../components/v0-ui/equipments/AirConditionerForm";

export function AirConditionerFormDemoPage() {
  const handleSubmit = (data: any) => {
    console.log("[v0] Form submitted:", data);
    alert("Dados salvos com sucesso! (verifique o console para detalhes)");
  };

  const handleCancel = () => {
    console.log("[v0] Form cancelled");
    window.history.back();
  };

  const handleDelete = () => {
    if (confirm("Tem certeza que deseja excluir este equipamento?")) {
      console.log("[v0] Equipment deleted");
      alert("Equipamento excluído!");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AirConditionerForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        onDelete={handleDelete}
        isLoading={false}
      />
    </div>
  );
}
