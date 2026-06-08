/** Escopo restrito ao perfil público — sem preflight global. */
export default {
  content: [
    "./src/components/v0-ui/clients/PublicEquipmentProfileView.tsx",
    "./src/components/v0-ui/clients/PublicEquipmentProfileView v2.tsx",
    "./src/app/(dashboard)/pmoc/execucao/[id]/page.tsx",
    "./src/app/(dashboard)/pmoc/conformidade/[id]/page.tsx",
    "./src/components/pmoc/SignaturePad.tsx",
    "./src/components/pmoc/PmocAirAnalysisSection.tsx",
    "./src/components/budget/**/*.{tsx,ts,css}",
    "./src/pages/admin/SettingsBudgets.tsx",
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
};
