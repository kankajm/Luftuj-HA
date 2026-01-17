import { Card, Container, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useDashboardStatus } from "../hooks/useDashboardStatus";
import { StatusCard } from "../components/dashboard/StatusCard";
import { HruStatusCard } from "../components/dashboard/HruStatusCard";

export function DashboardPage() {
  const { t } = useTranslation();
  const { haStatus, haLoading, modbusStatus, hruStatus } = useDashboardStatus();

  function getHaStatusType() {
    if (haLoading) return "neutral";
    if (haStatus === "connected") return "success";
    if (haStatus === "connecting") return "warning";
    return "error";
  }

  function getModbusStatusType() {
    if (modbusStatus === "loading") return "neutral";
    if (modbusStatus === "reachable") return "success";
    return "error";
  }

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Title order={2}>{t("dashboard.title")}</Title>

        <StatusCard
          title={t("dashboard.haStatusTitle", { defaultValue: "Home Assistant" })}
          description={t("dashboard.haStatusDescription", {
            defaultValue: "Backend connection to Home Assistant WebSocket",
          })}
          status={getHaStatusType()}
          statusLabel={
            haLoading ? t("dashboard.haStatus.loading") : t(`dashboard.haStatus.${haStatus}`)
          }
        />

        <StatusCard
          title={t("dashboard.modbusStatusTitle", { defaultValue: "Modbus TCP" })}
          description={t("dashboard.modbusStatusDescription", {
            defaultValue: "Reachability of the configured Modbus TCP server",
          })}
          status={getModbusStatusType()}
          statusLabel={
            modbusStatus === "loading"
              ? t("dashboard.haStatus.loading")
              : modbusStatus === "reachable"
                ? t("dashboard.modbusStatus.reachable")
                : t("dashboard.modbusStatus.unreachable")
          }
        />

        <HruStatusCard status={hruStatus} t={t} />

        <Card shadow="sm" padding="lg" withBorder>
          <Text c="dimmed">{t("dashboard.placeholder")}</Text>
        </Card>
      </Stack>
    </Container>
  );
}
